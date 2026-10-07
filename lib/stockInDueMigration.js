import { mysqlPool } from "@/lib/db";
import { ApiError } from "@/lib/auth";

// A stock-in can be finalized before its purchase bill has arrived (no
// vendor / invoice no / invoice date yet). isDue = 1 marks those so they
// show under the "Due Purchase Bill" tab until the bill details are added.
let ensured = false;
export async function ensureStockInDueColumn() {
  if (ensured) return;
  try {
    await mysqlPool.query("ALTER TABLE inventorystockin ADD COLUMN isDue TINYINT(1) NOT NULL DEFAULT 0");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
  try {
    await mysqlPool.query("ALTER TABLE inventorystockin ADD COLUMN isRoundOff TINYINT(1) NOT NULL DEFAULT 0");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
  ensured = true;
}

// Due Purchase Bill is switched on per company (Company Master). Off by
// default, so a company only gets the feature once an Admin enables it.
let companyEnsured = false;
export async function ensureCompanyDueBillColumn() {
  if (companyEnsured) return;
  try {
    await mysqlPool.query("ALTER TABLE companies ADD COLUMN dueBillEnabled TINYINT(1) NOT NULL DEFAULT 0");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
  companyEnsured = true;
}

export async function isDueBillEnabled(companyId) {
  await ensureCompanyDueBillColumn();
  const [[row]] = await mysqlPool.query("SELECT dueBillEnabled FROM companies WHERE guid = ?", [companyId]);
  return !!row?.dueBillEnabled;
}

export async function requireDueBillEnabled(user) {
  if (!(await isDueBillEnabled(user.companyId))) {
    throw new ApiError(403, "Due Purchase Bill is not enabled for this company.");
  }
}
