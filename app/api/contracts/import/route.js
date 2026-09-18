import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import * as xlsx from "xlsx";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeReadWrite, requireCompany, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";

const authorize = (user, method) =>
  authorizeReadWrite(user, method, {
    permission: "contracts",
    adminOnlyDelete: true,
    deleteFlag: "allow_delete_contracts",
    denyMessage: "You do not have permission to manage contracts.",
  });

// Mirrors the "Contract Number" / "Bid Number" / ... header labels this
// route's own export (app/api/contracts/export/route.js) writes — a re-import
// of an unedited export matches every column by exact label. Header lookup is
// case/space-insensitive on top of that so a hand-built sheet (not a re-export)
// still works with reasonably-named columns.
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const pick = (row, ...labels) => {
  for (const label of labels) {
    const key = Object.keys(row).find((k) => norm(k) === norm(label));
    if (key !== undefined && row[key] !== undefined && row[key] !== "") return row[key];
  }
  return "";
};

const toDateOrNull = (val) => {
  if (!val) return null;
  // Excel can hand back either a date-formatted string or (if the cell was
  // typed as a real Excel date) a JS Date via sheet_to_json's default
  // cellDates:false → serial number — sheet_to_json without cellDates:true
  // never gives us a Date instance, so this only needs to handle strings.
  const s = String(val).trim();
  return s || null;
};

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "contracts", "You do not have permission to access contracts.");
  authorize(user, "POST");

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
  if (!data.length) throw new ApiError(400, "Excel file is empty");

  // Group rows by Contract Number — export puts one row per product, all
  // sharing the same contract-level columns, so every row of a group carries
  // identical contract fields; only the product columns actually differ.
  const groups = new Map();
  const rowOrder = [];
  data.forEach((row, i) => {
    const contractNumber = String(pick(row, "Contract Number") || "").trim();
    if (!contractNumber) return;
    if (!groups.has(contractNumber)) { groups.set(contractNumber, []); rowOrder.push(contractNumber); }
    groups.get(contractNumber).push({ rowNum: i + 2, row });
  });

  const results = { success: [], failed: [], skipped: [], totalRows: data.length };
  if (groups.size === 0) {
    throw new ApiError(400, "No rows with a Contract Number were found.");
  }

  const contractNumbers = [...groups.keys()];
  const [existingContracts] = await mysqlPool.query(
    "SELECT contractNumber FROM contracts WHERE contractNumber IN (?) AND companyGuid = ? AND isDeleted = 0",
    [contractNumbers, user.companyId]
  );
  const existingSet = new Set(existingContracts.map((r) => r.contractNumber));
  const [existingOrders] = await mysqlPool.query(
    "SELECT orderid FROM orders WHERE orderid IN (?) AND companyGuid = ? AND isDeleted = 0",
    [contractNumbers, user.companyId]
  );
  const orderedSet = new Set(existingOrders.map((r) => r.orderid));

  const toInsert = [];
  for (const contractNumber of rowOrder) {
    const groupRows = groups.get(contractNumber);
    const firstRowNum = groupRows[0].rowNum;

    if (existingSet.has(contractNumber)) {
      results.skipped.push({ row: firstRowNum, contractNumber, reason: "A contract with this Contract Number already exists" });
      continue;
    }
    if (orderedSet.has(contractNumber)) {
      results.skipped.push({ row: firstRowNum, contractNumber, reason: "An order already exists in Order Processing for this Contract Number" });
      continue;
    }

    const first = groupRows[0].row;
    const products = groupRows
      .map(({ row }) => ({
        productName: String(pick(row, "Product Name") || "").trim(),
        brand: String(pick(row, "Brand") || "").trim(),
        model: String(pick(row, "Model") || "").trim(),
        categoryQuadrant: String(pick(row, "Category & Quadrant", "Category and Quadrant", "Category") || "").trim(),
        hsnCode: String(pick(row, "HSN Code") || "").trim(),
        quantity: pick(row, "Quantity") || "",
        unitPrice: pick(row, "Unit Price") || "",
        totalValue: pick(row, "Total Value") || "",
      }))
      // Drop the placeholder blank-product row a zero-product contract's
      // export writes — nothing here to keep.
      .filter((p) => p.productName || p.brand || p.model || p.hsnCode || p.quantity || p.unitPrice || p.totalValue);

    const guid = randomUUID();
    toInsert.push([
      guid, user.companyId,
      String(pick(first, "Bid Number") || "").trim() || null,
      contractNumber,
      toDateOrNull(pick(first, "Generated Date")),
      String(pick(first, "Buyer Contact") || "").trim() || null,
      JSON.stringify(products),
      String(pick(first, "Buyer Email") || "").trim() || null,
      String(pick(first, "Buyer GSTIN") || "").trim() || null,
      String(pick(first, "Buyer Address") || "").trim() || null,
      toDateOrNull(pick(first, "Delivery Start After")),
      toDateOrNull(pick(first, "Delivery Completed By")),
      String(pick(first, "Delivery Instructions") || "").trim() || null,
      String(pick(first, "Ministry") || "").trim() || null,
      String(pick(first, "Department") || "").trim() || null,
      String(pick(first, "Organisation") || "").trim() || null,
      String(pick(first, "Office Zone") || "").trim() || null,
      String(pick(first, "Seller Company") || "").trim() || null,
      String(pick(first, "Seller Contact") || "").trim() || null,
      String(pick(first, "Seller GSTIN") || "").trim() || null,
      String(pick(first, "Consignee Designation") || "").trim() || null,
      String(pick(first, "Consignee Email") || "").trim() || null,
      String(pick(first, "Consignee Contact") || "").trim() || null,
      String(pick(first, "Consignee Address") || "").trim() || null,
      null, // pdfFilename — imported rows have no PDF; attach later via the row's own upload button
      null, null, null, // aiPromptTokens/aiCompletionTokens/aiTotalTokens
      0, // isDeleted
      user.username || user.fullName || "Unknown", user.username || user.fullName || "Unknown",
    ]);
    results.success.push({ row: firstRowNum, contractNumber, products: products.length });
  }

  if (toInsert.length) {
    try {
      await mysqlPool.query(
        `INSERT INTO contracts (
          guid, companyGuid, bidNumber, contractNumber, generatedDate, buyerContact, products, buyerEmail, buyerGstin,
          buyerAddress, deliveryStartAfter, deliveryCompletedBy, deliveryInstructions, ministry, department, organisation,
          officeZone, sellerCompany, sellerContact, sellerGstin, consigneeDesignation, consigneeEmail,
          consigneeContact, consigneeAddress, pdfFilename, aiPromptTokens, aiCompletionTokens, aiTotalTokens,
          isDeleted, createdBy, modifiedBy
        ) VALUES ?`,
        [toInsert]
      );
      broadcastRealtimeEvent(user.companyId, "contracts");
    } catch (err) {
      // Whole-batch insert failed (e.g. a duplicate that slipped past the
      // pre-check via a race) — nothing here actually got written, so move
      // every row back out of success and into failed instead of reporting
      // successes that didn't happen.
      const failedNumbers = new Set(toInsert.map((r) => r[3]));
      results.success = results.success.filter((s) => !failedNumbers.has(s.contractNumber));
      toInsert.forEach((r) => results.failed.push({ row: "-", contractNumber: r[3], reason: err.code === "ER_DUP_ENTRY" ? "A contract with this Contract Number already exists" : err.message }));
    }
  }

  return NextResponse.json({
    message: `Import completed. Created: ${results.success.length}, Skipped: ${results.skipped.length}, Failed: ${results.failed.length}`,
    results,
  });
});
