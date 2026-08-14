import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, authorizeMasterWrite, isSuperUser, ApiError } from "@/lib/auth";
import { normalizeRole } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "companyMaster", "Only Admin can view all companies.");

  const [rows] = await mysqlPool.query("SELECT * FROM companies ORDER BY name ASC");
  return NextResponse.json(rows);
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "companyMaster", { isCreate: true, denyMessage: "You do not have permission to add companies." });

  const { name, gstNumber, allowedPlatforms, isActive } = await parseJsonBody(request);
  if (!name) throw new ApiError(400, "Company name is required.");

  const platformsJson = allowedPlatforms && allowedPlatforms.length > 0 ? JSON.stringify(allowedPlatforms) : null;

  const guid = randomUUID();
  await mysqlPool.query(
    "INSERT INTO companies (guid, name, gstNumber, allowedPlatforms, isActive) VALUES (?, ?, ?, ?, ?)",
    [guid, name, gstNumber || null, platformsJson, isActive === false ? 0 : 1]
  );

  // Non-Admin users (Admin/allCompaniesAccess already sees every company via
  // hasAllCompaniesAccess) need an explicit user_companies row before they can
  // switch into a company they just created — otherwise a Company Master-
  // permitted user could create one but never actually use it.
  if (!isSuperUser(normalizeRole(user.role)) && !user.allCompaniesAccess) {
    await mysqlPool.query(
      "INSERT INTO user_companies (userGuid, companyGuid, isDefault) VALUES (?, ?, 0)",
      [user.id, guid]
    );
  }

  return NextResponse.json({ message: "Company created successfully.", guid });
});
