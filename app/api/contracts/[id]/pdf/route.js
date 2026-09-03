import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeReadWrite, hasAllCompaniesAccess, requireCompany, requirePermission, ApiError } from "@/lib/auth";
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

  // Looked up by guid alone, then checked against the contract's own
  // companyGuid — not the session's currently active company. Someone
  // viewing the "All Companies" contract list can be uploading a PDF for a
  // contract that belongs to a different company than whichever one their
  // session happens to be scoped to right now; using user.companyId here
  // would either 404 (mismatch) or file the PDF under the wrong company's
  // Drive folder.
  const [[current]] = await mysqlPool.query(
    "SELECT pdfFilename, companyGuid FROM contracts WHERE guid=? AND isDeleted=0",
    [id]
  );
  if (!current) throw new ApiError(404, "Contract not found");
  if (current.companyGuid !== user.companyId && !hasAllCompaniesAccess(user)) {
    throw new ApiError(403, "You do not have access to this contract's company.");
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "PDF file is required");

  const companyName = await getCompanyName(current.companyGuid);
  const saved = await saveUploadedFile(file, { prefix: "contract", folder: "contract", companyName });
  if (!saved) throw new ApiError(400, "Failed to upload file");

  await mysqlPool.query(
    "UPDATE contracts SET pdfFilename=?, modifiedBy=?, modifiedAt=NOW() WHERE guid=?",
    [saved.filename, user.username || user.fullName || "Unknown", id]
  );

  // Best-effort — only relevant when this replaces a file that was already there.
  if (current.pdfFilename && current.pdfFilename !== saved.filename) {
    deleteUploadedFile(current.pdfFilename).catch(() => {});
  }

  broadcastRealtimeEvent(current.companyGuid, "contracts");
  return NextResponse.json({ message: "Contract PDF uploaded.", pdfFilename: saved.filename });
});
