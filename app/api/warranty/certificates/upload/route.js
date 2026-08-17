import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeWarranty } from "@/lib/warrantyAuth";
import { ensureCertFilenameColumn } from "@/lib/warrantyCerts";
import { logUserActivity } from "@/lib/helpers";
import { saveUploadedFile, getCompanyName, deleteUploadedFile } from "@/lib/upload";
import { withErrorHandling } from "@/lib/apiResponse";

// Alternative to app/api/warranty/certificates/route.js's POST (which saves
// an in-app-generated htmlContent) — this saves an already-existing
// certificate file instead. One certificate per order either way: uploading
// here replaces whatever that order already had (generated or previously
// uploaded), same "one row per orderGuid" shape the HTML flow already uses.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "POST");
  await ensureCertFilenameColumn();

  const formData = await request.formData();
  const file = formData.get("file");
  const orderGuid = formData.get("orderGuid");
  const orderNumber = formData.get("orderNumber");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");
  if (!orderGuid) throw new ApiError(400, "orderGuid is required");

  const companyName = await getCompanyName(user.companyId);
  const saved = await saveUploadedFile(file, { prefix: "warranty-cert", folder: "warrantyCert", companyName });

  const [[existing]] = await mysqlPool.query(
    "SELECT guid, certFilename FROM wc_certs WHERE orderGuid=? AND companyGuid=?",
    [orderGuid, user.companyId]
  );

  let guid;
  if (existing) {
    guid = existing.guid;
    await mysqlPool.query(
      "UPDATE wc_certs SET certFilename=?, htmlContent=NULL, status='final', updatedAt=NOW() WHERE guid=? AND companyGuid=?",
      [saved.filename, guid, user.companyId]
    );
    if (existing.certFilename && existing.certFilename !== saved.filename) {
      deleteUploadedFile(existing.certFilename).catch(() => {});
    }
  } else {
    guid = uuidv4();
    await mysqlPool.query(
      "INSERT INTO wc_certs (guid, companyGuid, orderGuid, orderNumber, certFilename, status, createdBy) VALUES (?,?,?,?,?,'final',?)",
      [guid, user.companyId, orderGuid, orderNumber || null, saved.filename, user?.username || "unknown"]
    );
  }

  await logUserActivity(mysqlPool, user, "Upload Warranty Certificate", [{ field: "order", newValue: orderNumber || orderGuid }], request.headers.get("x-forwarded-for") || null);

  return NextResponse.json({ message: "Certificate uploaded", guid, filename: saved.filename });
});
