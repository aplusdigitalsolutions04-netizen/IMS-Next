import { mysqlPool } from "./db";

// Lazily adds `deletedBy`/`deletedAt`/`deleteRemarks` to every table the
// Admin "Deleted Items" screen (components/admin/DeletedItems.jsx) surfaces
// — none of them previously tracked who soft-deleted a row, when, or why,
// only that isDeleted got flipped to 1. `orders` is deliberately excluded:
// it already has `cancellationReason`/`cancelledBy`/`cancelledAt`, which
// every isDeleted=1 path for orders sets as a byproduct of cancellation —
// reused instead of adding duplicate columns with the same meaning.
const TABLES = ["contracts", "inventoryitemmaster", "inventoryitemvariant", "inventorystockinserial"];

let ensured = false;
export async function ensureDeletedByColumns() {
  if (ensured) return;
  for (const table of TABLES) {
    for (const [col, def] of [["deletedBy", "VARCHAR(100) NULL"], ["deletedAt", "DATETIME NULL"], ["deleteRemarks", "VARCHAR(500) NULL"]]) {
      try {
        await mysqlPool.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      } catch (err) {
        if (err.code !== "ER_DUP_FIELDNAME") throw err;
      }
    }
  }
  ensured = true;
}

// Restore is tracked separately from delete (not overwritten) so a row's
// delete history stays visible even after it's brought back — restoring
// clears none of deletedBy/deletedAt/deleteRemarks. Added to `orders` too
// here (unlike the delete-side columns above) since orders has no existing
// column that already means "restore reason".
const RESTORE_TABLES = [...TABLES, "orders"];

let restoreEnsured = false;
export async function ensureRestoreColumns() {
  if (restoreEnsured) return;
  for (const table of RESTORE_TABLES) {
    for (const [col, def] of [["restoredBy", "VARCHAR(100) NULL"], ["restoredAt", "DATETIME NULL"], ["restoreRemarks", "VARCHAR(500) NULL"]]) {
      try {
        await mysqlPool.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      } catch (err) {
        if (err.code !== "ER_DUP_FIELDNAME") throw err;
      }
    }
  }
  restoreEnsured = true;
}
