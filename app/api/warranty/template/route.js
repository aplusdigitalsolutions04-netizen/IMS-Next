import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany } from "@/lib/auth";
import { authorizeWarranty } from "@/lib/warrantyAuth";
import { logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "GET");

  const [rows] = await mysqlPool.query("SELECT * FROM warranty_template WHERE companyGuid=? LIMIT 1", [user.companyId]);
  return NextResponse.json(rows[0] || {});
});

// Accepts any combination of: htmlBody, docxRawText, docxFileName, docxBase64
// One row per company — auto-created on first save (was a single global id=1
// row before multi-company support; each company now gets its own template).
export const PUT = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "PUT");

  const { htmlBody, docxRawText, docxFileName, docxBase64, clearHeader, clearSignature,
    emailSubject, emailBody, emailTo, emailCc, emailBcc } = body;

  const setClauses = [];
  const sqlParams = [];

  if (htmlBody !== undefined) { setClauses.push("htmlBody=?"); sqlParams.push(htmlBody); }
  if (docxRawText !== undefined) { setClauses.push("docxRawText=?"); sqlParams.push(docxRawText); }
  if (docxFileName !== undefined) { setClauses.push("docxFileName=?"); sqlParams.push(docxFileName); }
  if (docxBase64 !== undefined) {
    setClauses.push("docxBinary=?");
    sqlParams.push(docxBase64 ? Buffer.from(docxBase64, "base64") : null);
  }
  if (emailSubject !== undefined) { setClauses.push("emailSubject=?"); sqlParams.push(emailSubject); }
  if (emailBody !== undefined) { setClauses.push("emailBody=?"); sqlParams.push(emailBody); }
  if (emailTo !== undefined) { setClauses.push("emailTo=?"); sqlParams.push(emailTo); }
  if (emailCc !== undefined) { setClauses.push("emailCc=?"); sqlParams.push(emailCc); }
  if (emailBcc !== undefined) { setClauses.push("emailBcc=?"); sqlParams.push(emailBcc); }
  if (clearHeader) {
    setClauses.push("headerImagePath=?");
    sqlParams.push(null);
    setClauses.push("headerHtml=?");
    sqlParams.push(null);
  }
  if (clearSignature) {
    setClauses.push("signatureImagePath=?");
    sqlParams.push(null);
  }

  if (setClauses.length > 0) {
    const [existing] = await mysqlPool.query("SELECT id FROM warranty_template WHERE companyGuid=? LIMIT 1", [user.companyId]);
    if (existing.length > 0) {
      await mysqlPool.query(`UPDATE warranty_template SET ${setClauses.join(",")} WHERE companyGuid=?`, [...sqlParams, user.companyId]);
    } else {
      await mysqlPool.query("INSERT INTO warranty_template (companyGuid) VALUES (?)", [user.companyId]);
      await mysqlPool.query(`UPDATE warranty_template SET ${setClauses.join(",")} WHERE companyGuid=?`, [...sqlParams, user.companyId]);
    }
  }

  await logUserActivity(mysqlPool, user, "Update Warranty Template", [], request.headers.get("x-forwarded-for") || null);
  return NextResponse.json({ message: "Template updated" });
});
