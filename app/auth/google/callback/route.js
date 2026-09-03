import { NextResponse } from "next/server";
import { exchangeCodeForTokens, saveRefreshToken } from "@/lib/googleDrive";

// Visiting /api/google-drive/authorize sends the admin through Google's
// consent screen, which redirects back here with a code. We exchange it for
// a refresh token and store it in the DB (google_drive_auth) — takes effect
// immediately, on any request, no process restart. This used to write the
// token into .env.local on disk instead, which only ever worked for local
// dev: on the real deployment (Passenger shared hosting) that file isn't
// necessarily writable by the app process, and even when it was, there's no
// way to trigger the restart that approach needed — so authorizing on the
// live site silently never took effect.
export async function GET(request) {
  try {
    const code = new URL(request.url).searchParams.get("code");
    if (!code) {
      return NextResponse.json({ message: "Missing authorization code" }, { status: 400 });
    }

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return NextResponse.json(
        {
          message:
            "Google did not return a refresh token. Revoke this app's access at https://myaccount.google.com/permissions and try again so Google issues a fresh one.",
        },
        { status: 500 }
      );
    }

    await saveRefreshToken(tokens.refresh_token);

    console.log("[GOOGLE_DRIVE_AUTH] Refresh token saved successfully.");

    return new NextResponse(
      "<html><body style='font-family:sans-serif;padding:2rem'>" +
        "<h2>Google Drive connected</h2>" +
        "<p>You're all set — uploads and downloads will use this account right away.</p>" +
        "</body></html>",
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
