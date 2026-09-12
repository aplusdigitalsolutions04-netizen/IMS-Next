import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, authorizeMasterWrite, ApiError } from "@/lib/auth";
import { safeStr, parseAllowedPlatforms, logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureClientsTable } from "@/lib/clientMasterMigration";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  await ensureClientsTable();

  const [rows] = await mysqlPool.query(
    "SELECT * FROM clients WHERE isActive = 1 AND companyGuid = ? ORDER BY name ASC",
    [user.companyId]
  );
  return NextResponse.json(rows.map((r) => ({ ...r, allowedPlatforms: parseAllowedPlatforms(r.allowedPlatforms) })));
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeMasterWrite(user, "clientMaster", { isCreate: true, denyMessage: "You do not have permission to add clients." });
  await ensureClientsTable();

  const { name, gstNumber, contactNumber, shippingAddress, buyerAddress, consigneeName, allowedPlatforms } = await parseJsonBody(request);
  const clientName = safeStr(name, "");
  if (!clientName) throw new ApiError(400, "Client name is required.");

  const platformsJson = Array.isArray(allowedPlatforms) && allowedPlatforms.length > 0 ? JSON.stringify(allowedPlatforms) : null;
  const guid = randomUUID();
  await mysqlPool.query(
    `INSERT INTO clients (guid, companyGuid, name, gstNumber, contactNumber, shippingAddress, buyerAddress, consigneeName, allowedPlatforms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      guid, user.companyId, clientName, safeStr(gstNumber, "").toUpperCase() || null, safeStr(contactNumber, "") || null,
      safeStr(shippingAddress, "") || null, safeStr(buyerAddress, "") || null, safeStr(consigneeName, "") || null, platformsJson,
    ]
  );
  await logUserActivity(mysqlPool, user, "Add Client", [{ field: "name", newValue: clientName }], request.headers.get("x-forwarded-for") || null);

  return NextResponse.json({ message: "Client added", guid }, { status: 201 });
});
