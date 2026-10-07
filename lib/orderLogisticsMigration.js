import { mysqlPool } from "@/lib/db";

// Lazy self-migration (same pattern as lib/carePackMigration.js): the actual
// date the shipment was delivered, entered optionally alongside the POD
// upload in Dispatch. Separate from lastDeliveryDate, which is the contract's
// delivery DEADLINE.
let ensured = false;
export async function ensureDeliveredDateColumn() {
  if (ensured) return;
  try {
    await mysqlPool.query("ALTER TABLE order_logistics ADD COLUMN deliveredDate DATE NULL");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
  ensured = true;
}
