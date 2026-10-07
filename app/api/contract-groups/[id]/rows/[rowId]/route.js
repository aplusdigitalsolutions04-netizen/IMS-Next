import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { authorizeGroups, loadGroupOrThrow, loadCompanyNames, buildContractRows, buildOrderRows, CONTRACT_COLS } from "@/lib/contractGroupsHelpers";

const loadRow = async (group, rowId) => {
  const [[row]] = await mysqlPool.query("SELECT * FROM contract_group_rows WHERE guid = ? AND groupGuid = ?", [rowId, group.guid]);
  if (!row) throw new ApiError(404, "Row not found.");
  return row;
};

const EDITABLE = {
  rowDate: (v) => (v ? String(v).slice(0, 10) : null),
  firm: (v) => String(v ?? "").slice(0, 255),
  contractNumber: (v) => String(v ?? "").slice(0, 100),
  item: (v) => String(v ?? ""),
  commLabel: (v) => String(v ?? "").slice(0, 100),
  commission: (v) => Number(v) || 0,
  commStatusGuid: (v) => (v ? String(v).slice(0, 36) : null),
  orderQty: (v) => Number(v) || 0,
  qtyDelivered: (v) => Number(v) || 0,
  orderAmount: (v) => Number(v) || 0,
  gstPct: (v) => Number(v) || 0,
  landingPrice: (v) => (v === "" || v == null ? null : Number(v) || 0),
};

// Inline edit — only touches this group's own copy of the row.
export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const { id, rowId } = await params;
  const group = await loadGroupOrThrow(id, user);
  await loadRow(group, rowId);
  const body = await parseJsonBody(request);

  const sets = [];
  const values = [];
  for (const [key, clean] of Object.entries(EDITABLE)) {
    if (body[key] !== undefined) { sets.push(`${key} = ?`); values.push(clean(body[key])); }
  }
  if (sets.length > 0) await mysqlPool.query(`UPDATE contract_group_rows SET ${sets.join(", ")} WHERE guid = ?`, [...values, rowId]);
  return NextResponse.json({ message: "Row updated" });
});

// Remove: takes the whole contract/order out of the group and remembers it so
// it isn't suggested or re-added automatically.
export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const { id, rowId } = await params;
  const group = await loadGroupOrThrow(id, user);
  const row = await loadRow(group, rowId);
  await mysqlPool.query("DELETE FROM contract_group_rows WHERE groupGuid = ? AND sourceGuid = ?", [group.guid, row.sourceGuid]);
  await mysqlPool.query("INSERT IGNORE INTO contract_group_removed (groupGuid, sourceGuid) VALUES (?, ?)", [group.guid, row.sourceGuid]);
  return NextResponse.json({ message: "Removed from group" });
});

// "Refresh from contract": re-reads the source and overwrites ONLY the
// source-derived fields of this row (the group copy never changes on its own).
export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const { id, rowId } = await params;
  const group = await loadGroupOrThrow(id, user);
  const row = await loadRow(group, rowId);
  const names = await loadCompanyNames();

  let fresh = [];
  if (row.sourceType === "contract") {
    const [contracts] = await mysqlPool.query(`SELECT ${CONTRACT_COLS} FROM contracts WHERE guid = ? AND isDeleted = 0`, [row.sourceGuid]);
    fresh = await buildContractRows(contracts, names);
  } else {
    const [orders] = await mysqlPool.query("SELECT guid, orderid, orderDate, companyGuid, status FROM orders WHERE guid = ? AND isDeleted = 0", [row.sourceGuid]);
    fresh = await buildOrderRows(orders, names);
  }
  const match = fresh.find((r) => r.productKey === row.productKey);
  if (!match) throw new ApiError(404, "The source no longer has this item.");
  await mysqlPool.query(
    `UPDATE contract_group_rows SET rowDate = ?, firm = ?, contractNumber = ?, item = ?, orderQty = ?, landingPrice = ?,
            qtyDelivered = ?, orderAmount = ?, sourceStatus = ? WHERE guid = ?`,
    [match.rowDate, match.firm, match.contractNumber, match.item, match.orderQty, match.landingPrice, match.qtyDelivered, match.orderAmount, match.sourceStatus, rowId]
  );
  return NextResponse.json({ message: "Row refreshed" });
});
