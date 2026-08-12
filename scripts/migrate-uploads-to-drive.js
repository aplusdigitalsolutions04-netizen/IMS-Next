// One-off bulk migration run (mirrors lib/upload.js's migrateLocalFilesToDrive,
// as a standalone CJS script since that needs Next's module resolution).
// Uploads every local uploads/ file that's referenced in the DB to Google
// Drive, filed into category folders, and records each in drive_files.
// Safe to re-run — already-migrated files are skipped. Local files untouched.
require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { google } = require("googleapis");
const { Readable } = require("stream");

const uploadDir = path.resolve(process.cwd(), "uploads");

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
  other: "Migrated (Uncategorized)",
};

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
const ORDERDOCUMENTS_DOCTYPE_FOLDER = { gemContract: "contract", invoice: "invoice", ewayBill: "ewayBill", pod: "pod", challan: "pod" };

function guessMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[ext] || "application/octet-stream";
}

function getOAuthClient() {
  const c = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
  c.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return c;
}

async function main() {
  const drive = google.drive({ version: "v3", auth: getOAuthClient() });
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const categoryByFilename = new Map();
  const set = (filename, folder) => { if (filename) categoryByFilename.set(filename, folder); };

  for (const { table, columns, folder } of FILENAME_SOURCES) {
    const where = columns.map((c) => `(\`${c}\` IS NOT NULL AND \`${c}\` != '')`).join(" OR ");
    const [rows] = await db.query(`SELECT ${columns.map((c) => `\`${c}\``).join(", ")} FROM \`${table}\` WHERE ${where}`);
    rows.forEach((row) => columns.forEach((c) => set(row[c], folder)));
  }
  const [orderDocs] = await db.query("SELECT filename, docType FROM orderdocuments WHERE filename IS NOT NULL AND filename != ''");
  orderDocs.forEach((r) => set(r.filename, ORDERDOCUMENTS_DOCTYPE_FOLDER[r.docType] || "other"));

  console.log(`DB references ${categoryByFilename.size} distinct filenames.`);

  const localFiles = new Set(fs.readdirSync(uploadDir));
  const toMigrate = [...categoryByFilename.entries()].filter(([filename]) => localFiles.has(filename));
  console.log(`${toMigrate.length} of them found locally in uploads/.`);

  const [alreadyDone] = await db.query("SELECT filename FROM drive_files");
  const alreadyDoneSet = new Set(alreadyDone.map((r) => r.filename));

  const folderIdCache = new Map();
  async function findOrCreateFolder(name) {
    if (folderIdCache.has(name)) return folderIdCache.get(name);
    const res = await drive.files.list({
      q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`,
      fields: "files(id, name)", supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    let id = res.data.files?.[0]?.id;
    if (!id) {
      const created = await drive.files.create({
        requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [rootFolderId] },
        fields: "id", supportsAllDrives: true,
      });
      id = created.data.id;
    }
    folderIdCache.set(name, id);
    return id;
  }

  let migrated = 0, skipped = 0, failed = 0;
  const startedAt = Date.now();
  for (const [filename, folder] of toMigrate) {
    if (alreadyDoneSet.has(filename)) { skipped++; continue; }
    try {
      const folderName = DRIVE_FOLDERS[folder] || DRIVE_FOLDERS.other;
      const folderId = await findOrCreateFolder(folderName);
      const buffer = fs.readFileSync(path.join(uploadDir, filename));
      const mimetype = guessMimeType(filename);

      const res = await drive.files.create({
        requestBody: { name: filename, parents: [folderId] },
        media: { mimeType: mimetype, body: Readable.from(buffer) },
        fields: "id", supportsAllDrives: true,
      });

      await db.query("INSERT INTO drive_files (filename, driveFileId, mimetype, size) VALUES (?, ?, ?, ?)", [filename, res.data.id, mimetype, buffer.length]);
      migrated++;
      if (migrated % 25 === 0) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
        console.log(`... ${migrated} migrated, ${skipped} skipped, ${failed} failed (${elapsed}s elapsed)`);
      }
    } catch (err) {
      failed++;
      console.error(`FAILED: ${filename}:`, err.message);
    }
  }

  console.log(`\nDone. Migrated: ${migrated}, already done: ${skipped}, failed: ${failed}.`);
  await db.end();
}

main().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
