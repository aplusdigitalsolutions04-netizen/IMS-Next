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

// In-memory cache of subfolder name -> Drive folder ID, so repeated uploads
// of the same doc type (e.g. "Invoices") don't re-search Drive every time.
// Resets on server restart, but findOrCreateFolder re-discovers by name then,
// so folders never get duplicated even across restarts.
const folderIdCache = new Map();

export async function findOrCreateFolder(name) {
  if (folderIdCache.has(name)) return folderIdCache.get(name);

  const drive = getDriveClient();
  const parent = rootFolderId();
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

  folderIdCache.set(name, folderId);
  return folderId;
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
