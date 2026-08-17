import { mysqlPool } from "@/lib/db";

// wc_certs originally only ever held an in-app-generated HTML certificate
// (see htmlContent) — this adds an alternative path where a company can
// upload an already-existing certificate file (a scanned/signed PDF, or one
// generated outside this system) instead of building one from the HTML
// template. Self-healing (added lazily on first use) rather than a one-off
// migration script someone has to remember to run against every environment
// — see the GeM custom-fields incident this exact pattern was introduced to
// avoid repeating.
let columnEnsured = false;
export async function ensureCertFilenameColumn() {
  if (columnEnsured) return;
  try {
    await mysqlPool.query("ALTER TABLE wc_certs ADD COLUMN certFilename VARCHAR(255) NULL AFTER htmlContent");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
  columnEnsured = true;
}
