import { NextResponse } from "next/server";
import { authenticateRequest, authorizeMasterWrite, ApiError } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { saveUploadedFile } from "@/lib/upload";

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
