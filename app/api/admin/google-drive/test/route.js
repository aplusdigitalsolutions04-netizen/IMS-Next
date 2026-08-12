import { NextResponse } from "next/server";
import { authenticateRequest, requireRoles } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { testDriveConnection } from "@/lib/googleDrive";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can test the Google Drive connection.");

  try {
    const { folderName } = await testDriveConnection();
    return NextResponse.json({ connected: true, folderName });
  } catch (err) {
    return NextResponse.json({ connected: false, message: err.message }, { status: 200 });
  }
});
