import fs from "fs";
import path from "path";
import { mysqlPool } from "@/lib/db";
import { uploadFileToDrive, deleteDriveFile, downloadDriveFile, findOrCreateFolder } from "@/lib/googleDrive";

// Kept only so old code paths that still reference a local uploads/ dir (e.g.
// app/uploads/[filename] falling back to pre-migration files on disk) resolve
// to the same place they always did. New uploads no longer write here.
export const uploadDir = path.resolve(process.cwd(), "uploads");

// Drive subfolder (under GOOGLE_DRIVE_FOLDER_ID) each doc type is filed
// under, keyed by the `folder` option callers pass to saveUploadedFile.
const DRIVE_FOLDERS = {
  contract: "Contracts",
  invoice: "Invoices",
  ewayBill: "E-Way Bills",
  pod: "POD",
  companyLogo: "Company Logos",
  profilePhoto: "Profile Photos",
  warrantyTemplate: "Warranty Templates",
  stockInInvoice: "Stock In Invoices",
  stockOutInvoice: "Stock Out Invoices",
};

function sanitizeFilename(name) {
  return String(name || "file").replace(/[^\w.\- ()]/g, "_");
}

// Uploads a raw buffer to Drive and records it in `drive_files` under the
// given filename. Shared by saveUploadedFile and callers that derive a file
// server-side (e.g. the warranty PDF→PNG header conversion) rather than
// receiving it directly from formData. `folder` is one of DRIVE_FOLDERS'
// keys — omit it to upload straight into the Drive root.
export async function saveBufferToDrive(buffer, filename, mimetype, folder) {
  const folderName = folder && DRIVE_FOLDERS[folder];
  const parentFolderId = folderName ? await findOrCreateFolder(folderName) : undefined;
  const driveFile = await uploadFileToDrive(buffer, filename, mimetype, parentFolderId);
  await mysqlPool.query(
    "INSERT INTO drive_files (filename, driveFileId, mimetype, size) VALUES (?, ?, ?, ?)",
    [filename, driveFile.id, mimetype || null, buffer.length]
  );
  return { filename, size: buffer.length, mimetype };
}

// Same filename convention the old disk-storage version used
// (`${timestamp}-${random}-${safeName}`) — every caller stores this string in
// the DB and builds `/uploads/${filename}` URLs with it, so keeping the shape
// unchanged means none of those callers needed to change. The file itself now
// lives in Google Drive; `drive_files` maps this filename to its Drive file ID.
// `folder` (one of DRIVE_FOLDERS' keys) files it under a named Drive subfolder.
export async function saveUploadedFile(file, { prefix, folder } = {}) {
  if (!file || typeof file.arrayBuffer !== "function") return null;
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const safe = sanitizeFilename(file.name);
  const ext = path.extname(safe);
  const filename = prefix ? `${prefix}-${unique}${ext}` : `${unique}-${safe}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  return saveBufferToDrive(buffer, filename, file.type, folder);
}

// Best-effort cleanup for a file previously stored via saveUploadedFile —
// used when a new upload replaces an old one (company logo, profile photo).
// Never throws: a missed cleanup just leaves an orphaned Drive file, which is
// far less bad than failing the request that's replacing it.
export async function deleteUploadedFile(filename) {
  if (!filename) return;
  const safeName = path.basename(filename);

  try {
    const filePath = path.join(uploadDir, safeName);
    if (filePath.startsWith(uploadDir) && fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath).catch(() => {});
    }

    const [rows] = await mysqlPool.query("SELECT driveFileId FROM drive_files WHERE filename=?", [safeName]);
    if (rows.length) {
      await deleteDriveFile(rows[0].driveFileId).catch(() => {});
      await mysqlPool.query("DELETE FROM drive_files WHERE filename=?", [safeName]);
    }
  } catch {
    // ignore — best-effort
  }
}

// Reads a previously-uploaded file's bytes wherever it actually lives — local
// disk for pre-migration uploads, Drive for everything since. Used by server
// code that needs the raw bytes (e.g. embedding a warranty header image into
// a generated certificate), as opposed to just proxying it to a browser.
// Returns null if the file can't be found anywhere.
export async function readUploadedFileBuffer(filename) {
  if (!filename) return null;
  const safeName = path.basename(filename);
  const filePath = path.join(uploadDir, safeName);
  if (filePath.startsWith(uploadDir) && fs.existsSync(filePath)) {
    return fs.promises.readFile(filePath);
  }

  const [rows] = await mysqlPool.query("SELECT driveFileId FROM drive_files WHERE filename=?", [safeName]);
  if (!rows.length) return null;
  return downloadDriveFile(rows[0].driveFileId);
}

// Reads all files from a multipart formData under a given field name (or every
// File entry if fieldName is omitted).
export async function getUploadedFiles(formData, fieldName) {
  const entries = fieldName ? formData.getAll(fieldName) : Array.from(formData.values());
  return entries.filter((e) => e && typeof e.arrayBuffer === "function");
}
