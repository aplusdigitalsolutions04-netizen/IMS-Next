// One-off: moves every file sitting in the flat top-level Contracts/
// Invoices/POD/Challan/E-Way Bills/Additional Documents/Warranty
// Certificates folders (on whatever Drive account .env.local currently
// points at) into <companyName>/<that folder> instead. Mirrors
// lib/googleDrive.js's moveFlatFolderIntoCompany + lib/upload.js's
// reorganizeIntoCompanyFolders, run standalone so it isn't bound by the
// browser's HTTP request timeout for a batch this size.
require("dotenv").config({ path: ".env.local" });
const { google } = require("googleapis");

const COMPANY_NAME = process.argv[2];
if (!COMPANY_NAME) {
  console.error("Usage: node scripts/reorganize-into-company.js \"Company Name\"");
  process.exit(1);
}

const COMPANY_SCOPED_FOLDERS = ["Contracts", "Invoices", "POD", "Challan", "E-Way Bills", "Additional Documents", "Warranty Certificates"];

function getOAuthClient() {
  const c = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
  c.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return c;
}

async function main() {
  const drive = google.drive({ version: "v3", auth: getOAuthClient() });
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  async function findFolderIdByName(name, parent) {
    const res = await drive.files.list({
      q: `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`,
      fields: "files(id, name)", supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    return res.data.files?.[0]?.id || null;
  }

  async function findOrCreateFolder(name, parent) {
    const existing = await findFolderIdByName(name, parent || rootFolderId);
    if (existing) return existing;
    const created = await drive.files.create({
      requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parent || rootFolderId] },
      fields: "id", supportsAllDrives: true,
    });
    return created.data.id;
  }

  async function moveFlatFolderIntoCompany(flatFolderName, companyName) {
    const oldFolderId = await findFolderIdByName(flatFolderName, rootFolderId);
    if (!oldFolderId) return { moved: 0, note: "no existing flat folder — nothing to move" };

    let files = [];
    let pageToken;
    do {
      const listRes = await drive.files.list({
        q: `'${oldFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
        fields: "nextPageToken, files(id, name)",
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      files = files.concat(listRes.data.files || []);
      pageToken = listRes.data.nextPageToken;
    } while (pageToken);

    if (files.length === 0) return { moved: 0, note: "flat folder is empty" };

    const companyFolderId = await findOrCreateFolder(companyName, rootFolderId);
    const newFolderId = await findOrCreateFolder(flatFolderName, companyFolderId);

    let moved = 0;
    const failed = [];
    for (const file of files) {
      try {
        await drive.files.update({
          fileId: file.id, addParents: newFolderId, removeParents: oldFolderId,
          fields: "id, parents", supportsAllDrives: true,
        });
        moved++;
        if (moved % 100 === 0) console.log(`  ... ${moved}/${files.length} moved in ${flatFolderName}`);
      } catch (err) {
        failed.push({ filename: file.name, error: err.message });
      }
    }

    return { moved, total: files.length, failed };
  }

  for (const folderName of COMPANY_SCOPED_FOLDERS) {
    console.log(`\n${folderName}:`);
    const result = await moveFlatFolderIntoCompany(folderName, COMPANY_NAME);
    console.log(`  ${JSON.stringify(result)}`);
  }

  console.log("\nDone.");
}

main().catch((e) => { console.error("Reorganize failed:", e); process.exit(1); });
