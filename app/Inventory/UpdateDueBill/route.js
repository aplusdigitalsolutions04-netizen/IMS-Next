import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requireEditPermission, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureStockInDueColumn, requireDueBillEnabled } from "@/lib/stockInDueMigration";

// Fills in the purchase bill details (vendor, invoice no, invoice date) on a
// stock-in that was finalized without them, and takes it off the Due list.
export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);
  requireCompany(user);
  requireEditPermission(user, "allow_due_purchase_bill");
  await requireDueBillEnabled(user);
  await ensureStockInDueColumn();

  const { stockInId, vendorId, invoiceNo, invoiceDate, invoiceFile } = body;
  if (!stockInId || !vendorId || !String(invoiceNo || "").trim() || !invoiceDate) {
    throw new ApiError(400, "Vendor, Invoice No and Invoice Date are required.");
  }

  const [result] = await mysqlPool.execute(
    `UPDATE inventorystockin
     SET vendorId = ?, invoiceNo = ?, invoiceDate = ?, invoiceFile = COALESCE(?, invoiceFile), isDue = 0
     WHERE stockInId = ? AND status = 1 AND isDue = 1 AND isDeleted = 0 AND companyGuid = ?`,
    [vendorId, String(invoiceNo).trim(), invoiceDate, invoiceFile || null, stockInId, user.companyId]
  );
  if (result.affectedRows === 0) throw new ApiError(404, "Due purchase bill not found or already completed.");

  return NextResponse.json({ message: "Success" });
});
