import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, authorizeMasterWrite, authorizeMasterDelete, ApiError } from "@/lib/auth";
import { safeStr, logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureClientsTable } from "@/lib/clientMasterMigration";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeMasterWrite(user, "clientMaster", { isCreate: false, denyMessage: "You do not have permission to edit clients." });
  await ensureClientsTable();
  const { id } = await params;

  const { name, gstNumber, contactNumber, shippingAddress, buyerAddress, consigneeName, allowedPlatforms } = await parseJsonBody(request);
  const clientName = safeStr(name, "");
  if (!clientName) throw new ApiError(400, "Client name is required.");

  const platformsJson = Array.isArray(allowedPlatforms) && allowedPlatforms.length > 0 ? JSON.stringify(allowedPlatforms) : null;
  await mysqlPool.query(
    `UPDATE clients
     SET name=?, gstNumber=?, contactNumber=?, shippingAddress=?, buyerAddress=?, consigneeName=?, allowedPlatforms=?
     WHERE guid=? AND companyGuid=? AND isActive=1`,
    [
      clientName, safeStr(gstNumber, "").toUpperCase() || null, safeStr(contactNumber, "") || null,
      safeStr(shippingAddress, "") || null, safeStr(buyerAddress, "") || null, safeStr(consigneeName, "") || null,
      platformsJson, id, user.companyId,
    ]
  );
  await logUserActivity(mysqlPool, user, "Update Client", [{ field: "name", newValue: clientName }], request.headers.get("x-forwarded-for") || null);

  return NextResponse.json({ message: "Client updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeMasterDelete(user, "clientMaster", "You do not have permission to delete clients.");
  await ensureClientsTable();
  const { id } = await params;

  const [[client]] = await mysqlPool.query("SELECT name FROM clients WHERE guid=? AND companyGuid=?", [id, user.companyId]);
  await mysqlPool.query("UPDATE clients SET isActive=0 WHERE guid=? AND companyGuid=?", [id, user.companyId]);
  await logUserActivity(mysqlPool, user, "Delete Client", [{ field: "name", oldValue: client?.name || id, newValue: "Deleted" }], request.headers.get("x-forwarded-for") || null);

  return NextResponse.json({ message: "Client deleted" });
});
