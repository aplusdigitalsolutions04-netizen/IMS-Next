import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Cross-cutting unit lookup (Stock-In, Item Master's unit dropdown, the
// Contracts product wizard) — same rationale as GetVendorDropdown above.
// inventoryunitmaster has no companyGuid column (matches GetUnitList).
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);

  const [rows] = await mysqlPool.query(
    "SELECT unitId, unitName, unitDesc as unitDescription, baseUnitQty FROM inventoryunitmaster WHERE isDeleted = 0"
  );
  return NextResponse.json({ data: rows, message: "Success" });
});
