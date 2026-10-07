import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, ApiError, hasAllCompaniesAccess, resolveScopedCompanyGuid } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import {
  authorizeGroups, scopeCompanyGuids, loadCompanyNames, buildContractRows, insertRows, isValidMatchFields,
  parseJson, CONTRACT_COLS, CANCELLED_SOURCE_STATUSES,
} from "@/lib/contractGroupsHelpers";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  // Default: the company you are working in. ?companyGuid=<guid> or =all (only for
  // people with all-companies access) shows another company's groups in the same tab.
  const picked = resolveScopedCompanyGuid(user, request);
  const scope = picked ? [picked] : null;
  const names = await loadCompanyNames();

  const [groups] = await mysqlPool.query(
    `SELECT guid, companyGuid, name, matchFields, clientGuid, customValues, createdAt FROM contract_groups
      WHERE isDeleted = 0 ${scope ? "AND companyGuid IN (?)" : ""} ORDER BY createdAt DESC`,
    scope ? [scope] : []
  );
  const guids = groups.map((g) => g.guid);
  const stats = new Map();
  if (guids.length > 0) {
    const [rows] = await mysqlPool.query(
      `SELECT groupGuid,
              COUNT(DISTINCT contractNumber) AS contractCount,
              SUM(CASE WHEN sourceStatus IN (?) THEN 0 ELSE orderAmount END) AS totalOrderValue,
              SUM(CASE WHEN sourceStatus IN (?) THEN 0 ELSE GREATEST(orderQty - qtyDelivered, 0) END) AS pendingDispatch
         FROM contract_group_rows WHERE groupGuid IN (?) GROUP BY groupGuid`,
      [CANCELLED_SOURCE_STATUSES, CANCELLED_SOURCE_STATUSES, guids]
    );
    for (const r of rows) stats.set(r.groupGuid, r);
  }
  const [columns] = await mysqlPool.query("SELECT guid, label, type, options FROM contract_group_columns WHERE isActive = 1 ORDER BY displayOrder, createdAt");

  return NextResponse.json({
    groups: groups.map((g) => {
      const s = stats.get(g.guid);
      return {
        guid: g.guid, name: g.name, companyGuid: g.companyGuid, companyName: names.get(g.companyGuid) || "",
        clientGuid: g.clientGuid, matchFields: parseJson(g.matchFields, []),
        customValues: parseJson(g.customValues, {}),
        contractCount: Number(s?.contractCount || 0), totalOrderValue: Number(s?.totalOrderValue || 0), pendingDispatch: Number(s?.pendingDispatch || 0),
      };
    }),
    columns: columns.map((c) => ({ ...c, options: parseJson(c.options, []) })),
    canViewOtherCompanies: hasAllCompaniesAccess(user),
    activeCompanyGuid: user.companyId,
  });
});

// Create one group from a chosen set of contracts (snapshot rows are copied
// in; nothing is written to the contracts/orders themselves).
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const scope = scopeCompanyGuids(user);
  const { name, matchFields, matchValues, contractGuids } = await parseJsonBody(request);

  if (!isValidMatchFields(matchFields)) throw new ApiError(400, "Choose at least one matching field.");
  if (!Array.isArray(contractGuids) || contractGuids.length < 2) throw new ApiError(400, "A group needs at least 2 contracts.");

  const [contracts] = await mysqlPool.query(
    `SELECT ${CONTRACT_COLS} FROM contracts WHERE isDeleted = 0 AND guid IN (?) ${scope ? "AND companyGuid IN (?)" : ""}`,
    scope ? [contractGuids, scope] : [contractGuids]
  );
  if (contracts.length < 2) throw new ApiError(400, "Selected contracts were not found.");
  const [taken] = await mysqlPool.query(
    `SELECT DISTINCT sourceGuid FROM contract_group_rows WHERE sourceType = 'contract' AND sourceGuid IN (?)
       AND groupGuid IN (SELECT guid FROM contract_groups WHERE isDeleted = 0)`,
    [contracts.map((c) => c.guid)]
  );
  if (taken.length > 0) throw new ApiError(409, "Some of these contracts are already in another group.");

  const first = contracts[0];
  const groupName = String(name || "").trim() || first.organisation || first.department || first.contractNumber || "New Group";
  const guid = randomUUID();
  await mysqlPool.query(
    "INSERT INTO contract_groups (guid, companyGuid, name, matchFields, matchValues, createdBy) VALUES (?, ?, ?, ?, ?, ?)",
    [guid, user.companyId, groupName, JSON.stringify(matchFields), JSON.stringify(matchValues || {}), user.username || user.id || null]
  );
  const rows = await buildContractRows(contracts, await loadCompanyNames());
  await insertRows(guid, rows);

  return NextResponse.json({ message: "Group created", guid }, { status: 201 });
});
