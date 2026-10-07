import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";

// Lazy self-migration for the Credentials module, same pattern as
// lib/tasksMigration.js. Explicit utf8mb4_unicode_ci so joins against
// users.userid (that collation) don't hit "Illegal mix of collations".
let ensured = false;
export async function ensureCredentialsTables() {
  if (ensured) return;
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS credentials (
      guid VARCHAR(36) PRIMARY KEY,
      companyGuid VARCHAR(36) NULL,
      title VARCHAR(255) NOT NULL,
      username VARCHAR(255) NULL,
      passwordEnc TEXT NULL,
      url VARCHAR(500) NULL,
      category VARCHAR(100) NULL,
      notes TEXT NULL,
      customFields JSON NULL,
      createdBy VARCHAR(36) NOT NULL,
      updatedBy VARCHAR(36) NULL,
      passwordChangedAt DATETIME NULL,
      passwordChangedBy VARCHAR(36) NULL,
      isDeleted TINYINT(1) NOT NULL DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_credentials_company (companyGuid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS credential_password_history (
      guid VARCHAR(36) PRIMARY KEY,
      credentialGuid VARCHAR(36) NOT NULL,
      passwordEnc TEXT NULL,
      changedBy VARCHAR(36) NOT NULL,
      changedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_cph_credential (credentialGuid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

// Category (Portal / Email / Bank / ...) is an admin-editable list on the
// generic dropdown_master/dropdown_option tables, like Task Status/Related To.
export const CREDENTIAL_CATEGORY_CODE = "CREDENTIAL_CATEGORY";
const DEFAULT_CATEGORIES = ["Portal", "Email", "Bank", "API Key", "Other"];
let categoryEnsured = false;
export async function ensureCredentialCategorySeeded() {
  if (categoryEnsured) return;
  const [[existing]] = await mysqlPool.query("SELECT id FROM dropdown_master WHERE dropdown_code = ?", [CREDENTIAL_CATEGORY_CODE]);
  if (!existing) {
    const [result] = await mysqlPool.query(
      "INSERT INTO dropdown_master (companyGuid, guid, dropdown_code, dropdown_name, fieldType, is_active) VALUES (NULL, ?, ?, ?, 'DROPDOWN', 1)",
      [randomUUID(), CREDENTIAL_CATEGORY_CODE, "Credential Category"]
    );
    await mysqlPool.query(
      `INSERT INTO dropdown_option (guid, dropdown_id, option_label, option_value, display_order, is_active) VALUES ${DEFAULT_CATEGORIES.map(() => "(?, ?, ?, ?, ?, 1)").join(",")}`,
      DEFAULT_CATEGORIES.flatMap((label, i) => [randomUUID(), result.insertId, label, label, i + 1])
    );
  }
  categoryEnsured = true;
}

export const MAX_PASSWORD_HISTORY = 10;
