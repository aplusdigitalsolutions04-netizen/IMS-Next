import { NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireRoles } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { uploadDir } from "@/lib/upload";

// Full backup — a single ZIP containing:
//   - database.json: every table's rows as JSON (not a raw SQL file, so
//     restore can use parameterized INSERTs instead of parsing/escaping SQL
//     text), and
//   - uploads/: every file under the app's uploads directory (contracts,
//     invoices, company logos, warranty headers, etc.) — the database rows
//     that reference them (invoiceFilename, pdfFilename, logoFilename, ...)
//     are useless without the actual files.
// This is a whole-database backup, not scoped to one company, since every
// company runs out of the same shared MySQL database and uploads folder.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can create backups.");

  const [tableRows] = await mysqlPool.query("SHOW TABLES");
  const tableNames = tableRows.map((tableRow) => Object.values(tableRow)[0]);

  const tables = {};
  for (const name of tableNames) {
    const [rows] = await mysqlPool.query(`SELECT * FROM \`${name}\``);
    tables[name] = rows;
  }

  const backup = {
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: user.username || user.email || "Unknown",
    tables,
  };

  const zip = new AdmZip();
  zip.addFile("database.json", Buffer.from(JSON.stringify(backup)));
  // addLocalFolder silently no-ops if the folder is empty/missing rather than
  // throwing, so a fresh install with no uploads yet still produces a valid
  // (uploads-less) backup instead of failing the whole request.
  zip.addLocalFolder(uploadDir, "uploads");

  const filename = `ims-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  return new NextResponse(zip.toBuffer(), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
