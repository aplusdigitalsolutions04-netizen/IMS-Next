import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/googleDrive";
import { authenticateRequest, requirePermission } from "@/lib/auth";

// This route only makes sense as a full browser navigation (it redirects to
// Google's consent screen) — typed into the address bar, or clicked as a
// plain link — so it can never carry the app's normal Authorization header
// the way fetch/axios calls do. GoogleDriveSettings.jsx instead appends the
// session token as ?token=, which gets folded into an Authorization header
// here before the usual authenticateRequest/requirePermission check runs, so
// this route stays exactly as protected as every other admin-only route.
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get("token");
    let authRequest = request;
    if (queryToken && !request.headers.get("authorization")) {
      const headers = new Headers(request.headers);
      headers.set("authorization", `Bearer ${queryToken}`);
      authRequest = new Request(request.url, { headers, method: request.method });
    }

    const user = await authenticateRequest(authRequest);
    requirePermission(user, "googleDrive", "You do not have permission to access Google Drive integration.");

    return NextResponse.redirect(getAuthUrl());
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: err.status || 500 });
  }
}
