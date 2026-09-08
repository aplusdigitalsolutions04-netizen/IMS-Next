import { mysqlPool } from "@/lib/db";

// Lazy self-migration for companies — same pattern used elsewhere in this
// codebase (see lib/emailAccountsMigration.js, lib/platformsMigration.js)
// instead of a formal migration file.
let ensured = false;

export async function ensureCompanyAdditionalGstColumn() {
  if (ensured) return;
  try {
    // A company can genuinely hold more than one GSTIN (separate state
    // registrations under the same PAN) — gstNumber stays the one used on
    // this company's own generated documents, additionalGstNumbers holds
    // the others purely so an uploaded contract naming any of them still
    // matches this company (see lib/companyMatch.js).
    await mysqlPool.query("ALTER TABLE companies ADD COLUMN additionalGstNumbers JSON NULL");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
  ensured = true;
}
