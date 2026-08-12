import { NextResponse } from "next/server";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { saveUploadedFile } from "@/lib/upload";
import { withErrorHandling } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");

  const saved = await saveUploadedFile(file, { folder: "stockOutInvoice" });
  return NextResponse.json({ message: "Success", filePath: saved.filename });
});
