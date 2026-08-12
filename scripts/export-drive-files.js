// Exports the local drive_files table as an idempotent SQL file to run once
// on production (Hostinger phpMyAdmin), so production's DB learns about
// every file that was just migrated to Drive from this machine.
require("dotenv").config({ path: ".env.local" });
const mysql = require("mysql2/promise");
const fs = require("fs");

function esc(v) {
  if (v === null || v === undefined) return "NULL";
  return "'" + String(v).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
}

async function main() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [rows] = await c.query("SELECT filename, driveFileId, mimetype, size FROM drive_files");
  await c.end();

  let sql = "-- drive_files export from local DB — run this once on production (Hostinger phpMyAdmin)\n";
  sql += "-- Safe to re-run: uses ON DUPLICATE KEY UPDATE.\n";
  sql += "CREATE TABLE IF NOT EXISTS `drive_files` (\n";
  sql += "  `filename` varchar(255) NOT NULL,\n";
  sql += "  `driveFileId` varchar(100) NOT NULL,\n";
  sql += "  `mimetype` varchar(100) DEFAULT NULL,\n";
  sql += "  `size` int DEFAULT NULL,\n";
  sql += "  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n";
  sql += "  PRIMARY KEY (`filename`)\n";
  sql += ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n";

  const BATCH = 300;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = batch
      .map((r) => `(${esc(r.filename)}, ${esc(r.driveFileId)}, ${esc(r.mimetype)}, ${r.size === null ? "NULL" : r.size})`)
      .join(",\n  ");
    sql += "INSERT INTO `drive_files` (`filename`, `driveFileId`, `mimetype`, `size`) VALUES\n  " + values + "\n";
    sql += "ON DUPLICATE KEY UPDATE `driveFileId`=VALUES(`driveFileId`), `mimetype`=VALUES(`mimetype`), `size`=VALUES(`size`);\n\n";
  }

  fs.writeFileSync("drive_files_export.sql", sql);
  console.log(`Wrote ${rows.length} rows to drive_files_export.sql`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
