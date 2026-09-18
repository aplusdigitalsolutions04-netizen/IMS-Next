import { NextResponse } from "next/server";
import * as xlsx from "xlsx";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeReadWrite, requireCompany, requirePermission, resolveScopedCompanyGuid } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

const authorize = (user, method) =>
  authorizeReadWrite(user, method, {
    permission: "contracts",
    adminOnlyDelete: true,
    deleteFlag: "allow_delete_contracts",
    denyMessage: "You do not have permission to manage contracts.",
  });

const parseProducts = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// One row per product, contract-level fields repeated on every row — the
// exact shape app/api/contracts/import/route.js expects back, so this pair
// round-trips: export, edit in Excel, re-import. `yyyy-MM-dd` (not a locale
// display format) for every date column so re-parsing on import is
// unambiguous. Column order/labels here must stay in sync with IMPORT_COLUMNS
// in the import route — labels are the join between the two.
// mysql2 hands DATE/DATETIME columns back as JS Date objects representing
// local midnight for that calendar date, not a true UTC instant — String(date)
// gives a locale-ish "Wed Apr 29 2026 ..." form, and toISOString() shifts the
// date back a day for any positive UTC offset (e.g. IST). Building the string
// from the Date's own local year/month/day fields avoids both.
const toDateCell = (val) => {
  if (!val) return "";
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "contracts", "You do not have permission to access contracts.");
  authorize(user, "GET");

  const companyGuid = resolveScopedCompanyGuid(user, request);
  const clause = companyGuid ? "AND companyGuid = ?" : "";
  const params = companyGuid ? [companyGuid] : [];

  const [contracts] = await mysqlPool.query(
    `SELECT * FROM contracts WHERE isDeleted = 0 ${clause} ORDER BY createdAt DESC`,
    params
  );

  const rows = [];
  contracts.forEach((c) => {
    const contractCells = {
      "Contract Number": c.contractNumber || "",
      "Bid Number": c.bidNumber || "",
      "Generated Date": toDateCell(c.generatedDate),
      "Buyer Contact": c.buyerContact || "",
      "Buyer Email": c.buyerEmail || "",
      "Buyer GSTIN": c.buyerGstin || "",
      "Buyer Address": c.buyerAddress || "",
      "Ministry": c.ministry || "",
      "Department": c.department || "",
      "Organisation": c.organisation || "",
      "Office Zone": c.officeZone || "",
      "Seller Company": c.sellerCompany || "",
      "Seller Contact": c.sellerContact || "",
      "Seller GSTIN": c.sellerGstin || "",
      "Consignee Designation": c.consigneeDesignation || "",
      "Consignee Email": c.consigneeEmail || "",
      "Consignee Contact": c.consigneeContact || "",
      "Consignee Address": c.consigneeAddress || "",
      "Delivery Start After": toDateCell(c.deliveryStartAfter),
      "Delivery Completed By": toDateCell(c.deliveryCompletedBy),
      "Delivery Instructions": c.deliveryInstructions || "",
    };
    const products = parseProducts(c.products);
    // A contract with zero products still needs one row (blank product
    // fields), otherwise it'd vanish from the export entirely.
    if (products.length === 0) {
      rows.push({ ...contractCells, "Product Name": "", "Brand": "", "Model": "", "Category & Quadrant": "", "HSN Code": "", "Quantity": "", "Unit Price": "", "Total Value": "" });
    } else {
      products.forEach((p) => {
        rows.push({
          ...contractCells,
          "Product Name": p.productName || "",
          "Brand": p.brand || "",
          "Model": p.model || "",
          "Category & Quadrant": p.categoryQuadrant || "",
          "HSN Code": p.hsnCode || "",
          "Quantity": p.quantity ?? "",
          "Unit Price": p.unitPrice ?? "",
          "Total Value": p.totalValue ?? "",
        });
      });
    }
  });

  const worksheet = xlsx.utils.json_to_sheet(rows.length ? rows : [{ "Contract Number": "" }]);
  worksheet["!cols"] = Object.keys(rows[0] || { "Contract Number": "" }).map(() => ({ wch: 20 }));

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Contracts");

  const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=contracts_export_${Date.now()}.xlsx`,
    },
  });
});
