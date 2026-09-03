import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeReadWrite, requireCompany, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { saveUploadedFile, deleteUploadedFile, getCompanyName } from "@/lib/upload";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";

// Attaches/replaces a contract's PDF on Google Drive — for contracts whose
// row was created without going through the normal Upload Contract flow
// (e.g. a direct DB insert), so pdfFilename is empty and there's nothing on
// Drive to open from the contract list.
const authorize = (user, method) =>
  authorizeReadWrite(user, method, {
    permission: "contracts",
    denyMessage: "You do not have permission to manage contracts.",
  });

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "contracts", "You do not have permission to access contracts.");
  authorize(user, "PUT");
  const { id } = await params;

  const [[current]] = await mysqlPool.query(
    "SELECT pdfFilename FROM contracts WHERE guid=? AND companyGuid=? AND isDeleted=0",
    [id, user.companyId]
  );
  if (!current) throw new ApiError(404, "Contract not found");

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "PDF file is required");

  const companyName = await getCompanyName(user.companyId);
  const saved = await saveUploadedFile(file, { prefix: "contract", folder: "contract", companyName });
  if (!saved) throw new ApiError(400, "Failed to upload file");

  await mysqlPool.query(
    "UPDATE contracts SET pdfFilename=?, modifiedBy=?, modifiedAt=NOW() WHERE guid=? AND companyGuid=?",
    [saved.filename, user.username || user.fullName || "Unknown", id, user.companyId]
  );

  // Best-effort — only relevant when this replaces a file that was already there.
  if (current.pdfFilename && current.pdfFilename !== saved.filename) {
    deleteUploadedFile(current.pdfFilename).catch(() => {});
  }

  broadcastRealtimeEvent(user.companyId, "contracts");
  return NextResponse.json({ message: "Contract PDF uploaded.", pdfFilename: saved.filename });
});
