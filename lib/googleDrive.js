import { google } from "googleapis";
import { Readable } from "stream";

// Single admin Google account authorizes once (via /api/google-drive/authorize);
// the resulting refresh token lets every upload/download run unattended after
// that, all stored under that one account's Drive quota in GOOGLE_DRIVE_FOLDER_ID.
let driveClient = null;

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback";

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client credentials are not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)");
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (refreshToken) oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return oAuth2Client;
}

export function getAuthUrl() {
  const oAuth2Client = getOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
  });
}

export async function exchangeCodeForTokens(code) {
  const oAuth2Client = getOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  return tokens;
}

function getDriveClient() {
  if (driveClient) return driveClient;
  if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    throw new Error("Google Drive is not authorized yet. Visit /api/google-drive/authorize to connect an account.");
  }
  driveClient = google.drive({ version: "v3", auth: getOAuthClient() });
  return driveClient;
}

function rootFolderId() {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!id) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not configured");
  return id;
}

// In-memory cache of "parentId::name" -> Drive folder ID, so repeated
// uploads of the same doc type (e.g. "Invoices") don't re-search Drive every
// time. Keyed by parent too, not just name, because the same subfolder name
// (e.g. "Contracts") now exists once per company folder — without the parent
// in the key, the second company to upload a contract would get the first
// company's folder ID back. Resets on server restart, but findOrCreateFolder
// re-discovers by name then, so folders never get duplicated even across restarts.
const folderIdCache = new Map();

// `parentId` defaults to the Drive root (GOOGLE_DRIVE_FOLDER_ID) — passing a
// company folder's ID here is what lets callers nest a doc-type folder
// (Contracts/Invoices/POD/...) inside that company's own folder instead of
// mixing every company's files into one flat set of folders.
export async function findOrCreateFolder(name, parentId) {
  const parent = parentId || rootFolderId();
  const cacheKey = `${parent}::${name}`;
  if (folderIdCache.has(cacheKey)) return folderIdCache.get(cacheKey);

  const drive = getDriveClient();
  const escapedName = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and name='${escapedName}' and trashed=false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  let folderId = res.data.files?.[0]?.id;
  if (!folderId) {
    const created = await drive.files.create({
      requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parent] },
      fields: "id",
      supportsAllDrives: true,
    });
    folderId = created.data.id;
  }

  folderIdCache.set(cacheKey, folderId);
  return folderId;
}

async function findFolderIdByName(name, parentId) {
  const drive = getDriveClient();
  const parent = parentId || rootFolderId();
  const escapedName = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and name='${escapedName}' and trashed=false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id || null;
}

// One-off reorganization: moves every file directly inside a flat top-level
// folder (e.g. "Contracts", from before per-company nesting existed — see
// findOrCreateFolder) into companyName/flatFolderName instead. Uses
// files.update's addParents/removeParents, which re-parents the file in
// place — the file keeps the exact same Drive file ID, so drive_files.
// driveFileId (and everything in MySQL that references it) never changes;
// only where the file sits inside Drive moves. If the flat folder ends up
// empty afterward, it's trashed so Drive root doesn't keep a stale, now-dead
// duplicate of a folder name that also exists inside the company folder.
export async function moveFlatFolderIntoCompany(flatFolderName, companyName) {
  const drive = getDriveClient();
  const oldFolderId = await findFolderIdByName(flatFolderName);
  if (!oldFolderId) return { moved: 0, note: "no existing flat folder — nothing to move" };

  const listRes = await drive.files.list({
    q: `'${oldFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
    fields: "files(id, name)",
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const files = listRes.data.files || [];
  if (files.length === 0) return { moved: 0, note: "flat folder is empty" };

  const companyFolderId = await findOrCreateFolder(companyName);
  const newFolderId = await findOrCreateFolder(flatFolderName, companyFolderId);

  let moved = 0;
  const failed = [];
  for (const file of files) {
    try {
      await drive.files.update({
        fileId: file.id,
        addParents: newFolderId,
        removeParents: oldFolderId,
        fields: "id, parents",
        supportsAllDrives: true,
      });
      moved++;
    } catch (err) {
      failed.push({ filename: file.name, error: err.message });
    }
  }

  const remaining = await drive.files.list({
    q: `'${oldFolderId}' in parents and trashed=false`,
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (!remaining.data.files?.length) {
    await drive.files.update({ fileId: oldFolderId, requestBody: { trashed: true }, supportsAllDrives: true }).catch(() => {});
  }

  return { moved, failed };
}

export async function uploadFileToDrive(buffer, filename, mimeType, parentFolderId) {
  const drive = getDriveClient();
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [parentFolderId || rootFolderId()] },
    media: { mimeType: mimeType || "application/octet-stream", body: Readable.from(buffer) },
    fields: "id, name, mimeType",
    supportsAllDrives: true,
  });
  return { id: res.data.id, name: res.data.name, mimeType: res.data.mimeType };
}

export async function downloadDriveFile(fileId) {
  const drive = getDriveClient();
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data);
}

export async function deleteDriveFile(fileId) {
  const drive = getDriveClient();
  await drive.files.delete({ fileId, supportsAllDrives: true });
}

// Used by the admin Settings "Test Connection" button — confirms the stored
// refresh token still works and GOOGLE_DRIVE_FOLDER_ID still points at a
// real, reachable folder (it can silently stop being true if the token is
// revoked or the folder gets deleted/moved out of reach).
export async function testDriveConnection() {
  const drive = getDriveClient();
  const folderId = rootFolderId();

  const res = await drive.files.get({
    fileId: folderId,
    fields: "id, name, mimeType, trashed",
    supportsAllDrives: true,
  });

  if (res.data.trashed) throw new Error("The configured Drive folder has been moved to trash.");
  if (res.data.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID does not point to a folder.");
  }

  return { folderId: res.data.id, folderName: res.data.name };
}
