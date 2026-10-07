import * as xlsx from "xlsx";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { authorizeGroups, loadGroupOrThrow } from "@/lib/contractGroupsHelpers";
import { num, sheetFromObjects, sheetFromLines, workbookResponseWithDropdowns } from "@/lib/contractGroupsExcel";

const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const safeName = (s) => String(s || "group").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "group";

// Import template for ONE group: the editable columns of its current rows (with their Row ID)
// plus instructions and the list of valid Commission Status names.
export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const { id } = await params;
  const group = await loadGroupOrThrow(id, user);

  const [rows] = await mysqlPool.query("SELECT * FROM contract_group_rows WHERE groupGuid = ? ORDER BY rowDate ASC, sortOrder ASC", [group.guid]);
  const [statuses] = await mysqlPool.query("SELECT guid, label, isActive FROM contract_group_commission_statuses ORDER BY displayOrder, createdAt");
  const statusName = new Map(statuses.map((s) => [s.guid, s.label]));

  const headers = ["Row ID", "Date", "Firm", "Contract No", "Item", "Order Qty", "Landing Price", "Qty Delivered", "Order Amount", "Comm on Delivered (20/10%)", "Commission", "Commission Status", "GST %"];
  const data = rows.map((r) => ({
    "Row ID": r.guid, "Date": fmtDate(r.rowDate), "Firm": r.firm || "", "Contract No": r.contractNumber || "", "Item": r.item || "",
    "Order Qty": num(r.orderQty), "Landing Price": r.landingPrice == null ? "" : num(r.landingPrice), "Qty Delivered": num(r.qtyDelivered),
    "Order Amount": num(r.orderAmount), "Comm on Delivered (20/10%)": r.commLabel || "", "Commission": num(r.commission),
    "Commission Status": statusName.get(r.commStatusGuid) || "", "GST %": num(r.gstPct),
  }));

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, sheetFromObjects(data, headers, [38, 12, 26, 24, 44, 10, 13, 12, 14, 18, 12, 16, 8]), "Rows");
  xlsx.utils.book_append_sheet(wb, sheetFromLines([
    `Import template - group "${group.name}"`,
    "",
    "1. Change the values you want in the 'Rows' sheet, then import the file back on this group's page.",
    "2. Do NOT change or delete the 'Row ID' column - it is how each line is matched to the group's row.",
    "3. A blank cell leaves the stored value as it is. Computed columns (totals, short qty, per-unit etc.) are not imported; they recalculate by themselves.",
    "4. Date: yyyy-mm-dd or dd-mm-yyyy. Numbers can have commas or a currency sign.",
    "5. Commission Status: pick it from the dropdown in the cell (the names come from the 'Commission Statuses' sheet), or leave it blank.",
    "6. Rows whose Row ID is not in this group are reported as failed and skipped.",
  ]), "Instructions");
  xlsx.utils.book_append_sheet(wb, sheetFromObjects(statuses.filter((s) => s.isActive).map((s) => ({ "Commission Status": s.label })), ["Commission Status"], [28]), "Commission Statuses");
  const statusCol = String.fromCharCode(65 + headers.indexOf("Commission Status"));
  return workbookResponseWithDropdowns(wb, `contract_group_template_${safeName(group.name)}.xlsx`, [
    { col: statusCol, fromRow: 2, toRow: Math.max(rows.length + 1, 500), listRef: "'Commission Statuses'!$A$2:$A$100", title: "Commission Status", message: "Choose a status from the list (Settings > Commission statuses)." },
  ]);
});
