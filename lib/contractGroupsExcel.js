import * as xlsx from "xlsx";
import { NextResponse } from "next/server";
import JSZip from "jszip";

// Excel export / import / templates for Contract Groups (shared by the 6 routes under
// app/api/contract-groups/**/export|template|import).

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Same formulas as the group table on screen (components/contractGroups/ContractGroupDetail.jsx).
export function calcRow(r) {
  const qty = num(r.orderQty), landing = num(r.landingPrice), delivered = num(r.qtyDelivered), amount = num(r.orderAmount);
  const g = 1 + num(r.gstPct) / 100;
  const perUnit = qty ? amount / qty : 0;
  const sortAmt = perUnit * (qty - delivered);
  const delAmt = perUnit * delivered;
  const sortWT = sortAmt / g;
  const delWT = delAmt / g;
  return { totalLanding: qty * landing, short: qty - delivered, perUnit, sortAmt, delAmt, sortWT, delWT, afterLess: sortWT * 0.8 };
}

export const round2 = (v) => Math.round(num(v) * 100) / 100;

export function sheetFromObjects(rows, headers, widths) {
  const ws = xlsx.utils.json_to_sheet(rows.length ? rows : [Object.fromEntries(headers.map((h) => [h, ""]))], { header: headers });
  ws["!cols"] = headers.map((h, i) => ({ wch: widths?.[i] || Math.max(14, h.length + 2) }));
  return ws;
}

export function sheetFromLines(lines) {
  const ws = xlsx.utils.aoa_to_sheet(lines.map((l) => [l]));
  ws["!cols"] = [{ wch: 110 }];
  return ws;
}

export function workbookResponse(wb, filename) {
  const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// Same as workbookResponse, but also puts real Excel dropdown lists (data validation) on columns of
// sheet 1. SheetJS's free build can't write validations, so they are added to the sheet XML afterwards.
//   validations: [{ col: "L", fromRow: 2, toRow: 500, listRef: "'Commission Statuses'!$A$2:$A$60", title, message }]
export async function workbookResponseWithDropdowns(wb, filename, validations) {
  const raw = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  const zip = await JSZip.loadAsync(raw);
  const path = "xl/worksheets/sheet1.xml";
  let xml = await zip.file(path).async("string");
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const items = validations.map((v) =>
    `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="${esc(v.title || "Invalid value")}" error="${esc(v.message || "Pick a value from the list")}" sqref="${v.col}${v.fromRow}:${v.col}${v.toRow}"><formula1>${esc(v.listRef)}</formula1></dataValidation>`
  ).join("");
  const block = `<dataValidations count="${validations.length}">${items}</dataValidations>`;
  // schema order: ... sheetData, ..., dataValidations, ..., pageMargins, ..., ignoredErrors
  // (SheetJS writes <ignoredErrors> right after sheetData, and that must come AFTER dataValidations)
  const anchor = ["<ignoredErrors", "<pageMargins", "</worksheet>"].find((a) => xml.includes(a));
  xml = xml.replace(anchor, `${block}${anchor}`);
  zip.file(path, xml);
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return new NextResponse(buffer, {
    headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": `attachment; filename="${filename}"` },
  });
}

// ---- reading an uploaded sheet ------------------------------------------------------------
const norm = (s) => String(s || "").toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(/[^a-z0-9]/g, "");

// Reads the first sheet that has data; finds the header row among the top rows
// (title rows above the table are fine) using `isHeader(mappedColumns)`.
export function readSheetRows(buffer, columnDefs, minColumns = 1) {
  const wb = xlsx.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames.find((n) => (wb.Sheets[n]["!ref"] || "") !== "") || wb.SheetNames[0];
  const grid = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: true });
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const map = {};
    const used = new Set();
    for (const [field, aliases] of Object.entries(columnDefs)) {
      const idx = grid[r].findIndex((h, i) => !used.has(i) && aliases.includes(norm(h)));
      if (idx >= 0) { map[field] = idx; used.add(idx); }
    }
    if (Object.keys(map).length >= minColumns && columnDefs.__required.every((f) => map[f] !== undefined)) {
      const data = grid.slice(r + 1).map((row, i) => ({ rowNum: r + 2 + i, row })).filter((x) => x.row.some((c) => String(c).trim() !== ""));
      return { map, data, headers: grid[r].map((h) => String(h).trim()).filter(Boolean) };
    }
  }
  return { map: null, data: [], headers: (grid[0] || []).map((h) => String(h).trim()).filter(Boolean) };
}

export const cellOf = (entry, map, field) => (map[field] === undefined ? "" : entry.row[map[field]]);

// "1,250", "₹ 1250", "30 pcs" -> number; "" -> null (= leave as is); junk -> NaN
export function parseNumberCell(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const t = String(v).trim();
  if (!t || t === "-") return null;
  const m = t.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

// Excel date cell (Date / serial number / "dd-mm-yyyy" / "yyyy-mm-dd") -> "YYYY-MM-DD"; "" -> null; junk -> undefined
export function parseDateCell(v) {
  if (v === undefined || v === null || v === "") return null;
  const pad = (n) => String(n).padStart(2, "0");
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? undefined : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return undefined;
}

export const ROW_COLUMNS = (() => {
  const defs = {
    rowId: ["rowid", "id", "guid"],
    rowDate: ["date"],
    firm: ["firm", "firmname", "company"],
    contractNumber: ["contractno", "contractnumber", "contract"],
    item: ["item", "product", "itemname"],
    orderQty: ["orderqty", "qty", "quantity"],
    landingPrice: ["landingprice", "landing"],
    qtyDelivered: ["qtydelivered", "delivered", "deliveredqty"],
    orderAmount: ["orderamount", "amount"],
    commLabel: ["commondelivered", "commondelivered2010", "commissionondelivered"],
    commission: ["commission"],
    commStatus: ["commissionstatus", "commstatus", "status"],
    gstPct: ["gst", "gstpct", "gstpercent"],
  };
  Object.defineProperty(defs, "__required", { value: ["rowId"], enumerable: false });
  return defs;
})();

export const GROUP_COLUMNS = (() => {
  const defs = {
    groupName: ["groupname", "group", "name"],
    contractNumber: ["contractnumber", "contractno", "contract"],
  };
  Object.defineProperty(defs, "__required", { value: ["groupName", "contractNumber"], enumerable: false });
  return defs;
})();
