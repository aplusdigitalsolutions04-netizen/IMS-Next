import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import {
  authorizeGroups, scopeCompanyGuids, loadUngroupedContracts, findOrdersForClient, fieldValue, parseJson, CANCELLED_SOURCE_STATUSES,
} from "@/lib/contractGroupsHelpers";

// Dashboard card: group totals + how many NEW matching contracts/orders are
// waiting in each group (nothing is added automatically — see the amber box
// on each group page).
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const scope = scopeCompanyGuids(user);

  const [groups] = await mysqlPool.query(
    `SELECT guid, name, matchValues, clientGuid FROM contract_groups WHERE isDeleted = 0 ${scope ? "AND companyGuid IN (?)" : ""} ORDER BY createdAt DESC`,
    scope ? [scope] : []
  );
  if (groups.length === 0) return NextResponse.json({ totals: { groups: 0, totalOrderValue: 0, pendingDispatch: 0, newMatches: 0 }, groups: [] });

  const guids = groups.map((g) => g.guid);
  const [stats] = await mysqlPool.query(
    `SELECT groupGuid,
            COUNT(DISTINCT contractNumber) AS contractCount,
            SUM(CASE WHEN sourceStatus IN (?) THEN 0 ELSE orderAmount END) AS totalOrderValue,
            SUM(CASE WHEN sourceStatus IN (?) THEN 0 ELSE GREATEST(orderQty - qtyDelivered, 0) END) AS pendingDispatch
       FROM contract_group_rows WHERE groupGuid IN (?) GROUP BY groupGuid`,
    [CANCELLED_SOURCE_STATUSES, CANCELLED_SOURCE_STATUSES, guids]
  );
  const statByGroup = new Map(stats.map((s) => [s.groupGuid, s]));

  const [removedRows] = await mysqlPool.query("SELECT groupGuid, sourceGuid FROM contract_group_removed WHERE groupGuid IN (?)", [guids]);
  const removedByGroup = new Map();
  for (const r of removedRows) {
    if (!removedByGroup.has(r.groupGuid)) removedByGroup.set(r.groupGuid, new Set());
    removedByGroup.get(r.groupGuid).add(r.sourceGuid);
  }

  const [groupRows] = await mysqlPool.query("SELECT groupGuid, sourceType, sourceGuid, contractNumber FROM contract_group_rows WHERE groupGuid IN (?)", [guids]);
  const rowsByGroup = new Map();
  for (const r of groupRows) {
    if (!rowsByGroup.has(r.groupGuid)) rowsByGroup.set(r.groupGuid, []);
    rowsByGroup.get(r.groupGuid).push(r);
  }

  const ungrouped = await loadUngroupedContracts(scope);
  const clientGuids = [...new Set(groups.map((g) => g.clientGuid).filter(Boolean))];
  const clientById = new Map();
  if (clientGuids.length > 0) {
    const [clients] = await mysqlPool.query("SELECT guid, name, gstNumber FROM clients WHERE guid IN (?)", [clientGuids]);
    for (const c of clients) clientById.set(c.guid, c);
  }

  const out = [];
  for (const g of groups) {
    const removed = removedByGroup.get(g.guid) || new Set();
    const matchValues = parseJson(g.matchValues, {});
    const fields = Object.keys(matchValues);
    const newContracts = fields.length === 0 ? 0 : ungrouped.filter((c) => !removed.has(c.guid) && fields.every((f) => fieldValue(c, f) === matchValues[f])).length;

    let newOrders = 0;
    const client = g.clientGuid ? clientById.get(g.clientGuid) : null;
    if (client) {
      const rows = rowsByGroup.get(g.guid) || [];
      const orders = await findOrdersForClient(
        client, scope,
        [...rows.filter((r) => r.sourceType === "order").map((r) => r.sourceGuid), ...removed],
        rows.filter((r) => r.sourceType === "contract").map((r) => r.contractNumber)
      );
      newOrders = orders.length;
    }

    const s = statByGroup.get(g.guid);
    out.push({
      guid: g.guid, name: g.name, contractCount: Number(s?.contractCount || 0),
      totalOrderValue: Number(s?.totalOrderValue || 0), pendingDispatch: Number(s?.pendingDispatch || 0),
      newContracts, newOrders, newMatches: newContracts + newOrders,
    });
  }

  out.sort((a, b) => b.newMatches - a.newMatches || a.name.localeCompare(b.name));
  return NextResponse.json({
    totals: {
      groups: out.length,
      totalOrderValue: out.reduce((s, g) => s + g.totalOrderValue, 0),
      pendingDispatch: out.reduce((s, g) => s + g.pendingDispatch, 0),
      newMatches: out.reduce((s, g) => s + g.newMatches, 0),
    },
    groups: out,
  });
});
