import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeOrdersRequest, requireAuth, requireCompany, canManageOrderDocuments, ApiError } from "@/lib/auth";
import { saveUploadedFile } from "@/lib/upload";
import { withErrorHandling } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  authorizeOrdersRequest(user, "POST", new URL(request.url).pathname, null);
  const { id } = await params;

  const formData = await request.formData();
  const file = formData.get("file");
  const docType = formData.get("docType");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");

  if (!canManageOrderDocuments(user, docType)) {
    throw new ApiError(403, "You cannot upload this document type.");
  }

  const DOC_TYPE_FOLDERS = { gemContract: "contract", pod: "pod", ewayBill: "ewayBill", invoice: "invoice" };
  const saved = await saveUploadedFile(file, { folder: DOC_TYPE_FOLDERS[docType] });
  const filename = saved.filename;

  if (id !== "0") {
    const [itemRows] = await mysqlPool.query("SELECT orderGuid FROM order_items WHERE guid=? AND companyGuid=?", [id, user.companyId]);
    if (!itemRows.length) throw new ApiError(404, "Order not found");
    const orderId = itemRows[0].orderGuid;
    if (docType === "gemContract") {
      await mysqlPool.query("UPDATE order_items SET contractFilename=? WHERE guid=? AND companyGuid=?", [filename, id, user.companyId]);
    } else if (docType === "pod") {
      await mysqlPool.query("UPDATE order_logistics SET podFilename=? WHERE orderGuid=? AND companyGuid=?", [filename, orderId, user.companyId]);
    } else if (docType === "ewayBill") {
      await mysqlPool.query("UPDATE orders SET ewayBillFilename=? WHERE guid=? AND companyGuid=?", [filename, orderId, user.companyId]);
    } else if (docType === "invoice") {
      await mysqlPool.query("UPDATE orders SET invoiceFilename=? WHERE guid=? AND companyGuid=?", [filename, orderId, user.companyId]);
    }
    await mysqlPool.query("INSERT INTO orderdocuments (guid, companyGuid, dispatchGuid, docType, filename) VALUES (UUID(),?,?,?,?)", [user.companyId, id, docType, filename]);
  }

  // Derived from the incoming request, not process.env.BACKEND_URI (a
  // leftover from the old split Frontend4+Backend4 deployment, pointing at
  // whatever localhost port that env var happened to be set to during local
  // dev) — that produced a URL that only ever resolved on one specific
  // machine, breaking this link everywhere else. Same class of bug as
  // app/api/warranty/template/upload-*.
  const origin = new URL(request.url).origin;
  return NextResponse.json({ message: "File uploaded successfully", filename, url: `${origin}/uploads/${filename}` });
});
