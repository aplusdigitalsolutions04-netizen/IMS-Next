import { randomUUID } from "crypto";
import { getDocumentProxy, extractText } from "unpdf";
import { mysqlPool } from "@/lib/db";
import { isSuperUser, ApiError } from "@/lib/auth";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";
import { createNotification } from "@/lib/notifications";
import { readUploadedFileBuffer } from "@/lib/upload";
import { callOpenAIContract, callOpenAIVisionContract, checkOpenAIKey } from "@/lib/aiParse";

// Shared by app/api/orders/[id]/save-as-contract/route.js (single order) and
// app/api/orders/save-as-contract-bulk/route.js (multi-select) — takes an
// already-existing order (e.g. one entered manually through NewDispatch,
// which never went through the Contracts-upload flow) and saves a
// `contracts` row from it. Links back the same way Contract -> Draft Order
// does — orderid == contractNumber (set below) — see findLinkedOrder in
// app/api/contracts/[id]/route.js — so the two stay findable from each
// other even without an FK.
//
// If the order already has a contract document attached (order_items.
// contractFilename, uploaded via NewDispatch's "GeM Contract" upload), reuse
// the same AI extraction the Contracts-upload flow uses (see
// app/api/contracts/parse/route.js) to fill in fields that don't exist on
// `orders` at all (ministry, department, officeZone, seller details,
// delivery window, etc.), and reuse the same file as the contract's PDF —
// so the saved contract's "Contract Number" link opens that actual document
// instead of falling back to the edit modal.
//
// Throws ApiError on any failure (404 order not found, 409 already saved
// unless `replace`, 403 replace attempted by a non-Admin, 400 no items).
export async function saveOrderAsContract(orderGuid, user, { replace = false } = {}) {
  const [orderRows] = await mysqlPool.query(
    "SELECT * FROM orders WHERE guid=? AND companyGuid=? AND isDeleted=0",
    [orderGuid, user.companyId]
  );
  if (!orderRows.length) throw new ApiError(404, "Order not found");
  const order = orderRows[0];

  if (order.platform !== "GeM") {
    throw new ApiError(400, "Only GeM orders can be saved as contracts.");
  }

  const contractNumber = String(order.orderid || "").trim();
  if (!contractNumber) throw new ApiError(400, "This order has no Order ID to use as the Contract Number");

  // Not scoped to isDeleted=0 — the DB's unique constraint on contractNumber
  // doesn't exclude soft-deleted rows, so a contract that was deleted or
  // replaced earlier (isDeleted=1, invisible in the Contracts list) still
  // occupies this contractNumber and would make a fresh INSERT fail with
  // ER_DUP_ENTRY ("contract already exists") even though nothing shows up
  // for the user to replace. Finding it here (any status) lets both cases
  // — a real active duplicate, and this kind of orphaned phantom row — be
  // handled by reusing its guid below instead of colliding on insert.
  const [[existing]] = await mysqlPool.query(
    "SELECT guid, isDeleted FROM contracts WHERE contractNumber=? AND companyGuid=?",
    [contractNumber, user.companyId]
  );
  if (existing && existing.isDeleted === 0) {
    // 409 (not 400) so callers can tell "already saved — offer to replace"
    // apart from a real validation failure.
    if (!replace) throw new ApiError(409, "A contract is already saved for this order.");
    if (!isSuperUser(user.role)) throw new ApiError(403, "Only an Admin can replace an already-saved contract.");
  }

  // oi.itemVariantId is only populated for draft-confirmed items — regular
  // dispatches (NewDispatch/dispatchHelpers.js) leave it null and resolve
  // the model through the serial instead, so fall back to
  // inventorystockinserial.itemVariantId the same way lib/ordersQuery.js does.
  const [itemRows] = await mysqlPool.query(
    `SELECT oi.itemVariantId, oi.sellingPrice, oi.quantity, oi.contractFilename, itv.variantName, iim.hsnCode, bm.brandName
     FROM order_items oi
     LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid = s.guid AND s.companyGuid = oi.companyGuid
     LEFT JOIN inventoryitemvariant itv ON COALESCE(oi.itemVariantId, s.itemVariantId) = itv.itemVariantId AND itv.companyGuid = oi.companyGuid
     LEFT JOIN inventoryitemmaster iim ON itv.itemId = iim.itemId AND iim.companyGuid = oi.companyGuid
     LEFT JOIN inventorybrandmaster bm ON iim.brandId = bm.brandId AND bm.companyGuid = oi.companyGuid
     WHERE oi.orderGuid=? AND oi.companyGuid=?`,
    [orderGuid, user.companyId]
  );
  if (!itemRows.length) throw new ApiError(400, "This order has no items to save as a contract");

  const orderProducts = itemRows.map((r) => ({
    productName: r.variantName || null,
    brand: r.brandName || null,
    model: r.variantName || null,
    categoryQuadrant: null,
    hsnCode: r.hsnCode || null,
    quantity: Number(r.quantity) || 1,
    unitPrice: Number(r.sellingPrice) || 0,
    totalValue: (Number(r.sellingPrice) || 0) * (Number(r.quantity) || 1),
    itemVariantId: r.itemVariantId || null,
  }));

  // Seller-side details aren't on the order at all — they're the company's
  // own profile, so pull them from `companies` as the fallback for whatever
  // AI extraction (below) doesn't find.
  const [[company]] = await mysqlPool.query(
    "SELECT name, gstNumber FROM companies WHERE guid=?",
    [user.companyId]
  );

  // Best-effort fallback for ministry/department/officeZone/consignee
  // details when there's no contract document to extract from (or
  // extraction fails) — recovered from the platform's custom fields
  // (selling_platform_fields + orders.platformFields) by fuzzy-matching
  // configured field names.
  let fieldFallback = {};
  const rawPlatformFields = order.platformFields
    ? (typeof order.platformFields === "string" ? JSON.parse(order.platformFields) : order.platformFields)
    : null;
  if (rawPlatformFields && Object.keys(rawPlatformFields).length > 0 && order.platform) {
    const [[platformRow]] = await mysqlPool.query("SELECT guid FROM selling_platforms WHERE name=? LIMIT 1", [order.platform]);
    if (platformRow) {
      const [fieldDefs] = await mysqlPool.query("SELECT guid, fieldName FROM selling_platform_fields WHERE platformGuid=?", [platformRow.guid]);
      const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
      const valueFor = (matcher) => {
        const field = fieldDefs.find((f) => matcher(norm(f.fieldName)));
        const value = field ? rawPlatformFields[field.guid] : null;
        return value && String(value).trim() ? String(value).trim() : null;
      };
      fieldFallback = {
        ministry: valueFor((n) => n.includes("ministry")),
        department: valueFor((n) => n.includes("department") || n.includes("dept")),
        officeZone: valueFor((n) => n.includes("zone")),
        consigneeDesignation: valueFor((n) => n.includes("consignee") && n.includes("design")),
        consigneeContact: valueFor((n) => n.includes("consignee") && (n.includes("contact") || n.includes("phone") || n.includes("mobile"))),
        buyerGstin: valueFor((n) => n.includes("gst")),
      };
    }
  }

  // Try AI extraction against the order's uploaded contract document, same
  // as the Contracts-upload flow — this is what fills in fields `orders`
  // simply has no column for (ministry/department/officeZone/seller
  // details/delivery window) and gives an accurate `products` table instead
  // of the coarser one built from order_items above.
  const contractFilename = itemRows.map((r) => r.contractFilename).find(Boolean) || null;
  let extracted = null;
  let tokenUsage = null;
  if (contractFilename && (await checkOpenAIKey())) {
    try {
      const buffer = await readUploadedFileBuffer(contractFilename);
      if (buffer) {
        const [[driveRow]] = await mysqlPool.query("SELECT mimetype FROM drive_files WHERE filename=?", [contractFilename]);
        const mimeType = driveRow?.mimetype || (contractFilename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
        const meta = { source: "orders-save-as-contract", user };
        if (mimeType === "application/pdf") {
          const pdf = await getDocumentProxy(new Uint8Array(buffer));
          const { text: rawText } = await extractText(pdf, { mergePages: true });
          const text = (rawText || "").trim();
          if (text) ({ data: extracted, usage: tokenUsage } = await callOpenAIContract(text, meta));
        } else if (mimeType.startsWith("image/")) {
          const base64 = buffer.toString("base64");
          ({ data: extracted, usage: tokenUsage } = await callOpenAIVisionContract(base64, mimeType, meta));
        }
      }
    } catch (err) {
      // Best-effort — a broken/unreadable attached document shouldn't block
      // saving the order into Contracts, just fall back to order-derived data.
      console.error("[orderToContract] AI extraction failed:", err.message);
    }
  }

  const products = extracted?.products?.length ? extracted.products : orderProducts;

  // Reuse the existing row's guid (active-being-replaced, or an orphaned
  // soft-deleted phantom found above) instead of always inserting a new
  // one — a fresh INSERT would collide with either on contractNumber's
  // unique constraint.
  const guid = existing?.guid || randomUUID();
  const values = [
    extracted?.bidNumber || order.bidNumber || null,
    contractNumber,
    extracted?.generatedDate || order.orderDate || null,
    extracted?.buyerContact || order.contactNumber || null,
    JSON.stringify(products),
    extracted?.buyerEmail || order.buyerEmail || null,
    extracted?.buyerGstin || order.gstNumber || fieldFallback.buyerGstin || null,
    extracted?.buyerAddress || order.buyerAddress || null,
    extracted?.deliveryStartAfter || null,
    extracted?.deliveryCompletedBy || null,
    extracted?.deliveryInstructions || null,
    extracted?.organisation || order.customerName || null,
    extracted?.ministry || fieldFallback.ministry || null,
    extracted?.department || fieldFallback.department || null,
    extracted?.officeZone || fieldFallback.officeZone || null,
    extracted?.sellerCompany || company?.name || null,
    extracted?.sellerContact || null,
    extracted?.sellerGstin || company?.gstNumber || null,
    extracted?.consigneeDesignation || fieldFallback.consigneeDesignation || null,
    extracted?.consigneeEmail || order.consigneeEmail || null,
    extracted?.consigneeContact || fieldFallback.consigneeContact || null,
    extracted?.consigneeAddress || order.shippingAddress || order.address || null,
    contractFilename || null,
    tokenUsage?.promptTokens ?? null, tokenUsage?.completionTokens ?? null, tokenUsage?.totalTokens ?? null,
  ];

  try {
    if (existing) {
      await mysqlPool.query(
        `UPDATE contracts SET
          bidNumber=?, contractNumber=?, generatedDate=?, buyerContact=?, products=?, buyerEmail=?, buyerGstin=?,
          buyerAddress=?, deliveryStartAfter=?, deliveryCompletedBy=?, deliveryInstructions=?, organisation=?, ministry=?, department=?, officeZone=?,
          sellerCompany=?, sellerContact=?, sellerGstin=?, consigneeDesignation=?, consigneeEmail=?, consigneeContact=?, consigneeAddress=?,
          pdfFilename=?, aiPromptTokens=?, aiCompletionTokens=?, aiTotalTokens=?,
          isDeleted=0, createdBy=?, modifiedBy=?, modifiedAt=NOW()
         WHERE guid=? AND companyGuid=?`,
        [...values, user.username || user.fullName || "Unknown", user.username || user.fullName || "Unknown", guid, user.companyId]
      );
    } else {
      await mysqlPool.query(
        `INSERT INTO contracts (
          guid, companyGuid, bidNumber, contractNumber, generatedDate, buyerContact, products, buyerEmail, buyerGstin,
          buyerAddress, deliveryStartAfter, deliveryCompletedBy, deliveryInstructions, organisation, ministry, department, officeZone,
          sellerCompany, sellerContact, sellerGstin, consigneeDesignation, consigneeEmail, consigneeContact, consigneeAddress,
          pdfFilename, aiPromptTokens, aiCompletionTokens, aiTotalTokens,
          isDeleted, createdBy, modifiedBy
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
        [guid, user.companyId, ...values, user.username || user.fullName || "Unknown", user.username || user.fullName || "Unknown"]
      );
    }
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new ApiError(400, "A contract already exists for this order");
    throw err;
  }

  broadcastRealtimeEvent(user.companyId, "contracts");

  await createNotification(mysqlPool, {
    targetRole: "Admin",
    title: "Contract Saved from Order",
    message: `A contract was saved from Order #${contractNumber}.`,
    type: "contract-upload",
    priority: "low",
    link: guid,
    companyGuid: user.companyId,
  });

  return { guid, contractNumber };
}
