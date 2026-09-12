import { mysqlPool } from "./db";

// Lazily creates the `clients` table the first time Client Master is
// touched — same self-migrating pattern as lib/companiesMigration.js /
// lib/emailAccountsMigration.js, avoids a separate manual migration step
// per environment. One row per client/buyer a company regularly dispatches
// to, tagged with the selling platform(s) it's used for so New Dispatch can
// offer only the clients relevant to whichever platform is selected.
let ensured = false;
export async function ensureClientsTable() {
  if (ensured) return;
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      guid CHAR(36) NOT NULL PRIMARY KEY,
      companyGuid CHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      gstNumber VARCHAR(20) NULL,
      contactNumber VARCHAR(100) NULL,
      shippingAddress TEXT NULL,
      buyerAddress TEXT NULL,
      consigneeName VARCHAR(255) NULL,
      allowedPlatforms JSON NULL,
      isActive TINYINT(1) NOT NULL DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_clients_companyGuid (companyGuid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}
