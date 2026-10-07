import { NextResponse } from "next/server";
import { authenticateRequest, requireAuth, requirePermission, requireEditPermission, ApiError } from "@/lib/auth";
import { saveUploadedFile } from "@/lib/upload";
import { withErrorHandling } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requirePermission(user, "tasks", "You do not have permission to access tasks.");
  requireEditPermission(user, "allow_assign_tasks");

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");

  const saved = await saveUploadedFile(file, { prefix: "task", folder: "taskAttachment" });
  return NextResponse.json({ message: "Success", filename: saved.filename });
});
