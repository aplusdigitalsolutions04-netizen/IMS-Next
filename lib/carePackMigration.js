import { mysqlPool } from "./db";

// Lazily adds `carePack` to inventorystockinserial the first time Stock-In
// (or a manual/bulk serial-add route) needs it — same self-migrating pattern
// as lib/companiesMigration.js. Stores the option_value chosen from the
// Care Pack dropdown (see app/api/admin/care-pack/route.js), e.g. "3 Year".
let ensured = false;
export async function ensureCarePackColumn() {
  if (ensured) return;
  try {
    await mysqlPool.query("ALTER TABLE inventorystockinserial ADD COLUMN carePack VARCHAR(50) NULL");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
  ensured = true;
}

// A buyer can ask, at dispatch time, to upgrade the Care Pack duration that
// was set on the serial during Stock-In (only upward — see NewDispatch.jsx's
// carePack upgrade picker, which only offers options ranked after the
// current one) for an extra charge. That upgrade choice and its price are
// per-order-item, not per-serial (the same physical serial keeps its
// original Stock-In carePack forever; only this dispatch's line item
// records what it was upgraded to).
let orderItemsEnsured = false;
export async function ensureOrderItemsCarePackColumns() {
  if (orderItemsEnsured) return;
  try {
    await mysqlPool.query("ALTER TABLE order_items ADD COLUMN carePackUpgrade VARCHAR(50) NULL");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
  try {
    await mysqlPool.query("ALTER TABLE order_items ADD COLUMN carePackUpgradePrice DECIMAL(10,2) NULL");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
  orderItemsEnsured = true;
}
