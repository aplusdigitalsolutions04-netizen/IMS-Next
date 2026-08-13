import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, authorizeMasterWrite, ApiError } from "@/lib/auth";
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

  await mysqlPool.query(
    "INSERT INTO companies (guid, name, gstNumber, allowedPlatforms, isActive) VALUES (UUID(), ?, ?, ?, ?)",
    [name, gstNumber || null, platformsJson, isActive === false ? 0 : 1]
  );
  return NextResponse.json({ message: "Company created successfully." });
});
