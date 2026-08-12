import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/googleDrive";
import { authenticateRequest, requirePermission } from "@/lib/auth";

export async function GET(request) {
  try {
    const user = await authenticateRequest(request);
    requirePermission(user, "googleDrive", "You do not have permission to access Google Drive integration.");

    return NextResponse.redirect(getAuthUrl());
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: err.status || 500 });
  }
}
