import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";

// Lazy self-migration for Contract Groups (same pattern as
// lib/dailyTasksMigration.js). Explicit utf8mb4_unicode_ci on every table so
// nothing hits "Illegal mix of collations" against the rest of the schema.
// These tables only ever READ from contracts/orders/inventory — group rows
// are their own snapshot copies, nothing here is written back anywhere else.
let ensured = false;
export async function ensureContractGroupsTables() {
  if (ensured) return;
  const tail = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS contract_groups (
      guid VARCHAR(36) PRIMARY KEY,
      companyGuid VARCHAR(36) NULL,
      name VARCHAR(255) NOT NULL,
      matchFields JSON NULL,
      matchValues JSON NULL,
      clientGuid VARCHAR(36) NULL,
      customValues JSON NULL,
      createdBy VARCHAR(100) NULL,
      isDeleted TINYINT(1) NOT NULL DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_contract_groups_company (companyGuid)
    ) ${tail}
  `);

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS contract_group_rows (
      guid VARCHAR(36) PRIMARY KEY,
      groupGuid VARCHAR(36) NOT NULL,
      sourceType ENUM('contract','order') NOT NULL,
      sourceGuid VARCHAR(36) NOT NULL,
      productKey VARCHAR(64) NOT NULL DEFAULT '0',
      sourceCompanyGuid VARCHAR(36) NULL,
      rowDate DATE NULL,
      firm VARCHAR(255) NULL,
      contractNumber VARCHAR(100) NULL,
      item TEXT NULL,
      orderQty DECIMAL(14,3) NOT NULL DEFAULT 0,
      landingPrice DECIMAL(14,2) NULL,
      qtyDelivered DECIMAL(14,3) NOT NULL DEFAULT 0,
      orderAmount DECIMAL(14,2) NOT NULL DEFAULT 0,
      gstPct DECIMAL(5,2) NOT NULL DEFAULT 18,
      commLabel VARCHAR(100) NULL,
      sourceStatus VARCHAR(50) NULL,
      sortOrder INT NOT NULL DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_group_source (groupGuid, sourceType, sourceGuid, productKey),
      INDEX idx_group_rows_group (groupGuid)
    ) ${tail}
  `);

  // Contracts/orders explicitly removed from a group — so they're never
  // re-suggested or re-added to that same group automatically.
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS contract_group_removed (
      groupGuid VARCHAR(36) NOT NULL,
      sourceGuid VARCHAR(36) NOT NULL,
      removedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (groupGuid, sourceGuid)
    ) ${tail}
  `);

  // Extra columns for the group LIST table (Text / Number / Date / Dropdown);
  // each group's values live in contract_groups.customValues keyed by guid.
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS contract_group_columns (
      guid VARCHAR(36) PRIMARY KEY,
      label VARCHAR(100) NOT NULL,
      type ENUM('text','number','date','dropdown') NOT NULL DEFAULT 'text',
      options JSON NULL,
      displayOrder INT NOT NULL DEFAULT 0,
      isActive TINYINT(1) NOT NULL DEFAULT 1,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ${tail}
  `);

  // Master list behind each row's "Commission Status" dropdown (Paid /
  // Unpaid / Pending by default, editable from the group page).
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS contract_group_commission_statuses (
      guid VARCHAR(36) PRIMARY KEY,
      label VARCHAR(100) NOT NULL,
      color VARCHAR(20) NOT NULL DEFAULT 'slate',
      displayOrder INT NOT NULL DEFAULT 0,
      isActive TINYINT(1) NOT NULL DEFAULT 1,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ${tail}
  `);
  const [[{ n }]] = await mysqlPool.query("SELECT COUNT(*) AS n FROM contract_group_commission_statuses");
  if (Number(n) === 0) {
    const defaults = [["Paid", "emerald"], ["Unpaid", "rose"], ["Pending", "amber"]];
    for (let i = 0; i < defaults.length; i++) {
      await mysqlPool.query("INSERT INTO contract_group_commission_statuses (guid, label, color, displayOrder) VALUES (?, ?, ?, ?)", [randomUUID(), defaults[i][0], defaults[i][1], i]);
    }
  }
  try {
    await mysqlPool.query("ALTER TABLE contract_group_rows ADD COLUMN commStatusGuid VARCHAR(36) NULL");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }

  // Commission is entered by hand per row (starts at 0), not calculated.
  try {
    await mysqlPool.query("ALTER TABLE contract_group_rows ADD COLUMN commission DECIMAL(14,2) NOT NULL DEFAULT 0");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }

  ensured = true;
}
