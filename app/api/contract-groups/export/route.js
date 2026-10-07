import * as xlsx from "xlsx";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, resolveScopedCompanyGuid } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { authorizeGroups, loadCompanyNames, parseJson, CANCELLED_SOURCE_STATUSES } from "@/lib/contractGroupsHelpers";
import { calcRow, round2, num, sheetFromObjects, workbookResponse } from "@/lib/contractGroupsExcel";

const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

// Groups list as Excel: sheet 1 = one line per group (with the custom columns), sheet 2 = every
// contract / order line inside those groups. Follows the company picked on the page (?companyGuid=).
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const picked = resolveScopedCompanyGuid(user, request);
  const names = await loadCompanyNames();

  const [groups] = await mysqlPool.query(
    `SELECT guid, companyGuid, name, customValues, createdAt FROM contract_groups WHERE isDeleted = 0 ${picked ? "AND companyGuid = ?" : ""} ORDER BY createdAt DESC`,
    picked ? [picked] : []
  );
  const [columns] = await mysqlPool.query("SELECT guid, label FROM contract_group_columns WHERE isActive = 1 ORDER BY displayOrder, createdAt");
  const guids = groups.map((g) => g.guid);
  const [rows] = guids.length ? await mysqlPool.query("SELECT * FROM contract_group_rows WHERE groupGuid IN (?) ORDER BY rowDate ASC, sortOrder ASC", [guids]) : [[]];
  const byGroup = new Map();
  for (const r of rows) { if (!byGroup.has(r.groupGuid)) byGroup.set(r.groupGuid, []); byGroup.get(r.groupGuid).push(r); }
  const [statuses] = await mysqlPool.query("SELECT guid, label FROM contract_group_commission_statuses");
  const statusName = new Map(statuses.map((s) => [s.guid, s.label]));

  const groupHeaders = ["#", "Group Name", "Company", "No. of Contracts", "Total Order Value", "Pending Dispatch", ...columns.map((c) => c.label)];
  const groupData = groups.map((g, i) => {
    const rs = (byGroup.get(g.guid) || []).filter((r) => !CANCELLED_SOURCE_STATUSES.includes(r.sourceStatus));
    const cv = parseJson(g.customValues, {});
    const line = {
      "#": i + 1, "Group Name": g.name, "Company": names.get(g.companyGuid) || "",
      "No. of Contracts": new Set((byGroup.get(g.guid) || []).map((r) => r.contractNumber)).size,
      "Total Order Value": round2(rs.reduce((s, r) => s + num(r.orderAmount), 0)),
      "Pending Dispatch": rs.reduce((s, r) => s + Math.max(num(r.orderQty) - num(r.qtyDelivered), 0), 0),
    };
    for (const c of columns) line[c.label] = cv[c.guid] ?? "";
    return line;
  });

  const lineHeaders = ["Group Name", "Company", "Date", "Firm", "Contract Number", "Item", "Order Qty", "Landing Price", "Qty Delivered", "Qty Short", "Order Amount", "Commission", "Commission Status", "GST %", "Source Status"];
  const lineData = [];
  for (const g of groups) {
    for (const r of byGroup.get(g.guid) || []) {
      const c = calcRow(r);
      lineData.push({
        "Group Name": g.name, "Company": names.get(g.companyGuid) || "", "Date": fmtDate(r.rowDate), "Firm": r.firm || "", "Contract Number": r.contractNumber || "",
        "Item": r.item || "", "Order Qty": num(r.orderQty), "Landing Price": r.landingPrice == null ? "" : num(r.landingPrice), "Qty Delivered": num(r.qtyDelivered),
        "Qty Short": c.short, "Order Amount": num(r.orderAmount), "Commission": num(r.commission), "Commission Status": statusName.get(r.commStatusGuid) || "",
        "GST %": num(r.gstPct), "Source Status": r.sourceStatus || "",
      });
    }
  }

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, sheetFromObjects(groupData, groupHeaders, [5, 44, 28, 16, 18, 16, ...columns.map(() => 18)]), "Groups");
  xlsx.utils.book_append_sheet(wb, sheetFromObjects(lineData, lineHeaders, [40, 26, 12, 26, 24, 44, 10, 13, 12, 10, 14, 12, 16, 8, 14]), "Group Contracts");
  return workbookResponse(wb, `contract_groups_${new Date().toISOString().slice(0, 10)}.xlsx`);
});
