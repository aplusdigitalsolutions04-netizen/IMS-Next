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
const pick = (row, ...labels) => {
  for (const label of labels) {
    const key = Object.keys(row).find((k) => norm(k) === norm(label));
    if (key !== undefined && row[key] !== undefined && row[key] !== "") return row[key];
  }
  return "";
};

// Bulk-updates Dispatch's "Packaging Cost & Dimensions" fields from an
// Excel file shaped like export-packaging/route.js's own output. Matches
// each row primarily by "Item Variant ID" (present on a real export); when
// that's missing or doesn't match (a hand-built sheet), falls back to
// Item Name + Variant Code together, since variant codes alone repeat across
// different items (e.g. every printer's "Black" variant).
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorize(user, "POST");

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
  if (!data.length) throw new ApiError(400, "Excel file is empty");

  const [variants] = await mysqlPool.query(
    `SELECT itv.itemVariantId, i.itemName, itv.variantName as variantCode
     FROM inventoryitemvariant itv
     JOIN inventoryitemmaster i ON itv.itemId = i.itemId AND i.isDeleted = 0
     WHERE itv.isDeleted = 0 AND itv.companyGuid = ?`,
    [user.companyId]
  );
  const byId = new Map(variants.map((v) => [v.itemVariantId, v]));
  const byNameCode = new Map(variants.map((v) => [`${norm(v.itemName)}|${norm(v.variantCode)}`, v]));

  const results = { success: [], failed: [], totalRows: data.length };
  const updates = [];

  data.forEach((row, i) => {
    const rowNum = i + 2;
    const id = String(pick(row, "Item Variant ID") || "").trim();
    const itemName = String(pick(row, "Item Name") || "").trim();
    const variantCode = String(pick(row, "Variant Code") || "").trim();

    let variant = id ? byId.get(id) : null;
    if (!variant && (itemName || variantCode)) variant = byNameCode.get(`${norm(itemName)}|${norm(variantCode)}`);
    if (!variant) {
      results.failed.push({ row: rowNum, item: itemName || variantCode || id || "(blank)", reason: "No matching item/variant found" });
      return;
    }

    const packagingCost = pick(row, "Packaging Cost");
    const length = pick(row, "Length");
    const width = pick(row, "Width");
    const height = pick(row, "Height");
    const weight = pick(row, "Weight");

    updates.push([
      packagingCost !== "" ? Number(packagingCost) : 0,
      length !== "" ? Number(length) : null,
      width !== "" ? Number(width) : null,
      height !== "" ? Number(height) : null,
      weight !== "" ? Number(weight) : null,
      variant.itemVariantId,
      user.companyId,
    ]);
    results.success.push({ row: rowNum, item: `${variant.itemName} — ${variant.variantCode}` });
  });

  for (const params of updates) {
    await mysqlPool.query(
      `UPDATE inventoryitemvariant
       SET packagingCost = ?, packageLength = ?, packageWidth = ?, packageHeight = ?, packageWeight = ?
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
