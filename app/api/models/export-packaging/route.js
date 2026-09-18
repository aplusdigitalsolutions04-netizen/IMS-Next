import { NextResponse } from "next/server";
import * as xlsx from "xlsx";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeReadWrite, requireCompany, resolveScopedCompanyGuid } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

const authorize = (user, method) =>
  authorizeReadWrite(user, method, {
    permission: "print_models",
    editColumnName: "allow_edit_models",
    adminOnlyDelete: true,
    denyMessage: "You do not have permission to manage models.",
  });

// Companion to import-packaging/route.js — same column labels, so an
// unedited re-export of this file, filled in with new numbers, imports
// straight back in. itemVariantId is included (and is what import actually
// matches on) so a renamed item/variant still round-trips correctly.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorize(user, "GET");

  const companyGuid = resolveScopedCompanyGuid(user, request);
  const clause = companyGuid ? "AND itv.companyGuid = ?" : "";
  const params = companyGuid ? [companyGuid] : [];

  const [rows] = await mysqlPool.query(`
    SELECT itv.itemVariantId, i.itemName, itv.variantName as variantCode,
      itv.packagingCost, itv.packageLength, itv.packageWidth, itv.packageHeight, itv.packageWeight
    FROM inventoryitemvariant itv
    JOIN inventoryitemmaster i ON itv.itemId = i.itemId AND i.isDeleted = 0
    WHERE itv.isDeleted = 0 ${clause}
    ORDER BY i.itemName ASC, itv.variantName ASC
  `, params);

  const exportRows = rows.map((r) => ({
    "Item Variant ID": r.itemVariantId,
    "Item Name": r.itemName,
    "Variant Code": r.variantCode || "",
    "Packaging Cost": r.packagingCost || "",
    "Length": r.packageLength ?? "",
    "Width": r.packageWidth ?? "",
    "Height": r.packageHeight ?? "",
    "Weight": r.packageWeight ?? "",
  }));

  const worksheet = xlsx.utils.json_to_sheet(exportRows.length ? exportRows : [{ "Item Variant ID": "" }]);
  worksheet["!cols"] = Object.keys(exportRows[0] || { "Item Variant ID": "" }).map(() => ({ wch: 20 }));

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Packaging");

  const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=packaging_cost_dimensions_${Date.now()}.xlsx`,
    },
  });
});
