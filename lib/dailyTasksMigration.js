import { mysqlPool } from "@/lib/db";

// Lazy self-migration for Daily Tasks, same pattern as lib/tasksMigration.js.
// Explicit utf8mb4_unicode_ci so joins against users.userid don't hit
// "Illegal mix of collations".
let ensured = false;
export async function ensureDailyTasksTable() {
  if (ensured) return;
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS daily_tasks (
      guid VARCHAR(36) PRIMARY KEY,
      companyGuid VARCHAR(36) NULL,
      userGuid VARCHAR(36) NOT NULL,
      taskDate DATE NOT NULL,
      task TEXT NOT NULL,
      status VARCHAR(50) NOT NULL,
      customValues JSON NULL,
      screenshotFilename VARCHAR(255) NULL,
      screenshotAt DATETIME NULL,
      isDeleted TINYINT(1) NOT NULL DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_daily_tasks_user_date (userGuid, taskDate),
      INDEX idx_daily_tasks_company_date (companyGuid, taskDate)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  try {
    await mysqlPool.query("ALTER TABLE daily_tasks ADD COLUMN customValues JSON NULL");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }

  // Extra table columns an admin can add (Text / Number / Date / Dropdown).
  // Per company; each row's values live in daily_tasks.customValues keyed by
  // the column's guid, so renaming a column never orphans its data.
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS daily_task_columns (
      guid VARCHAR(36) PRIMARY KEY,
      companyGuid VARCHAR(36) NULL,
      label VARCHAR(100) NOT NULL,
      type ENUM('text','number','date','dropdown') NOT NULL DEFAULT 'text',
      options JSON NULL,
      displayOrder INT NOT NULL DEFAULT 0,
      isActive TINYINT(1) NOT NULL DEFAULT 1,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dtc_company (companyGuid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}
