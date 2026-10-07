import { NextResponse } from "next/server";
import * as xlsx from "xlsx";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeReadWrite, requireCompany, ApiError } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";

const authorize = (user, method) =>
  authorizeReadWrite(user, method, {
    permission: "print_models",
    editColumnName: "allow_edit_models",
    adminOnlyDelete: true,
    denyMessage: "You do not have permission to manage models.",
  });

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// "Length (cm)" -> "length", "Packaging Cost (Rs.)" -> "packagingcost"
const headerKey = (s) => norm(String(s || "").replace(/\([^)]*\)|\[[^\]]*\]/g, ""));

// Column synonyms people actually use. A header matches if, after dropping any
// "(unit)" part, it equals one of these or contains one of the `has` words.
const COLUMNS = {
  id: { exact: ["itemvariantid", "variantid", "id"], has: [] },
  itemName: { exact: ["itemname", "item", "name", "product", "productname"], has: [] },
  variantCode: { exact: ["variantcode", "variant", "variantname", "model", "modelname", "code"], has: [] },
  cost: { exact: ["packagingcost", "packingcost", "packaging", "packing", "cost"], has: ["packagingcost", "packingcost", "packcost"] },
  length: { exact: ["length", "len", "l"], has: ["length"] },
  width: { exact: ["width", "breadth", "w"], has: ["width", "breadth"] },
  height: { exact: ["height", "h"], has: ["height"] },
  weight: { exact: ["weight", "wt"], has: ["weight"] },
};

function mapHeaders(headers) {
  const map = {};
  const used = new Set();
  const take = (field, test) => {
    if (map[field] !== undefined) return;
    const idx = headers.findIndex((h, i) => !used.has(i) && test(headerKey(h)));
    if (idx >= 0) { map[field] = idx; used.add(idx); }
  };
  // exact matches first so "Item Name" is never swallowed by a looser rule
  for (const [field, def] of Object.entries(COLUMNS)) take(field, (k) => def.exact.includes(k));
  for (const [field, def] of Object.entries(COLUMNS)) if (def.has.length) take(field, (k) => def.has.some((w) => k.includes(w)));
  return map;
}

// "30 cm", "₹ 1,250", "2.5kg" -> number; "" -> null (= leave the stored value alone); junk -> NaN
function parseNumber(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const t = String(v).trim();
  if (!t || t === "-") return null;
  const m = t.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

// Bulk-updates Dispatch's "Packaging Cost & Dimensions" fields from an Excel
// file shaped like export-packaging/route.js's own output — but tolerant of
// hand-edited headers ("Length (cm)", "Packaging Cost (Rs)") and of title rows
// above the header. Matches each row primarily by "Item Variant ID"; when that's
// missing or doesn't match (a hand-built sheet), falls back to Item Name +
// Variant Code together, since variant codes alone repeat across different
// items (e.g. every printer's "Black" variant).
//
// A blank cell means "leave what is stored alone" — importing a half-filled
// sheet never wipes existing values.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorize(user, "POST");

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames.find((n) => (workbook.Sheets[n]["!ref"] || "") !== "") || workbook.SheetNames[0];
  const grid = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: true });
  if (!grid.length) throw new ApiError(400, "Excel file is empty");

  // The header is the first of the top rows that names an item column and at least one data column.
  let headerRow = -1;
  let cols = {};
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const m = mapHeaders(grid[r]);
    const hasKey = m.id !== undefined || m.itemName !== undefined || m.variantCode !== undefined;
    const hasData = ["cost", "length", "width", "height", "weight"].some((f) => m[f] !== undefined);
    if (hasKey && hasData) { headerRow = r; cols = m; break; }
  }
  if (headerRow < 0) {
    const seen = (grid[0] || []).map((h) => String(h).trim()).filter(Boolean).join(", ") || "(none)";
    throw new ApiError(400, `Could not find the Packaging columns. Expected headers like: Item Variant ID, Item Name, Variant Code, Packaging Cost, Length, Width, Height, Weight. Found: ${seen}`);
  }

  const dataRows = grid.slice(headerRow + 1).filter((r) => r.some((c) => String(c).trim() !== ""));
  if (!dataRows.length) throw new ApiError(400, "Excel file has no data rows");

  const [variants] = await mysqlPool.query(
    `SELECT itv.itemVariantId, i.itemName, itv.variantName as variantCode
     FROM inventoryitemvariant itv
     JOIN inventoryitemmaster i ON itv.itemId = i.itemId AND i.isDeleted = 0
     WHERE itv.isDeleted = 0 AND itv.companyGuid = ?`,
    [user.companyId]
  );
  const byId = new Map(variants.map((v) => [v.itemVariantId, v]));
  const byNameCode = new Map(variants.map((v) => [`${norm(v.itemName)}|${norm(v.variantCode)}`, v]));

  const cell = (row, field) => (cols[field] === undefined ? "" : row[cols[field]]);
  const results = {
    success: [],
    failed: [],
    totalRows: dataRows.length,
    columnsFound: Object.keys(cols).filter((f) => !["id", "itemName", "variantCode"].includes(f)),
  };
  const updates = [];

  dataRows.forEach((row, i) => {
    const rowNum = headerRow + 2 + i;
    const id = String(cell(row, "id") || "").trim();
    const itemName = String(cell(row, "itemName") || "").trim();
    const variantCode = String(cell(row, "variantCode") || "").trim();

    let variant = id ? byId.get(id) : null;
    if (!variant && (itemName || variantCode)) variant = byNameCode.get(`${norm(itemName)}|${norm(variantCode)}`);
    if (!variant) {
      results.failed.push({ row: rowNum, item: itemName || variantCode || id || "(blank)", reason: "No matching item/variant found" });
      return;
    }

    const values = {
      packagingCost: parseNumber(cell(row, "cost")),
      packageLength: parseNumber(cell(row, "length")),
      packageWidth: parseNumber(cell(row, "width")),
      packageHeight: parseNumber(cell(row, "height")),
      packageWeight: parseNumber(cell(row, "weight")),
    };
    const bad = Object.entries(values).find(([, v]) => Number.isNaN(v));
    if (bad) {
      results.failed.push({ row: rowNum, item: `${variant.itemName} — ${variant.variantCode}`, reason: `${{ packagingCost: "Packaging Cost", packageLength: "Length", packageWidth: "Width", packageHeight: "Height", packageWeight: "Weight" }[bad[0]]} is not a number` });
      return;
    }
    if (Object.values(values).every((v) => v === null)) {
      results.failed.push({ row: rowNum, item: `${variant.itemName} — ${variant.variantCode}`, reason: "No values in this row (all cells blank)" });
      return;
    }

    updates.push([
      values.packagingCost, values.packageLength, values.packageWidth, values.packageHeight, values.packageWeight,
      variant.itemVariantId, user.companyId,
    ]);
    results.success.push({ row: rowNum, item: `${variant.itemName} — ${variant.variantCode}` });
  });

  // IFNULL keeps the stored value when the sheet cell was blank.
  for (const params of updates) {
    await mysqlPool.query(
      `UPDATE inventoryitemvariant
       SET packagingCost = IFNULL(?, packagingCost), packageLength = IFNULL(?, packageLength),
           packageWidth = IFNULL(?, packageWidth), packageHeight = IFNULL(?, packageHeight),
           packageWeight = IFNULL(?, packageWeight)
       WHERE itemVariantId = ? AND companyGuid = ?`,
      params
    );
  }

  if (updates.length) broadcastRealtimeEvent(user.companyId, "models");

  return NextResponse.json({
    message: `Import completed. Updated: ${results.success.length}, Failed: ${results.failed.length}`,
    results,
  });
});
