import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exchangeCodeForTokens } from "@/lib/googleDrive";

// One-time local setup step: visiting /api/google-drive/authorize sends the
// admin through Google's consent screen, which redirects back here with a
// code. We exchange it for a refresh token and persist it straight into
// .env.local so every future upload/download runs unattended.
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

    const envPath = path.join(process.cwd(), ".env.local");
    let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    if (env.includes("GOOGLE_OAUTH_REFRESH_TOKEN=")) {
      env = env.replace(/GOOGLE_OAUTH_REFRESH_TOKEN=.*/, `GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
    } else {
      env += `${env.endsWith("\n") || !env ? "" : "\n"}GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`;
    }
    fs.writeFileSync(envPath, env);

    console.log("[GOOGLE_DRIVE_AUTH] Refresh token saved to .env.local successfully.");

    return new NextResponse(
      "<html><body style='font-family:sans-serif;padding:2rem'>" +
        "<h2>Google Drive connected</h2>" +
        "<p>Refresh token saved to .env.local. Restart the dev server for it to take effect.</p>" +
        "</body></html>",
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
