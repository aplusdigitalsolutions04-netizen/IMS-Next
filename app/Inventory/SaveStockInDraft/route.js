import { NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { validateBody } from "@/lib/validate";

// Every numeric field is `z.coerce.number()` rather than a bare
// `if (!x) ...` check — the previous version silently trusted whatever
// arrived (a string like "abc" for StockInQty would insert as 0 with no
// error, since `"abc" || 0` never short-circuits on a non-empty string).
const bodySchema = z.object({
  StockInId: z.string().min(1, "is required"),
  StockInDetailId: z.string().nullish(),
  VendorId: z.string().nullish(),
  InvoiceNo: z.string().nullish(),
  InvoiceDate: z.string().nullish(),
  ItemVariantId: z.string().nullish(),
  modelGuid: z.string().nullish(),
  godownGuid: z.string().nullish(),
  UnitId: z.string().nullish(),
  Barcode: z.string().nullish(),
  StockInQty: z.coerce.number().nonnegative().default(0),
  DefaultPcsQty: z.coerce.number().positive().default(1),
  FinalPcsQty: z.coerce.number().nonnegative().default(0),
  PurchaseRate: z.coerce.number().nonnegative().default(0),
  Remarks: z.string().nullish(),
  InvoiceFile: z.string().nullish(),
}).refine((b) => b.ItemVariantId || b.modelGuid, { message: "ItemVariantId or modelGuid is required", path: ["ItemVariantId"] });

export const POST = withErrorHandling(async (request) => {
  const rawBody = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);

  const {
    StockInId, StockInDetailId, VendorId, InvoiceNo, InvoiceDate,
    ItemVariantId, modelGuid, godownGuid, UnitId, Barcode, StockInQty,
    DefaultPcsQty, FinalPcsQty, PurchaseRate,
    Remarks, InvoiceFile,
  } = validateBody(bodySchema, rawBody);

  // Invoice-parse auto-fill fires one of these per item, staggered only by a
  // short client-side setTimeout (see StockIn.jsx's handleInvoiceUpload) —
  // several can still land concurrently and race to lock the same
  // inventorystockin row (the shared UPDATE + totals recalc below), which
  // MySQL/InnoDB can resolve as a deadlock. Retrying the whole transaction
  // once it's rolled back is the standard fix for that, rather than
  // serializing every draft save client-side.
  const MAX_DEADLOCK_RETRIES = 3;
  let currentDetailId;
  for (let attempt = 1; attempt <= MAX_DEADLOCK_RETRIES; attempt++) {
    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();

      const sanitizedInvoiceDate = InvoiceDate && InvoiceDate.trim() !== "" ? InvoiceDate : null;
      const sanitizedVendorId = VendorId && VendorId.trim() !== "" ? VendorId : null;

      await connection.execute(
        "INSERT IGNORE INTO inventorystockin (stockInId, vendorId, invoiceNo, invoiceDate, remarks, invoiceFile, status, companyGuid) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
        [StockInId, sanitizedVendorId, InvoiceNo || null, sanitizedInvoiceDate, Remarks || null, InvoiceFile || null, user.companyId]
      );
      await connection.execute(
        "UPDATE inventorystockin SET vendorId = ?, invoiceNo = ?, invoiceDate = ?, remarks = ?, invoiceFile = ? WHERE stockInId = ? AND status = 0 AND companyGuid = ?",
        [sanitizedVendorId, InvoiceNo || null, sanitizedInvoiceDate, Remarks || null, InvoiceFile || null, StockInId, user.companyId]
      );

      currentDetailId = StockInDetailId;
      if (currentDetailId && currentDetailId !== "null") {
        await connection.execute(
          "UPDATE inventorystockindetail SET itemVariantId = ?, modelGuid = ?, godownGuid = ?, unitId = ?, barcode = ?, stockInQty = ?, defaultPcsQty = ?, finalPcsQty = ?, purchaseRate = ? WHERE stockInDetailId = ? AND companyGuid = ?",
          [ItemVariantId || null, modelGuid || null, godownGuid || null, UnitId || null, Barcode || null, StockInQty || 0, DefaultPcsQty || 1, FinalPcsQty || 0, PurchaseRate || 0, currentDetailId, user.companyId]
        );
      } else {
        const [dup] = await connection.query(
          "SELECT stockInDetailId FROM inventorystockindetail WHERE stockInId = ? AND (itemVariantId = ? OR modelGuid = ?) AND unitId <=> ? AND isDeleted = 0 AND companyGuid = ? LIMIT 1",
          [StockInId, ItemVariantId || "N/A", modelGuid || "N/A", UnitId || null, user.companyId]
        );

        if (dup.length > 0) {
          currentDetailId = dup[0].stockInDetailId;
          await connection.execute(
            "UPDATE inventorystockindetail SET barcode = ?, godownGuid = COALESCE(?, godownGuid), stockInQty = ?, defaultPcsQty = ?, finalPcsQty = ?, purchaseRate = ? WHERE stockInDetailId = ? AND companyGuid = ?",
            [Barcode || null, godownGuid || null, StockInQty || 0, DefaultPcsQty || 1, FinalPcsQty || 0, PurchaseRate || 0, currentDetailId, user.companyId]
          );
        } else {
          currentDetailId = uuidv4();
          await connection.execute(
            "INSERT INTO inventorystockindetail (stockInDetailId, stockInId, itemVariantId, modelGuid, godownGuid, unitId, barcode, stockInQty, defaultPcsQty, finalPcsQty, purchaseRate, companyGuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [currentDetailId, StockInId, ItemVariantId || null, modelGuid || null, godownGuid || null, UnitId || null, Barcode || null, StockInQty || 0, DefaultPcsQty || 1, FinalPcsQty || 0, PurchaseRate || 0, user.companyId]
          );
        }
      }

      const [totals] = await connection.query(
        "SELECT SUM(stockInQty) as totalQty, SUM(stockInQty * purchaseRate) as totalAmount FROM inventorystockindetail WHERE stockInId = ? AND isDeleted = 0 AND companyGuid = ?",
        [StockInId, user.companyId]
      );
      await connection.execute("UPDATE inventorystockin SET totalAmount = ? WHERE stockInId = ? AND companyGuid = ?", [totals[0].totalAmount || 0, StockInId, user.companyId]);

      await connection.commit();
      break;
    } catch (err) {
      await connection.rollback();
      const isDeadlock = err.code === "ER_LOCK_DEADLOCK" || err.errno === 1213;
      if (isDeadlock && attempt < MAX_DEADLOCK_RETRIES) {
        console.warn(`SaveStockInDraft deadlock, retrying (attempt ${attempt}/${MAX_DEADLOCK_RETRIES})`);
        continue;
      }
      console.error("Error in SaveStockInDraft transaction:", err);
      throw err;
    } finally {
      connection.release();
    }
  }
  return NextResponse.json({ message: "Success", data: { stockInDetailId: currentDetailId } });
});
