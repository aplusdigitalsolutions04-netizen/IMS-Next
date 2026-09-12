import { randomUUID } from "crypto";
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

// Care Pack durations ride the generic dropdown_master/dropdown_option
// tables (same as Delivery Partner) as a single GLOBAL list (dropdown_code
// carries a UNIQUE constraint — one row per code, full stop), pre-seeded
// with the standard 1-5 Year options.
//
// This used to be created only from app/api/admin/care-pack/route.js — i.e.
// only once an Admin actually opened the Care Pack Master settings page.
// Every *consumer* of the dropdown (GET /api/dropdown/CARE_PACK, what New
// Dispatch/Stock-In/Item Variant Master's Care Pack picker actually reads)
// only ever SELECTed, never created — so on a fresh install where nobody
// had visited Care Pack Master yet, that dropdown silently came back empty
// instead of showing the default options. Exported here so both the admin
// route and the dropdown route can ensure it exists before reading/writing.
const CARE_PACK_CODE = "CARE_PACK";
const CARE_PACK_DEFAULT_OPTIONS = ["1 Year", "2 Year", "3 Year", "4 Year", "5 Year"];

let carePackDropdownEnsured = false;
export async function ensureCarePackDropdownSeeded() {
  if (carePackDropdownEnsured) return;

  const [[existing]] = await mysqlPool.query(
    "SELECT id FROM dropdown_master WHERE dropdown_code = ?",
    [CARE_PACK_CODE]
  );
  if (!existing) {
    const guid = randomUUID();
    const [result] = await mysqlPool.query(
      "INSERT INTO dropdown_master (companyGuid, guid, dropdown_code, dropdown_name, fieldType, is_active) VALUES (NULL, ?, ?, ?, 'DROPDOWN', 1)",
      [guid, CARE_PACK_CODE, "Care Pack"]
    );
    const masterId = result.insertId;
    await mysqlPool.query(
      `INSERT INTO dropdown_option (guid, dropdown_id, option_label, option_value, display_order, is_active) VALUES ${CARE_PACK_DEFAULT_OPTIONS.map(() => "(?, ?, ?, ?, ?, 1)").join(",")}`,
      CARE_PACK_DEFAULT_OPTIONS.flatMap((label, i) => [randomUUID(), masterId, label, label, i + 1])
    );
  }

  carePackDropdownEnsured = true;
}
