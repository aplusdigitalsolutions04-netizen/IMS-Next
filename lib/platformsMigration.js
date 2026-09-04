import { mysqlPool } from "@/lib/db";

// Lazy self-migration for selling_platforms — same pattern used elsewhere in
// this codebase (see lib/emailAccountsMigration.js) instead of a formal
// migration file, since this table only got created via the original setup
// script and there's no migration runner wired into deploys.
let ensured = false;

export async function ensurePlatformItemTypeColumn() {
  if (ensured) return;
  try {
    await mysqlPool.query(
      "ALTER TABLE selling_platforms ADD COLUMN itemTypeMode ENUM('serialized','nonSerialized','both') NOT NULL DEFAULT 'serialized'"
    );
    // GeM and Other already had the Serialized/Non-Serialized picker
    // hardcoded on in NewDispatch.jsx before this column existed — backfill
    // them to 'both' so switching that check over to this column doesn't
    // silently turn the picker off for everyone until an Admin notices and
    // fixes it manually. Every other platform (including custom ones added
    // before this column existed) defaults to 'serialized', matching how
    // Amazon/Flipkart already behaved.
    await mysqlPool.query(
      "UPDATE selling_platforms SET itemTypeMode = 'both' WHERE name IN ('GeM', 'Other')"
    );
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
  ensured = true;
}
