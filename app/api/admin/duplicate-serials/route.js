import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, isSuperUser, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// One-off diagnostic: there's no DB-level UNIQUE constraint on
// inventorystockinserial.serialNumber (duplicate prevention today is only an
// app-level check, and it's scoped per-company — see
// app/Inventory/SaveStockInSerials/route.js), so it's possible for the same
// physical serial number to end up as two separate rows. That's exactly what
// inflates counts like "Current Stock says 703 but I physically have 701" —
// 2 duplicate rows means 2 phantom units. This lists every serialNumber with
// more than one non-deleted row for the caller's company, so the extras can
// be identified and removed.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  if (!isSuperUser(user.role)) throw new ApiError(403, "Admin only.");

  const [rows] = await mysqlPool.query(
    `SELECT s.guid, s.serialNumber, s.serialStatus, s.itemVariantId, s.godownGuid, s.createdAt, s.stockInDetailId,
            iv.variantName, iim.itemName
     FROM inventorystockinserial s
     LEFT JOIN inventoryitemvariant iv ON s.itemVariantId = iv.itemVariantId AND iv.companyGuid = s.companyGuid
     LEFT JOIN inventoryitemmaster iim ON iv.itemId = iim.itemId AND iim.companyGuid = s.companyGuid
     WHERE s.companyGuid = ? AND s.isDeleted = 0
       AND s.serialNumber IN (
         SELECT serialNumber FROM inventorystockinserial
         WHERE companyGuid = ? AND isDeleted = 0
         GROUP BY serialNumber HAVING COUNT(*) > 1
       )
     ORDER BY s.serialNumber, s.createdAt`,
    [user.companyId, user.companyId]
  );

  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.serialNumber)) groups.set(r.serialNumber, []);
    groups.get(r.serialNumber).push(r);
  }

  return NextResponse.json({
    duplicateSerialCount: groups.size,
    extraRowCount: rows.length - groups.size,
    groups: Array.from(groups.entries()).map(([serialNumber, entries]) => ({ serialNumber, entries })),
  });
});

// Soft-deletes one specific duplicate row (by guid) — never bulk, so the
// user picks exactly which copy to remove after reviewing each one's
// status/godown/date, not a guess at "the older one is always the extra".
export const DELETE = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  if (!isSuperUser(user.role)) throw new ApiError(403, "Admin only.");

  const { guid } = await parseJsonBody(request);
  if (!guid) throw new ApiError(400, "guid is required");

  const [[row]] = await mysqlPool.query(
    "SELECT serialNumber, serialStatus FROM inventorystockinserial WHERE guid=? AND companyGuid=? AND isDeleted=0",
    [guid, user.companyId]
  );
  if (!row) throw new ApiError(404, "Serial not found");
  if (row.serialStatus === "Dispatched") {
    throw new ApiError(400, "This copy is marked Dispatched (linked to an order) — remove the other duplicate instead, not this one.");
  }

  await mysqlPool.query(
    "UPDATE inventorystockinserial SET isDeleted=1 WHERE guid=? AND companyGuid=?",
    [guid, user.companyId]
  );

  return NextResponse.json({ message: `Removed duplicate ${row.serialNumber}` });
});
