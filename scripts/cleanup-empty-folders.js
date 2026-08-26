// Trashes any now-empty top-level (root) folders in the configured Drive
// account/folder — e.g. the flat Contracts/Invoices/etc. folders left behind
// after reorganize-into-company.js moved everything out of them, which that
// script didn't clean up itself.
require("dotenv").config({ path: ".env.local" });
const { google } = require("googleapis");

function getOAuthClient() {
  const c = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
  c.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return c;
}

async function main() {
  const drive = google.drive({ version: "v3", auth: getOAuthClient() });
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  const topLevel = await drive.files.list({
    q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const folders = topLevel.data.files || [];
  console.log(`${folders.length} top-level folders found.`);

  let trashed = 0;
  for (const folder of folders) {
    const contents = await drive.files.list({
      q: `'${folder.id}' in parents and trashed=false`,
      fields: "files(id)",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const isEmpty = !contents.data.files?.length;
    if (isEmpty) {
      await drive.files.update({ fileId: folder.id, requestBody: { trashed: true }, supportsAllDrives: true });
      console.log(`Trashed empty folder: ${folder.name}`);
      trashed++;
    } else {
      console.log(`Kept (not empty): ${folder.name}`);
    }
  }

  console.log(`\nDone. Trashed ${trashed} empty folder(s).`);
}

main().catch((e) => { console.error("Cleanup failed:", e); process.exit(1); });
