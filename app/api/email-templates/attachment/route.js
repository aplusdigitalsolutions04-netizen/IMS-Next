import { NextResponse } from "next/server";
import { authenticateRequest, authorizeMasterWrite, ApiError } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/upload";
import { mysqlPool } from "@/lib/db";
import { parseTemplateAttachments } from "@/lib/emailTemplateAttachments";
import { ensureEmailTemplatesAccountColumn } from "@/lib/emailAccountsMigration";

const MAX_BYTES = 15 * 1024 * 1024;

// Stores one file for an email template (it is attached to every mail sent from that template).
// The template form keeps the returned { filename, name, size } and saves it with the template.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "emailTemplates", { isCreate: true, denyMessage: "You do not have permission to edit email templates." });

  const file = (await request.formData()).get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded.");
  if (file.size > MAX_BYTES) throw new ApiError(413, "File too large (max 15 MB).");

  const saved = await saveUploadedFile(file, { folder: "emailTemplateAttachments" });
  if (!saved?.filename) throw new ApiError(500, "Could not save the file.");
  return NextResponse.json({ data: { filename: saved.filename, name: file.name, size: file.size } });
});

// Throws away a file that was uploaded but then removed (or abandoned) before the template was saved,
// so it does not sit in Drive for nothing. A file that a saved template still uses is never deleted.
export const DELETE = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "emailTemplates", { isCreate: true, denyMessage: "You do not have permission to edit email templates." });
  await ensureEmailTemplatesAccountColumn();

  const { filename } = (await request.json().catch(() => ({}))) || {};
  const name = String(filename || "").trim();
  if (!name) throw new ApiError(400, "filename is required.");

  const [rows] = await mysqlPool.query("SELECT attachments FROM email_templates WHERE attachments LIKE ?", [`%${name.replace(/[%_\\]/g, "")}%`]);
  if (rows.some((r) => parseTemplateAttachments(r.attachments).some((a) => a.filename === name))) {
    return NextResponse.json({ message: "File is used by a saved template — kept." });
  }
  await deleteUploadedFile(name);
  return NextResponse.json({ message: "Deleted" });
});
