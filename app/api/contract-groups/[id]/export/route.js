import * as xlsx from "xlsx";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { authorizeGroups, loadGroupOrThrow } from "@/lib/contractGroupsHelpers";
import { calcRow, round2, num, sheetFromObjects, workbookResponse } from "@/lib/contractGroupsExcel";

const CANCELLED = new Set(["Cancelled", "Order Cancelled"]);
const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const safeName = (s) => String(s || "group").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "group";

// Whole group table (all columns, computed values included) as Excel.
export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const { id } = await params;
  const group = await loadGroupOrThrow(id, user);

  const [rows] = await mysqlPool.query("SELECT * FROM contract_group_rows WHERE groupGuid = ? ORDER BY rowDate ASC, sortOrder ASC", [group.guid]);
  const [statuses] = await mysqlPool.query("SELECT guid, label FROM contract_group_commission_statuses");
  const statusName = new Map(statuses.map((s) => [s.guid, s.label]));

  const headers = [
    "#", "Date", "Firm", "Contract No", "Item", "Order Qty", "Landing Price", "Total Landing Amount", "Qty Short", "Qty Delivered",
    "Order Amount", "Per Unit Price", "Sort Qty Amount", "Delivered Qty Amount", "Sort Amount W/T", "Delivered Amount W/T",
    "Sort Amount (After 10% Less)", "Comm on Delivered (20/10%)", "Commission", "Commission Status", "GST %", "Source Status",
  ];
  const tot = { qty: 0, totalLanding: 0, short: 0, delivered: 0, amount: 0, sortAmt: 0, delAmt: 0, sortWT: 0, delWT: 0, afterLess: 0, commission: 0 };
  const data = rows.map((r, i) => {
    const c = calcRow(r);
    if (!CANCELLED.has(r.sourceStatus)) {
      tot.qty += num(r.orderQty); tot.totalLanding += c.totalLanding; tot.short += c.short; tot.delivered += num(r.qtyDelivered);
      tot.amount += num(r.orderAmount); tot.sortAmt += c.sortAmt; tot.delAmt += c.delAmt; tot.sortWT += c.sortWT; tot.delWT += c.delWT;
      tot.afterLess += c.afterLess; tot.commission += num(r.commission);
    }
    return {
      "#": i + 1, "Date": fmtDate(r.rowDate), "Firm": r.firm || "", "Contract No": r.contractNumber || "", "Item": r.item || "",
      "Order Qty": num(r.orderQty), "Landing Price": r.landingPrice == null ? "" : num(r.landingPrice), "Total Landing Amount": round2(c.totalLanding),
      "Qty Short": c.short, "Qty Delivered": num(r.qtyDelivered), "Order Amount": num(r.orderAmount), "Per Unit Price": round2(c.perUnit),
      "Sort Qty Amount": round2(c.sortAmt), "Delivered Qty Amount": round2(c.delAmt), "Sort Amount W/T": round2(c.sortWT),
      "Delivered Amount W/T": round2(c.delWT), "Sort Amount (After 10% Less)": round2(c.afterLess), "Comm on Delivered (20/10%)": r.commLabel || "",
      "Commission": num(r.commission), "Commission Status": statusName.get(r.commStatusGuid) || "", "GST %": num(r.gstPct), "Source Status": r.sourceStatus || "",
    };
  });
  if (data.length) {
    data.push({
      "#": "", "Date": "", "Firm": "", "Contract No": "", "Item": "Total (excluding cancelled)", "Order Qty": tot.qty, "Landing Price": "",
      "Total Landing Amount": round2(tot.totalLanding), "Qty Short": tot.short, "Qty Delivered": tot.delivered, "Order Amount": round2(tot.amount),
      "Per Unit Price": "", "Sort Qty Amount": round2(tot.sortAmt), "Delivered Qty Amount": round2(tot.delAmt), "Sort Amount W/T": round2(tot.sortWT),
      "Delivered Amount W/T": round2(tot.delWT), "Sort Amount (After 10% Less)": round2(tot.afterLess), "Comm on Delivered (20/10%)": "",
      "Commission": round2(tot.commission), "Commission Status": "", "GST %": "", "Source Status": "",
    });
  }

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, sheetFromObjects(data, headers, [5, 12, 26, 24, 44, 10, 13, 16, 10, 12, 14, 13, 15, 17, 15, 17, 20, 18, 12, 16, 8, 14]), "Group");
  return workbookResponse(wb, `contract_group_${safeName(group.name)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
});
