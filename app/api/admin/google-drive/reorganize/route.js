import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { reorganizeIntoCompanyFolders } from "@/lib/upload";

// One-off: moves whatever's still sitting in the old flat Contracts/Invoices/
// POD/etc. Drive folders (from before uploads were nested per-company) into
// <companyName>/<that folder>. Safe to re-run — once a flat folder is empty
// it gets trashed, so a second run for the same company just finds nothing
// left to move.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "googleDrive", "Only Admin can reorganize Drive files.");

  const { companyGuid } = await parseJsonBody(request);
  if (!companyGuid) throw new ApiError(400, "companyGuid is required.");

  const [[company]] = await mysqlPool.query("SELECT guid FROM companies WHERE guid = ?", [companyGuid]);
  if (!company) throw new ApiError(404, "Company not found.");

  const result = await reorganizeIntoCompanyFolders(companyGuid);
  return NextResponse.json(result);
});
