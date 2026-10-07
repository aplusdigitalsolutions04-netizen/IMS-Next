import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, hasAllCompaniesAccess } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import {
  authorizeGroups, scopeCompanyGuids, loadCompanyNames, loadGroupOrThrow, loadUngroupedContracts, findOrdersForClient,
  fieldValue, parseJson, CONTRACT_COLS,
} from "@/lib/contractGroupsHelpers";

async function loadSuggestions(group, rows, user) {
  const scope = [group.companyGuid];
  const names = await loadCompanyNames();
  const [removedRows] = await mysqlPool.query("SELECT sourceGuid FROM contract_group_removed WHERE groupGuid = ?", [group.guid]);
  const removed = new Set(removedRows.map((r) => r.sourceGuid));

  const matchValues = parseJson(group.matchValues, {});
  const fields = Object.keys(matchValues);
  let contracts = [];
  if (fields.length > 0) {
    contracts = (await loadUngroupedContracts(scope))
      .filter((c) => !removed.has(c.guid) && fields.every((f) => fieldValue(c, f) === matchValues[f]))
      .map((c) => ({ guid: c.guid, contractNumber: c.contractNumber, companyName: names.get(c.companyGuid) || "", generatedDate: c.generatedDate, organisation: c.organisation }));
  }

  // The same combination in the user's OTHER companies — shown for checking (and
  // optional adding) only; only people allowed to see every company get it.
  let otherCompanies = [];
  if (fields.length > 0 && hasAllCompaniesAccess(user)) {
    const [others] = await mysqlPool.query(
      `SELECT ${CONTRACT_COLS} FROM contracts WHERE isDeleted = 0 AND companyGuid <> ? ORDER BY generatedDate DESC, createdAt DESC`,
      [group.companyGuid]
    );
    const matched = others.filter((c) => fields.every((f) => fieldValue(c, f) === matchValues[f]));
    const grouped = new Map();
    if (matched.length > 0) {
      const [gr] = await mysqlPool.query(
        `SELECT r.sourceGuid, g.guid AS groupGuid, g.name AS groupName, g.companyGuid
           FROM contract_group_rows r JOIN contract_groups g ON g.guid = r.groupGuid
          WHERE r.sourceType = 'contract' AND g.isDeleted = 0 AND r.sourceGuid IN (?)`,
        [matched.map((c) => c.guid)]
      );
      for (const r of gr) grouped.set(r.sourceGuid, r);
    }
    otherCompanies = matched.map((c) => {
      const g = grouped.get(c.guid);
      return {
        guid: c.guid, contractNumber: c.contractNumber, companyName: names.get(c.companyGuid) || "", generatedDate: c.generatedDate,
        status: c.status || "", organisation: c.organisation,
        inGroup: g ? { guid: g.groupGuid, name: g.groupName, companyName: names.get(g.companyGuid) || "" } : null,
      };
    });
  }

  let orders = [];
  if (group.clientGuid) {
    const [[client]] = await mysqlPool.query("SELECT guid, name, gstNumber FROM clients WHERE guid = ?", [group.clientGuid]);
    if (client) {
      const inGroupOrders = rows.filter((r) => r.sourceType === "order").map((r) => r.sourceGuid);
      const contractNumbers = rows.filter((r) => r.sourceType === "contract").map((r) => r.contractNumber);
      orders = (await findOrdersForClient(client, scope, [...inGroupOrders, ...removed], contractNumbers))
        .map((o) => ({ guid: o.guid, orderid: o.orderid, orderDate: o.orderDate, companyName: names.get(o.companyGuid) || "", status: o.status, matchedBy: o.matchedBy }));
    }
  }
  return { contracts, orders, otherCompanies };
}

export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const { id } = await params;
  const group = await loadGroupOrThrow(id, user);

  const [rows] = await mysqlPool.query(
    "SELECT * FROM contract_group_rows WHERE groupGuid = ? ORDER BY rowDate ASC, sortOrder ASC",
    [group.guid]
  );
  const suggestions = await loadSuggestions(group, rows, user);
  const [statuses] = await mysqlPool.query("SELECT guid, label, color, isActive FROM contract_group_commission_statuses ORDER BY displayOrder, createdAt");

  return NextResponse.json({
    group: { guid: group.guid, name: group.name, clientGuid: group.clientGuid, matchFields: parseJson(group.matchFields, []), companyGuid: group.companyGuid, companyName: (await loadCompanyNames()).get(group.companyGuid) || "" },
    rows: rows.map((r) => ({
      guid: r.guid, sourceType: r.sourceType, sourceGuid: r.sourceGuid, rowDate: r.rowDate ? new Date(r.rowDate).toISOString().slice(0, 10) : "",
      firm: r.firm || "", contractNumber: r.contractNumber || "", item: r.item || "",
      orderQty: Number(r.orderQty), landingPrice: r.landingPrice == null ? "" : Number(r.landingPrice),
      qtyDelivered: Number(r.qtyDelivered), orderAmount: Number(r.orderAmount), gstPct: Number(r.gstPct),
      commLabel: r.commLabel || "", commStatusGuid: r.commStatusGuid || "", commission: Number(r.commission || 0), sourceStatus: r.sourceStatus,
    })),
    suggestions,
    commissionStatuses: statuses,
  });
});

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const { id } = await params;
  const group = await loadGroupOrThrow(id, user);
  const { name, customValues } = await parseJsonBody(request);

  if (name !== undefined && String(name).trim()) {
    await mysqlPool.query("UPDATE contract_groups SET name = ? WHERE guid = ?", [String(name).trim(), group.guid]);
  }
  if (customValues && typeof customValues === "object") {
    const merged = { ...parseJson(group.customValues, {}), ...customValues };
    await mysqlPool.query("UPDATE contract_groups SET customValues = ? WHERE guid = ?", [JSON.stringify(merged), group.guid]);
  }
  return NextResponse.json({ message: "Group updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const { id } = await params;
  const group = await loadGroupOrThrow(id, user);
  // Soft delete — its contracts become free to be grouped again.
  await mysqlPool.query("UPDATE contract_groups SET isDeleted = 1 WHERE guid = ?", [group.guid]);
  return NextResponse.json({ message: "Group deleted" });
});
