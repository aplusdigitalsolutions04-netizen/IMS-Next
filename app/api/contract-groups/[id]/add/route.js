import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, hasAllCompaniesAccess } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import {
  authorizeGroups, scopeCompanyGuids, loadGroupOrThrow, loadCompanyNames, buildContractRows, buildOrderRows, insertRows, CONTRACT_COLS,
} from "@/lib/contractGroupsHelpers";

// Adds selected (suggested) contracts / orders into the group as snapshot rows.
export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const { id } = await params;
  const group = await loadGroupOrThrow(id, user);
  const scope = [group.companyGuid];
  const { contractGuids = [], orderGuids = [] } = await parseJsonBody(request);
  const names = await loadCompanyNames();
  const scopeSql = "AND companyGuid IN (?)";

  let rows = [];
  let skipped = 0;
  if (contractGuids.length > 0) {
    // People who can see every company may pull in the same buyer's contracts from
    // another company (the "other companies" panel); everyone else stays inside this one.
    const crossOk = hasAllCompaniesAccess(user);
    const [found] = await mysqlPool.query(
      `SELECT ${CONTRACT_COLS} FROM contracts WHERE isDeleted = 0 AND guid IN (?) ${crossOk ? "" : scopeSql}`,
      crossOk ? [contractGuids] : [contractGuids, scope]
    );
    // A contract can only live in one group.
    const [taken] = await mysqlPool.query(
      `SELECT DISTINCT sourceGuid FROM contract_group_rows WHERE sourceType = 'contract' AND sourceGuid IN (?) AND groupGuid <> ?
         AND groupGuid IN (SELECT guid FROM contract_groups WHERE isDeleted = 0)`,
      [found.map((c) => c.guid), group.guid]
    );
    const takenSet = new Set(taken.map((t) => t.sourceGuid));
    const contracts = found.filter((c) => !takenSet.has(c.guid));
    skipped = found.length - contracts.length;
    rows = rows.concat(await buildContractRows(contracts, names));
  }
  if (orderGuids.length > 0) {
    const [orders] = await mysqlPool.query(`SELECT guid, orderid, orderDate, companyGuid, status FROM orders WHERE isDeleted = 0 AND guid IN (?) ${scopeSql}`, [orderGuids, scope]);
    rows = rows.concat(await buildOrderRows(orders, names));
  }
  const added = await insertRows(group.guid, rows);
  const sourceGuids = [...contractGuids, ...orderGuids];
  if (sourceGuids.length > 0) await mysqlPool.query("DELETE FROM contract_group_removed WHERE groupGuid = ? AND sourceGuid IN (?)", [group.guid, sourceGuids]);
  return NextResponse.json({ message: skipped ? `Added (${skipped} skipped — already in another group)` : "Added", added, skipped });
});
