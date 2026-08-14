import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Cross-cutting vendor lookup for screens that need a vendor picker (e.g.
// Stock-In) without requiring "Vendor Master" permission — mirrors
// GetBrandDropdown/GetCategoryDropdown's gating (shared authorizeInventory,
// not the strict per-master authorizeMasterRead used by GetVendorList).
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);
  requireCompany(user);

  const [rows] = await mysqlPool.query(
    "SELECT vendorId, vendorFirmName, isActive AS status FROM inventoryvendor WHERE isDeleted = 0 AND companyGuid = ?",
    [user.companyId]
  );
  return NextResponse.json({ data: rows, message: "Success" });
});
