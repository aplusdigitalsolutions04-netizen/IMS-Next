import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Cross-cutting unit lookup (Stock-In, Item Master's unit dropdown, the
// Contracts product wizard) — same rationale as GetVendorDropdown above.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);
  requireCompany(user);

  const [rows] = await mysqlPool.query(
    "SELECT unitId, unitName, unitDesc as unitDescription, baseUnitQty FROM inventoryunitmaster WHERE isDeleted = 0 AND companyGuid = ?",
    [user.companyId]
  );
  return NextResponse.json({ data: rows, message: "Success" });
});
