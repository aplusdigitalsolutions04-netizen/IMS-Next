import { NextResponse } from "next/server";
import { authenticateRequest, requirePermission } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { migrateLocalFilesToDrive } from "@/lib/upload";

// Backfills whatever's still sitting in the local uploads/ folder (from
// before the Google Drive migration, or files manually placed there e.g.
// via FTP) into Drive. Safe to run more than once — already-migrated files
// are skipped based on drive_files.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "googleDrive", "Only Admin can migrate uploaded files.");

  const result = await migrateLocalFilesToDrive();
  return NextResponse.json(result);
});
