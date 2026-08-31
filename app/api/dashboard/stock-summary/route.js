import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeReadWrite, requireCompany } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

// Dashboard's "Stock Available" card (app/(app)/page.js) used to be driven
// entirely by the (permission-gated) `serials` array in AppDataContext, so
// it only ever counted serialized stock, and read 0 for any role without
// the "Serials" (print_serials) permission — e.g. a finance-only Accounts
// role. This is a dedicated, lightweight aggregate: just two counts, no
// per-item/pricing detail — gated on the same "dashboard" permission as
// app/api/dashboard/stats/route.js (anyone who can open the dashboard can
// see this), not the narrower inventory-specific permission.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeReadWrite(user, "GET", { permission: "dashboard", denyMessage: "You do not have access to dashboard data." });

  const { searchParams } = new URL(request.url);
  const fyStart = searchParams.get("fyStart");
  const fyEnd = searchParams.get("fyEnd");

  const [[serializedRow]] = await mysqlPool.query(
    `SELECT COUNT(*) as count FROM inventorystockinserial
     WHERE serialStatus = 'Available' AND isDeleted = 0 AND companyGuid = ?
       ${fyStart && fyEnd ? "AND createdAt BETWEEN ? AND ?" : ""}`,
    fyStart && fyEnd ? [user.companyId, fyStart, fyEnd] : [user.companyId]
  );

  // Non-serialized ("not trackable") variants keep their available quantity
  // in inventoryvariantstock.availablePCS — no per-unit createdAt exists for
  // these, so there's no FY slice to apply; it's just the current on-hand
  // balance (same convention GetCurrentStock/route.js uses for these rows).
  const [[nonSerializedRow]] = await mysqlPool.query(
    `SELECT COALESCE(SUM(s.availablePCS), 0) as total
     FROM inventoryvariantstock s
     JOIN inventoryitemvariant v ON s.itemVariantId = v.itemVariantId
     JOIN inventoryitemmaster i ON v.itemId = i.itemId
     WHERE i.isTrackable = 0 AND v.isDeleted = 0 AND v.companyGuid = ?`,
    [user.companyId]
  );

  const serializedAvailable = serializedRow?.count || 0;
  const nonSerializedAvailable = Number(nonSerializedRow?.total) || 0;

  return NextResponse.json({
    total: serializedAvailable + nonSerializedAvailable,
    serializedAvailable,
    nonSerializedAvailable,
  });
});
