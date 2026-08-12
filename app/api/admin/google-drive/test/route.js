import { NextResponse } from "next/server";
import { authenticateRequest, requirePermission } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { testDriveConnection } from "@/lib/googleDrive";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "googleDrive", "Only Admin can test the Google Drive connection.");

  try {
    const { folderName } = await testDriveConnection();
    return NextResponse.json({ connected: true, folderName });
  } catch (err) {
    return NextResponse.json({ connected: false, message: err.message }, { status: 200 });
  }
});
