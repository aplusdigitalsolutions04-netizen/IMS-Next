import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeWarranty } from "@/lib/warrantyAuth";
import { ensureCertFilenameColumn } from "@/lib/warrantyCerts";
import { deleteUploadedFile } from "@/lib/upload";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "GET");
  await ensureCertFilenameColumn();
  const { guid } = await params;

  const [rows] = await mysqlPool.query("SELECT * FROM wc_certs WHERE guid=? AND companyGuid=?", [guid, user.companyId]);
  if (!rows.length) throw new ApiError(404, "Not found");
  return NextResponse.json(rows[0]);
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "DELETE");
  await ensureCertFilenameColumn();
  const { guid } = await params;

  const [[cert]] = await mysqlPool.query("SELECT certFilename FROM wc_certs WHERE guid=? AND companyGuid=?", [guid, user.companyId]);
  const [result] = await mysqlPool.query("DELETE FROM wc_certs WHERE guid=? AND companyGuid=?", [guid, user.companyId]);
  if (result.affectedRows === 0) throw new ApiError(404, "Certificate not found");
  if (cert?.certFilename) deleteUploadedFile(cert.certFilename).catch(() => {});
  return NextResponse.json({ message: "Deleted" });
});
