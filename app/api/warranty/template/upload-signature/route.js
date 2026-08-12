import path from "path";
import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeWarranty } from "@/lib/warrantyAuth";
import { saveUploadedFile } from "@/lib/upload";
import { logUserActivity } from "@/lib/helpers";
import { withErrorHandling } from "@/lib/apiResponse";

// Signature & stamp is always an image (no docx/html/pdf conversion needed
// like the letterhead header) — it gets pasted into the {{SIGNATURE_STAMP}}
// placeholder spot on every generated certificate, so the "print then sign
// by hand" step is no longer needed.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "POST");

  const [existingTpl] = await mysqlPool.query("SELECT id FROM warranty_template WHERE companyGuid=? LIMIT 1", [user.companyId]);
  if (existingTpl.length === 0) await mysqlPool.query("INSERT INTO warranty_template (companyGuid) VALUES (?)", [user.companyId]);

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");

  const ext = path.extname(file.name).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    throw new ApiError(400, "Only PNG, JPG, or WEBP images are allowed for the signature/stamp.");
  }

  const saved = await saveUploadedFile(file, { prefix: `warranty-signature-${Date.now()}`, folder: "warrantyTemplate" });
  await mysqlPool.query("UPDATE warranty_template SET signatureImagePath=? WHERE companyGuid=?", [saved.filename, user.companyId]);

  const backendBase = process.env.BACKEND_URI || `http://localhost:${process.env.PORT || 3011}`;
  await logUserActivity(mysqlPool, user, "Upload Warranty Signature/Stamp", [], request.headers.get("x-forwarded-for") || null);
  return NextResponse.json({ message: "Signature/stamp image uploaded", filePath: saved.filename, previewUrl: `${backendBase}/uploads/${saved.filename}` });
});
