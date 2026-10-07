import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { callOpenAIMatchProducts, checkOpenAIKey } from "@/lib/aiParse";

// Called right after a contract is saved — checks each product on the
// contract against Item Master (matched by variant name, case/whitespace
// insensitive) so the UI can prompt to create whatever isn't there yet.
// Accepts either the old `productNames: string[]` shape (kept for anything
// still calling that way) or the newer `products: [{productName, model}]`
// shape, which also matches on the contract's separate "model" field — a
// product often doesn't match Item Master by its full productName but its
// model number does, and blindly creating a new item in that case would
// duplicate something that's already there.
export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  // This is a read-only lookup (does products on the contract already exist
  // in Item Master?), not an inventory write — it was previously gated by
  // authorizeInventory's allow_edit_inventory edit-flag, which blocked any
  // role (e.g. Supervisor) that can create contract drafts but was never
  // meant to have full Inventory-edit rights. The "contracts" permission
  // below is the correct gate for this.
  requirePermission(user, "contracts", "You do not have permission to access contracts.");

  const products = Array.isArray(body.products)
    ? body.products
    : (Array.isArray(body.productNames) ? body.productNames.map((n) => ({ productName: n })) : []);
  const cleaned = products.filter((p) => String(p?.productName || "").trim());
  if (cleaned.length === 0) return NextResponse.json({ data: [] });

  const [rows] = await mysqlPool.query(
    `SELECT v.itemVariantId, v.itemId, v.variantName
     FROM inventoryitemvariant v
     WHERE v.isDeleted = 0 AND v.companyGuid = ?`,
    [user.companyId]
  );
  const byName = new Map(rows.map((r) => [String(r.variantName || "").trim().toLowerCase(), r]));
  const norm = (v) => String(v || "").trim().toLowerCase();
  // Alphanumeric-only, no separators — "M208dw" and "208dw" both collapse to
  // a plain digit/letter run, so a model number embedded inside a longer word
  // (contract's "M208dw" containing Item Master's "208dw") still matches via
  // substring instead of requiring the two to be identical whitespace-split
  // tokens. Mirrors matchModelGuid in app/api/orders/draft/route.js, which
  // already matched this way — this endpoint's stricter exact-token check
  // was the one out of sync, causing it to report "not in inventory" for
  // products the draft-creation step would have matched just fine.
  const alnum = (v) => norm(v).replace(/[^a-z0-9]/g, "");
  const tokenizeWords = (v) => norm(v).split(/\s+/).map(alnum).filter(Boolean);

  // The contract's "model" field is often a long free-text description (e.g.
  // "HP LASER 1008A printer with 1 year Warranty") rather than the bare model
  // number Item Master stores ("HP 1008a") — an exact-string match almost
  // never hits. Instead, treat it as a match when every word of the inventory
  // variant name appears as a substring somewhere in the model text. Among
  // multiple such matches, prefer the one with the most words (most specific).
  const findModelMatch = (model) => {
    const blob = alnum(model);
    if (!blob) return null;
    let best = null;
    let bestWordCount = 0;
    for (const r of rows) {
      const words = tokenizeWords(r.variantName);
      if (words.length > 0 && words.every((w) => blob.includes(w))) {
        if (!best || words.length > bestWordCount) {
          best = r;
          bestWordCount = words.length;
        }
      }
    }
    return best;
  };

  const data = cleaned.map(({ productName, model }) => {
    const nameMatch = byName.get(norm(productName));
    if (nameMatch) {
      return {
        productName, exists: true, matchedBy: "name",
        itemVariantId: nameMatch.itemVariantId, itemId: nameMatch.itemId, matchedName: nameMatch.variantName,
      };
    }
    const modelMatch = model ? findModelMatch(model) : null;
    if (modelMatch) {
      return {
        productName, exists: true, matchedBy: "model",
        itemVariantId: modelMatch.itemVariantId, itemId: modelMatch.itemId, matchedName: modelMatch.variantName,
      };
    }
    return { productName, exists: false, matchedBy: null, itemVariantId: null, itemId: null, matchedName: null };
  });

  // Last resort for products neither the name nor the model check found: the
  // same product is sometimes saved under two different names, so ask OpenAI
  // to compare against the closest catalogue entries. Any failure here (no
  // key configured, API error, bad reply) just leaves the product as "not in
  // inventory" — same result as before this step existed. The UI asks the
  // user to confirm an AI match, so a wrong guess is never applied silently.
  try {
    const unmatched = data.map((d, i) => ({ d, i })).filter(({ d }) => !d.exists);
    if (unmatched.length > 0 && rows.length > 0 && (await checkOpenAIKey())) {
      const tokenSet = (v) => new Set(tokenizeWords(v).concat(norm(v).match(/[a-z]+|\d+/g) || []).filter((t) => t.length > 1));
      const rowTokens = rows.map((r) => tokenSet(r.variantName));
      const candidateMap = new Map();
      const aiProducts = unmatched.map(({ d, i }) => {
        const src = cleaned[i];
        const pt = tokenSet(`${src.productName} ${src.model || ""}`);
        rows
          .map((r, idx) => {
            let score = 0;
            for (const t of rowTokens[idx]) if (pt.has(t)) score++;
            return { r, score };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 20)
          .forEach(({ r }) => candidateMap.set(r.itemVariantId, r));
        return { index: i, productName: src.productName, model: src.model || "" };
      });
      if (candidateMap.size > 0) {
        const candidates = Array.from(candidateMap.values()).map((r) => ({ id: r.itemVariantId, name: r.variantName }));
        const { data: ai } = await callOpenAIMatchProducts(aiProducts, candidates, { source: "contracts-check-products", user });
        for (const m of ai?.matches || []) {
          const hit = m?.candidateId ? candidateMap.get(m.candidateId) : null;
          if (hit && data[m.index] && !data[m.index].exists) {
            data[m.index] = {
              productName: data[m.index].productName, exists: true, matchedBy: "ai",
              itemVariantId: hit.itemVariantId, itemId: hit.itemId, matchedName: hit.variantName,
            };
          }
        }
      }
    }
  } catch (err) {
    console.error("[ai] contracts/check-products AI match failed:", err.message);
  }

  return NextResponse.json({ data });
});
