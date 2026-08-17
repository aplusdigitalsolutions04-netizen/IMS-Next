import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany } from "@/lib/auth";
import { authorizeWarranty } from "@/lib/warrantyAuth";
import { ensureCertFilenameColumn } from "@/lib/warrantyCerts";
import { logUserActivity } from "@/lib/helpers";
import { deleteUploadedFile } from "@/lib/upload";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "POST");
  await ensureCertFilenameColumn();

  const { orderGuid, orderNumber, htmlContent, status, certGuid } = body;
  const createdBy = user?.username || "unknown";

  let response;
  if (certGuid) {
    // Saving generated/edited HTML content supersedes any previously
    // uploaded certificate file for this order — a certificate is either the
    // in-app-generated one or an uploaded file, never both at once.
    const [[current]] = await mysqlPool.query("SELECT certFilename FROM wc_certs WHERE guid=? AND companyGuid=?", [certGuid, user.companyId]);
    if (current?.certFilename) deleteUploadedFile(current.certFilename).catch(() => {});

    await mysqlPool.query(
      "UPDATE wc_certs SET htmlContent=?, certFilename=NULL, status=?, updatedAt=NOW() WHERE guid=? AND companyGuid=?",
      [htmlContent, status || "draft", certGuid, user.companyId]
    );
    response = { message: "Certificate saved", guid: certGuid };
  } else {
    const newGuid = uuidv4();
    await mysqlPool.query(
      "INSERT INTO wc_certs (guid, companyGuid, orderGuid, orderNumber, htmlContent, status, createdBy) VALUES (?,?,?,?,?,?,?)",
      [newGuid, user.companyId, orderGuid, orderNumber, htmlContent, status || "draft", createdBy]
    );
    response = { message: "Certificate created", guid: newGuid };
  }
  await logUserActivity(mysqlPool, user, "Save Warranty Certificate", [{ field: "order", newValue: orderNumber || orderGuid }], request.headers.get("x-forwarded-for") || null);

  return NextResponse.json(response);
});

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "GET");
  await ensureCertFilenameColumn();

  const [rows] = await mysqlPool.query(`
    SELECT
      wc.guid, wc.orderGuid, wc.orderNumber, wc.certFilename,
      wc.status, wc.createdBy, wc.createdAt, wc.updatedAt,
      o.customerName AS customerName,
      o.platform,
      o.gemOrderType
    FROM wc_certs wc
    LEFT JOIN orders o ON wc.orderGuid = o.guid AND o.companyGuid = wc.companyGuid
    WHERE wc.companyGuid = ?
    ORDER BY wc.updatedAt DESC
  `, [user.companyId]);
  return NextResponse.json(rows);
});
