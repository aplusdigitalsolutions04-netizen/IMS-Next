import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeMasterWrite, authorizeMasterDelete, ApiError, invalidateCompanyActiveCache } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureCompanyAdditionalGstColumn } from "@/lib/companiesMigration";
import { normGstin } from "@/lib/companyMatch";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "companyMaster", { isCreate: false, denyMessage: "You do not have permission to edit companies." });
  await ensureCompanyAdditionalGstColumn();

  const { id } = await params;
  const { name, gstNumber, allowedPlatforms, additionalGstNumbers, isActive } = await parseJsonBody(request);
  if (!name) throw new ApiError(400, "Company name is required.");

  const platformsJson = allowedPlatforms && allowedPlatforms.length > 0 ? JSON.stringify(allowedPlatforms) : null;
  const extraGst = Array.isArray(additionalGstNumbers)
    ? [...new Set(additionalGstNumbers.map(normGstin).filter((g) => g && g !== normGstin(gstNumber)))]
    : [];
  const extraGstJson = extraGst.length > 0 ? JSON.stringify(extraGst) : null;

  await mysqlPool.query(
    "UPDATE companies SET name = ?, gstNumber = ?, allowedPlatforms = ?, additionalGstNumbers = ?, isActive = ? WHERE guid = ?",
    [name, gstNumber || null, platformsJson, extraGstJson, isActive === false ? 0 : 1, id]
  );
  invalidateCompanyActiveCache(id);
  return NextResponse.json({ message: "Company updated successfully." });
});

// Soft delete only — flips isActive off so the company stops appearing as a
// login/switch option, but its guid (and every row scoped to it) stays intact.
export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeMasterDelete(user, "companyMaster", "You do not have permission to deactivate companies.");

  const { id } = await params;
  await mysqlPool.query("UPDATE companies SET isActive = 0 WHERE guid = ?", [id]);
  invalidateCompanyActiveCache(id);
  return NextResponse.json({ message: "Company deactivated." });
});
