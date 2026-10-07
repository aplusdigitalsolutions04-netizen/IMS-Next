import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeMasterWrite, ApiError } from "@/lib/auth";
import { safeStr, logUserActivity } from "@/lib/helpers";
import { withErrorHandling } from "@/lib/apiResponse";
import { ensureClientsTable } from "@/lib/clientMasterMigration";
import {
  authorizeGroups, scopeCompanyGuids, loadGroupOrThrow, loadCompanyNames, buildOrderRows, insertRows, findOrdersForClient,
} from "@/lib/contractGroupsHelpers";

// Only runs when the user says "yes, add to Client Master" — never automatic.
// Creates the client from the group's name + first contract's buyer details,
// links it to the group, and pulls in orders that already used that client.
export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  authorizeMasterWrite(user, "clientMaster", { isCreate: true, denyMessage: "You do not have permission to add clients." });
  await ensureClientsTable();
  const { id } = await params;
  const group = await loadGroupOrThrow(id, user);
  if (group.clientGuid) throw new ApiError(400, "This group is already linked to a client.");

  const [firstRow] = await mysqlPool.query(
    "SELECT sourceGuid FROM contract_group_rows WHERE groupGuid = ? AND sourceType = 'contract' ORDER BY sortOrder LIMIT 1",
    [group.guid]
  );
  let src = null;
  if (firstRow[0]) {
    const [c] = await mysqlPool.query("SELECT buyerGstin, buyerAddress, buyerContact FROM contracts WHERE guid = ?", [firstRow[0].sourceGuid]);
    src = c[0] || null;
  }

  const clientGuid = randomUUID();
  const clientName = safeStr(group.name, "");
  await mysqlPool.query(
    `INSERT INTO clients (guid, companyGuid, name, gstNumber, contactNumber, buyerAddress, shippingAddress)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [clientGuid, user.companyId, clientName, safeStr(src?.buyerGstin, "").toUpperCase() || null, safeStr(src?.buyerContact, "") || null,
      safeStr(src?.buyerAddress, "") || null, safeStr(src?.buyerAddress, "") || null]
  );
  await logUserActivity(mysqlPool, user, "Add Client", [{ field: "name", newValue: clientName }], request.headers.get("x-forwarded-for") || null);
  await mysqlPool.query("UPDATE contract_groups SET clientGuid = ? WHERE guid = ?", [clientGuid, group.guid]);

  const [rows] = await mysqlPool.query("SELECT sourceType, sourceGuid, contractNumber FROM contract_group_rows WHERE groupGuid = ?", [group.guid]);
  const orders = await findOrdersForClient(
    { name: clientName, gstNumber: src?.buyerGstin }, scopeCompanyGuids(user),
    rows.filter((r) => r.sourceType === "order").map((r) => r.sourceGuid), rows.filter((r) => r.sourceType === "contract").map((r) => r.contractNumber)
  );
  const orderRows = await buildOrderRows(orders, await loadCompanyNames());
  const added = await insertRows(group.guid, orderRows);

  return NextResponse.json({ message: "Client added", clientGuid, ordersAdded: added });
});
