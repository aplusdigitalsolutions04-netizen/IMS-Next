import fs from "fs";
import path from "path";
import { mysqlPool } from "@/lib/db";
import { uploadFileToDrive, deleteDriveFile, downloadDriveFile, findOrCreateFolder, moveFlatFolderIntoCompany } from "@/lib/googleDrive";

// Kept only so old code paths that still reference a local uploads/ dir (e.g.
// app/uploads/[filename] falling back to pre-migration files on disk, or the
// Drive migration backfill) resolve to the same place they always did. New
// uploads no longer write here.
//
// UPLOAD_DIR, when set, points reads at a different folder — e.g. on hosts
// like Hostinger where the app directory itself gets replaced on every
// deploy, uploads/ has to live in a separate persistent path instead of
// process.cwd()/uploads.
export const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), "uploads");

// Drive subfolder (under GOOGLE_DRIVE_FOLDER_ID, or under a company folder —
// see saveBufferToDrive's `companyName` param) each doc type is filed under,
// keyed by the `folder` option callers pass to saveUploadedFile.
const DRIVE_FOLDERS = {
  contract: "Contracts",
  invoice: "Invoices",
  ewayBill: "E-Way Bills",
  pod: "POD",
  challan: "Challan",
  additionalDoc: "Additional Documents",
  warrantyCert: "Warranty Certificates",
  companyLogo: "Company Logos",
  profilePhoto: "Profile Photos",
  warrantyTemplate: "Warranty Templates",
  stockInInvoice: "Stock In Invoices",
  stockOutInvoice: "Stock Out Invoices",
};

// Company-scoped doc types (the ones a company actually deals/dispatches
// against — contracts, invoices, POD, challan, e-way bills, warranty
// certificates, and anything filed under "additional") get nested one level
// deeper: Company Name / Contracts, Company Name / Invoices, etc. Everything
// else (logos, profile photos, warranty templates, stock in/out invoices)
// stays a flat top-level
// folder as before — those aren't per-order/per-company transaction
// documents, so nesting them under a company wouldn't mean anything.
const COMPANY_SCOPED_FOLDERS = new Set(["contract", "invoice", "ewayBill", "pod", "challan", "additionalDoc", "warrantyCert"]);

function sanitizeFilename(name) {
  return String(name || "file").replace(/[^\w.\- ()]/g, "_");
}

// Drive folder names can't contain "/" and shouldn't have leading/trailing
// whitespace — a company named "A/B Traders" would otherwise silently create
// a nested "A" > "B Traders" pair instead of one folder.
function sanitizeFolderName(name) {
  return String(name || "").replace(/[\\/]/g, "-").trim();
}

// Uploads a raw buffer to Drive and records it in `drive_files` under the
// given filename. Shared by saveUploadedFile and callers that derive a file
// server-side (e.g. the warranty PDF→PNG header conversion) rather than
// receiving it directly from formData. `folder` is one of DRIVE_FOLDERS'
// keys — omit it to upload straight into the Drive root. `companyName`,
// when given alongside a company-scoped folder key, nests the doc-type
// folder inside that company's own folder instead of the flat top-level one.
export async function saveBufferToDrive(buffer, filename, mimetype, folder, companyName) {
  const folderName = folder && DRIVE_FOLDERS[folder];
  let parentFolderId;
  if (folderName && companyName && COMPANY_SCOPED_FOLDERS.has(folder)) {
    const companyFolderId = await findOrCreateFolder(sanitizeFolderName(companyName));
    parentFolderId = await findOrCreateFolder(folderName, companyFolderId);
  } else if (folderName) {
    parentFolderId = await findOrCreateFolder(folderName);
  }
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
export async function saveUploadedFile(file, { prefix, folder, companyName } = {}) {
  if (!file || typeof file.arrayBuffer !== "function") return null;
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const safe = sanitizeFilename(file.name);
  const ext = path.extname(safe);
  const filename = prefix ? `${prefix}-${unique}${ext}` : `${unique}-${safe}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  return saveBufferToDrive(buffer, filename, file.type, folder, companyName);
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

// Which DB table.column(s) reference an uploaded filename, and what Drive
// folder category each belongs to. Used only by migrateLocalFilesToDrive
// below — every upload route going forward already passes its own `folder`
// at save time, this is purely for backfilling files that predate the Drive
// migration and are still sitting in the local uploads/ folder.
const FILENAME_SOURCES = [
  { table: "companies", columns: ["logoFilename"], folder: "companyLogo" },
  { table: "contracts", columns: ["pdfFilename"], folder: "contract" },
  { table: "inventorystockin", columns: ["invoiceFilePath"], folder: "stockInInvoice" },
  { table: "order_items", columns: ["contractFilename"], folder: "contract" },
  { table: "order_logistics", columns: ["podFilename"], folder: "pod" },
  { table: "orders", columns: ["invoiceFilename"], folder: "invoice" },
  { table: "orders", columns: ["ewayBillFilename"], folder: "ewayBill" },
  { table: "users", columns: ["profilePhoto"], folder: "profilePhoto" },
  { table: "warranty_template", columns: ["headerImagePath", "signatureImagePath"], folder: "warrantyTemplate" },
];

const ORDERDOCUMENTS_DOCTYPE_FOLDER = { gemContract: "contract", invoice: "invoice", ewayBill: "ewayBill", pod: "pod", challan: "challan" };

// Small helper so every company-scoped upload route doesn't repeat the same
// lookup — resolves a companyGuid to the plain name saveBufferToDrive nests
// folders under.
export async function getCompanyName(companyGuid) {
  if (!companyGuid) return null;
  const [[row]] = await mysqlPool.query("SELECT name FROM companies WHERE guid = ?", [companyGuid]);
  return row?.name || null;
}

// One-off cleanup for files uploaded before per-company folders existed —
// moves every file sitting in the old flat Contracts/Invoices/POD/Challan/
// E-Way Bills/Additional Documents folders into <companyName>/<that folder>
// instead. Files keep their Drive file ID (see moveFlatFolderIntoCompany), so
// nothing in drive_files or any table referencing a filename needs to change.
export async function reorganizeIntoCompanyFolders(companyGuid) {
  const companyName = await getCompanyName(companyGuid);
  if (!companyName) throw new Error("Company not found");
  const sanitized = sanitizeFolderName(companyName);

  const results = [];
  for (const folderKey of COMPANY_SCOPED_FOLDERS) {
    const flatName = DRIVE_FOLDERS[folderKey];
    const result = await moveFlatFolderIntoCompany(flatName, sanitized);
    results.push({ folder: flatName, ...result });
  }
  return { companyName: sanitized, results };
}

function guessMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[ext] || "application/octet-stream";
}

// Backfills the local uploads/ folder into Drive: for every filename the DB
// already references (across all the tables above, plus orderdocuments),
// checks whether it's sitting in uploadDir, and if so uploads it to the
// right Drive subfolder and records it in drive_files. Safe to re-run —
// anything already in drive_files is skipped. Local files are never deleted.
export async function migrateLocalFilesToDrive() {
  const categoryByFilename = new Map();
  const set = (filename, folder) => {
    if (filename) categoryByFilename.set(filename, folder);
  };

  for (const { table, columns, folder } of FILENAME_SOURCES) {
    const where = columns.map((c) => `(\`${c}\` IS NOT NULL AND \`${c}\` != '')`).join(" OR ");
    const [rows] = await mysqlPool.query(`SELECT ${columns.map((c) => `\`${c}\``).join(", ")} FROM \`${table}\` WHERE ${where}`);
    rows.forEach((row) => columns.forEach((c) => set(row[c], folder)));
  }

  const [orderDocs] = await mysqlPool.query("SELECT filename, docType FROM orderdocuments WHERE filename IS NOT NULL AND filename != ''");
  orderDocs.forEach((r) => set(r.filename, ORDERDOCUMENTS_DOCTYPE_FOLDER[r.docType] || "other"));

  const localFiles = fs.existsSync(uploadDir) ? new Set(fs.readdirSync(uploadDir)) : new Set();
  const toMigrate = [...categoryByFilename.entries()].filter(([filename]) => localFiles.has(filename));

  const [alreadyDone] = await mysqlPool.query("SELECT filename FROM drive_files");
  const alreadyDoneSet = new Set(alreadyDone.map((r) => r.filename));

  let migrated = 0, skipped = 0;
  const failed = [];
  for (const [filename, folder] of toMigrate) {
    if (alreadyDoneSet.has(filename)) { skipped++; continue; }
    try {
      const buffer = await fs.promises.readFile(path.join(uploadDir, filename));
      await saveBufferToDrive(buffer, filename, guessMimeType(filename), folder === "other" ? undefined : folder);
      migrated++;
    } catch (err) {
      failed.push({ filename, error: err.message });
    }
  }

  return {
    referencedInDb: categoryByFilename.size,
    foundLocally: toMigrate.length,
    migrated,
    alreadyMigrated: skipped,
    failed,
  };
}
