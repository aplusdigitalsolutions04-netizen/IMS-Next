import { mysqlPool } from "@/lib/db";

// Indexes the hot queries rely on but the original schema never had
// (inventorystockinserial only had PK / guid / serialNumber, so every
// "available serials of this variant" lookup scanned the whole table).
// Same lazy self-migration pattern as the other lib/*Migration.js files;
// safe to run repeatedly.
const INDEXES = [
  ["inventorystockinserial", "idx_serial_variant_status", "(itemVariantId, serialStatus, isDeleted)"],
  ["inventorystockinserial", "idx_serial_company_status", "(companyGuid, serialStatus)"],
];

let started = null;
export function ensurePerformanceIndexes() {
  if (!started) {
    started = (async () => {
      for (const [table, name, cols] of INDEXES) {
        try {
          await mysqlPool.query(`CREATE INDEX ${name} ON ${table} ${cols}`);
        } catch (err) {
          // ER_DUP_KEYNAME: already there. ER_KEY_COLUMN_DOES_NOT_EXIST /
          // ER_NO_SUCH_TABLE: this database doesn't have that column — skip.
          if (!["ER_DUP_KEYNAME", "ER_KEY_COLUMN_DOES_NOT_EXIST", "ER_NO_SUCH_TABLE"].includes(err.code)) console.error(`[dbIndexes] ${name}:`, err.message);
        }
      }
    })();
  }
  return started;
}
