import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, ApiError } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { authorizeGroups, loadGroupOrThrow } from "@/lib/contractGroupsHelpers";
import { readSheetRows, cellOf, parseNumberCell, parseDateCell, ROW_COLUMNS } from "@/lib/contractGroupsExcel";

// Updates this group's rows from an Excel file made from the group's Template (or the Export with a
// Row ID column added). Only the group's own copy is touched; a blank cell means "leave as is".
export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const { id } = await params;
  const group = await loadGroupOrThrow(id, user);

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");

  const { map, data, headers } = readSheetRows(Buffer.from(await file.arrayBuffer()), ROW_COLUMNS, 2);
  if (!map) {
    throw new ApiError(400, `Could not find the table. The file needs a "Row ID" column (download the Template from this page). Found: ${headers.join(", ") || "(nothing)"}`);
  }
  if (!data.length) throw new ApiError(400, "The file has no data rows.");

  const [existing] = await mysqlPool.query("SELECT guid FROM contract_group_rows WHERE groupGuid = ?", [group.guid]);
  const ownRows = new Set(existing.map((r) => r.guid));
  const [statuses] = await mysqlPool.query("SELECT guid, label FROM contract_group_commission_statuses WHERE isActive = 1");
  const statusByLabel = new Map(statuses.map((s) => [s.label.trim().toLowerCase(), s.guid]));

  const NUM_FIELDS = { orderQty: "Order Qty", landingPrice: "Landing Price", qtyDelivered: "Qty Delivered", orderAmount: "Order Amount", commission: "Commission", gstPct: "GST %" };
  const results = { updated: [], failed: [], totalRows: data.length };

  for (const entry of data) {
    const rowId = String(cellOf(entry, map, "rowId") || "").trim();
    if (!ownRows.has(rowId)) { results.failed.push({ row: entry.rowNum, reason: rowId ? "Row ID is not part of this group" : "Row ID is blank" }); continue; }

    const sets = {};
    let problem = null;
    for (const [field, label] of Object.entries(NUM_FIELDS)) {
      const v = parseNumberCell(cellOf(entry, map, field));
      if (Number.isNaN(v)) { problem = `${label} is not a number`; break; }
      if (v !== null) sets[field] = v;
    }
    if (!problem && map.rowDate !== undefined) {
      const d = parseDateCell(cellOf(entry, map, "rowDate"));
      if (d === undefined) problem = "Date is not valid (use yyyy-mm-dd or dd-mm-yyyy)"; else if (d) sets.rowDate = d;
    }
    for (const field of ["firm", "contractNumber", "item", "commLabel"]) {
      const v = String(cellOf(entry, map, field) ?? "").trim();
      if (!problem && v) sets[field] = v;
    }
    if (!problem && map.commStatus !== undefined) {
      const label = String(cellOf(entry, map, "commStatus") ?? "").trim();
      if (label) {
        const guid = statusByLabel.get(label.toLowerCase());
        if (!guid) problem = `Commission Status "${label}" is not in the Commission Status list`; else sets.commStatusGuid = guid;
      }
    }
    if (problem) { results.failed.push({ row: entry.rowNum, reason: problem }); continue; }
    if (!Object.keys(sets).length) { results.failed.push({ row: entry.rowNum, reason: "No values to update in this row" }); continue; }

    const keys = Object.keys(sets);
    await mysqlPool.query(`UPDATE contract_group_rows SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE guid = ? AND groupGuid = ?`, [...keys.map((k) => sets[k]), rowId, group.guid]);
    results.updated.push({ row: entry.rowNum });
  }

  return NextResponse.json({ message: `Import completed. Updated: ${results.updated.length}, Failed: ${results.failed.length}`, results });
});
