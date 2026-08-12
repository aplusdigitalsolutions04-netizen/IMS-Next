import { NextResponse } from "next/server";
import AdmZip from "adm-zip";
import path from "path";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { uploadDir } from "@/lib/upload";

// Batches inserts to stay well under MySQL's ~65535-placeholder-per-query
// limit and avoid oversized packets on tables with many columns/rows.
const BATCH_SIZE = 300;

// Restores a backup ZIP produced by GET /api/admin/backup — both the
// database tables (database.json inside the zip) and the uploaded files
// (uploads/ inside the zip, extracted back into the app's uploads
// directory). This overwrites the ENTIRE database (every company, not just
// the admin's own) and the entire uploads folder — every table present in
// the backup is truncated and repopulated, and every extracted file
// overwrites whatever's on disk at that path.
//
// MySQL's TRUNCATE implicitly commits, so this cannot be wrapped in one true
// atomic transaction across tables — if it fails partway through, some
// tables will already be truncated/restored and others won't. The route
// keeps going table-by-table and reports exactly which tables succeeded and
// which failed, so a retry (re-running restore with the same file) can
// finish the job instead of leaving things in an ambiguous state.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "backupRestore", "Only Admin can restore backups.");

  const arrayBuffer = await request.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0) throw new ApiError(400, "No backup file received.");

  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new ApiError(400, "This doesn't look like a valid ZIP backup file.");
  }

  const dbEntry = zip.getEntry("database.json");
  if (!dbEntry) throw new ApiError(400, "This doesn't look like a valid IMS backup — database.json is missing from the ZIP.");

  let parsed;
  try {
    parsed = JSON.parse(dbEntry.getData().toString("utf-8"));
  } catch {
    throw new ApiError(400, "database.json in the ZIP isn't valid JSON.");
  }
  const { tables } = parsed || {};
  if (!tables || typeof tables !== "object" || Array.isArray(tables)) {
    throw new ApiError(400, "Invalid backup file — no table data found.");
  }

  const [tableRows] = await mysqlPool.query("SHOW TABLES");
  const existingTables = new Set(tableRows.map((tableRow) => Object.values(tableRow)[0]));

  const restored = [];
  const skipped = [];
  const failed = [];

  const conn = await mysqlPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    for (const [tableName, rows] of Object.entries(tables)) {
      if (!existingTables.has(tableName)) {
        skipped.push(tableName);
        continue;
      }
      if (!Array.isArray(rows)) {
        skipped.push(tableName);
        continue;
      }
      try {
        await conn.query(`TRUNCATE TABLE \`${tableName}\``);
        if (rows.length > 0) {
          // Column names from the backup are validated against the real
          // schema before being interpolated into the query — table names
          // were already checked this way above, but column names weren't,
          // so a hand-crafted backup file could otherwise smuggle arbitrary
          // identifier text into the SQL via a "column name" containing a
          // backtick.
          const [columnRows] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\``);
          const realColumns = new Set(columnRows.map((columnRow) => columnRow.Field));
          const columns = Object.keys(rows[0]).filter((columnName) => realColumns.has(columnName));
          if (columns.length === 0) throw new Error("No matching columns between backup and current schema");
          const columnList = columns.map((columnName) => `\`${columnName}\``).join(",");
          for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const placeholders = batch.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
            const values = [];
            batch.forEach((row) => columns.forEach((columnName) => values.push(row[columnName])));
            await conn.query(`INSERT INTO \`${tableName}\` (${columnList}) VALUES ${placeholders}`, values);
          }
        }
        restored.push({ table: tableName, rows: rows.length });
      } catch (err) {
        console.error(`Restore failed for table ${tableName}:`, err.message);
        failed.push({ table: tableName, error: err.message });
      }
    }

    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }

  // Extract uploads/* back onto disk. Path-traversal guarded — every entry
  // must resolve to inside uploadDir before it's written, since zip entry
  // names are attacker-controllable if someone hand-crafts a malicious file.
  let filesRestored = 0;
  const fileErrors = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !entry.entryName.startsWith("uploads/")) continue;
    const relative = entry.entryName.slice("uploads/".length);
    if (!relative) continue;
    const destPath = path.resolve(uploadDir, relative);
    if (!destPath.startsWith(path.resolve(uploadDir))) {
      fileErrors.push(entry.entryName);
      continue;
    }
    try {
      zip.extractEntryTo(entry, uploadDir, false, true, false, relative);
      filesRestored++;
    } catch (err) {
      console.error(`Failed to restore file ${entry.entryName}:`, err.message);
      fileErrors.push(entry.entryName);
    }
  }

  return NextResponse.json({
    message: failed.length > 0 ? "Restore completed with errors." : "Restore completed successfully.",
    restored,
    skipped,
    failed,
    filesRestored,
    fileErrors,
  });
});
