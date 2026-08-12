import path from "path";
import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeOrdersRequest, requireAuth, ApiError } from "@/lib/auth";
import { deleteUploadedFile } from "@/lib/upload";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const DELETE = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeOrdersRequest(user, "DELETE", new URL(request.url).pathname, null);
  requireAuth(user);

  if (!user?.allow_edit_order_processing && !user?.allow_edit_billing && !user?.allow_edit_dispatch) {
    throw new ApiError(403, "You do not have permission to delete documents.");
  }

  const { filename } = await parseJsonBody(request);
  if (!filename) throw new ApiError(400, "filename required");

  const safeFilename = path.basename(String(filename));

  const [result] = await mysqlPool.query("DELETE FROM orderdocuments WHERE filename=?", [safeFilename]);
  if (!result.affectedRows) throw new ApiError(404, "Document not found");

  await deleteUploadedFile(safeFilename);

  return NextResponse.json({ message: "Document deleted" });
});
