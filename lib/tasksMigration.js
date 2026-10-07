import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";

// Lazy self-migration for the Tasks module (per-user task assignment),
// same pattern as lib/carePackMigration.js / lib/companiesMigration.js.
//
// Explicit CHARSET/COLLATE below matters: a bare CREATE TABLE picks up the
// database's own default collation, which on newer MySQL is
// utf8mb4_0900_ai_ci — but users.userid (and most of this app's existing
// VARCHAR id columns) are utf8mb4_unicode_ci. Joining task_assignees/tasks
// against users.userid across those two collations 500s with "Illegal mix
// of collations" (the same class of issue noted in lib/companyMatch.js), so
// this pins both new tables to match.
let ensured = false;
export async function ensureTasksTable() {
  if (ensured) return;
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      guid VARCHAR(36) PRIMARY KEY,
      companyGuid VARCHAR(36) NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      remarks TEXT NULL,
      tags JSON NULL,
      priority ENUM('Low','Medium','High') NOT NULL DEFAULT 'Medium',
      status VARCHAR(50) NOT NULL DEFAULT 'Pending',
      deadline DATETIME NULL,
      assignedBy VARCHAR(36) NOT NULL,
      relatedType VARCHAR(50) NULL,
      relatedId VARCHAR(100) NULL,
      attachmentFilename VARCHAR(255) NULL,
      completedAt DATETIME NULL,
      overdueNotifiedAt DATETIME NULL,
      isDeleted TINYINT(1) NOT NULL DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tasks_assignedBy (assignedBy),
      INDEX idx_tasks_company (companyGuid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // A task can go to more than one person — who it's assigned to lives here,
  // not as a single column on tasks, so any number of people can share one
  // task (each can move the shared status; see app/api/tasks/[id]/route.js).
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS task_assignees (
      taskGuid VARCHAR(36) NOT NULL,
      userGuid VARCHAR(36) NOT NULL,
      PRIMARY KEY (taskGuid, userGuid),
      INDEX idx_task_assignees_user (userGuid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Self-heal a `tasks`/`task_assignees` table left over from before this
  // fix (or before remarks/tags existed), instead of leaving a stale
  // mismatched/older-shaped table around from an earlier run.
  const [[tasksColl]] = await mysqlPool.query(
    "SELECT COLLATION_NAME as coll FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'assignedBy'"
  );
  if (tasksColl?.coll && tasksColl.coll !== "utf8mb4_unicode_ci") {
    await mysqlPool.query("ALTER TABLE tasks CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  }
  const [[assigneesColl]] = await mysqlPool.query(
    "SELECT COLLATION_NAME as coll FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_assignees' AND COLUMN_NAME = 'userGuid'"
  );
  if (assigneesColl?.coll && assigneesColl.coll !== "utf8mb4_unicode_ci") {
    await mysqlPool.query("ALTER TABLE task_assignees CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  }

  // A task created before remarks/tags/task_assignees existed won't have
  // these columns — add them idempotently rather than requiring a fresh
  // table (ER_DUP_FIELDNAME means it's already there, safe to ignore).
  for (const stmt of [
    "ALTER TABLE tasks ADD COLUMN remarks TEXT NULL",
    "ALTER TABLE tasks ADD COLUMN tags JSON NULL",
  ]) {
    try {
      await mysqlPool.query(stmt);
    } catch (err) {
      if (err.code !== "ER_DUP_FIELDNAME") throw err;
    }
  }

  // A task created before multi-assignee support only had a single
  // `assignedTo` column — carry that one assignee over into task_assignees
  // so nothing existing silently disappears from anyone's list, then the
  // column itself is dropped since task_assignees is now the only source
  // of truth for who a task is assigned to.
  const [[hasOldColumn]] = await mysqlPool.query(
    "SELECT COUNT(*) as cnt FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'assignedTo'"
  );
  if (hasOldColumn.cnt > 0) {
    await mysqlPool.query(
      "INSERT IGNORE INTO task_assignees (taskGuid, userGuid) SELECT guid, assignedTo FROM tasks WHERE assignedTo IS NOT NULL"
    );
    await mysqlPool.query("ALTER TABLE tasks DROP COLUMN assignedTo");
  }

  // A task created before this fix had `status` as a fixed ENUM — widen it
  // to free text so an admin-defined status (not just Pending/In
  // Progress/Done) can be stored. ENUM values are already valid strings, so
  // this never loses data.
  const [[statusCol]] = await mysqlPool.query(
    "SELECT DATA_TYPE as dt FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'status'"
  );
  if (statusCol?.dt === "enum") {
    await mysqlPool.query("ALTER TABLE tasks MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'Pending'");
  }

  await ensureTaskStatusSeeded();

  ensured = true;
}

// Task status (Pending / In Progress / Done / ...) is an admin-editable
// master, same dropdown_master/dropdown_option tables "Related To" and Care
// Pack use — global (companyGuid NULL). Three of dropdown_option's existing
// generic columns carry status-specific meaning here: `is_default` marks the
// status a new task starts at, `extra1 = 'terminal'` marks the status that
// counts as "done" (drives completedAt, the "task completed" notification,
// and Overdue detection) — exactly one of each is meaningful, so setting
// either clears it from every other status option (see
// app/api/tasks/statuses/[guid]/route.js) — and `extra2` holds a hex color
// (e.g. "#4f46e5") the status picker/badges are tinted with.
const TASK_STATUS_CODE = "TASK_STATUS";
const DEFAULT_STATUS_COLOR = "#64748b"; // slate — used when a status has no color set
const TASK_STATUS_DEFAULTS = [
  { label: "Pending", isDefault: true, isTerminal: false, color: "#64748b" },
  { label: "In Progress", isDefault: false, isTerminal: false, color: "#4f46e5" },
  { label: "Done", isDefault: false, isTerminal: true, color: "#10b981" },
];
let taskStatusEnsured = false;
export async function ensureTaskStatusSeeded() {
  if (taskStatusEnsured) return;
  const [[existing]] = await mysqlPool.query("SELECT id FROM dropdown_master WHERE dropdown_code = ?", [TASK_STATUS_CODE]);
  if (!existing) {
    const guid = randomUUID();
    const [result] = await mysqlPool.query(
      "INSERT INTO dropdown_master (companyGuid, guid, dropdown_code, dropdown_name, fieldType, is_active) VALUES (NULL, ?, ?, ?, 'DROPDOWN', 1)",
      [guid, TASK_STATUS_CODE, "Task Status"]
    );
    const masterId = result.insertId;
    await mysqlPool.query(
      `INSERT INTO dropdown_option (guid, dropdown_id, option_label, option_value, display_order, is_default, is_active, extra1, extra2) VALUES ${TASK_STATUS_DEFAULTS.map(() => "(?, ?, ?, ?, ?, ?, 1, ?, ?)").join(",")}`,
      TASK_STATUS_DEFAULTS.flatMap((o, i) => [randomUUID(), masterId, o.label, o.label, i + 1, o.isDefault ? 1 : 0, o.isTerminal ? "terminal" : null, o.color])
    );
  }
  taskStatusEnsured = true;
}

async function getTaskStatusMasterId() {
  await ensureTaskStatusSeeded();
  const [[master]] = await mysqlPool.query("SELECT id FROM dropdown_master WHERE dropdown_code = ?", [TASK_STATUS_CODE]);
  return master.id;
}

export async function getTaskStatuses() {
  const masterId = await getTaskStatusMasterId();
  const [rows] = await mysqlPool.query(
    `SELECT guid, option_label AS label, option_value AS value,
            CAST(is_default AS UNSIGNED) AS isDefault,
            (IFNULL(extra1, '') = 'terminal') AS isTerminal,
            CAST(is_active AS UNSIGNED) AS isActive,
            extra2 AS color,
            display_order AS sortOrder
     FROM dropdown_option WHERE dropdown_id = ? ORDER BY display_order ASC, option_label ASC`,
    [masterId]
  );
  return rows.map((r) => ({ ...r, isDefault: !!r.isDefault, isTerminal: !!r.isTerminal, isActive: !!r.isActive, color: r.color || DEFAULT_STATUS_COLOR }));
}

export async function getDefaultTaskStatus() {
  const statuses = (await getTaskStatuses()).filter((s) => s.isActive);
  return (statuses.find((s) => s.isDefault) || statuses[0] || { value: "Pending" }).value;
}

// A Set (not a single value) since nothing actually stops an admin leaving
// more than one status marked terminal from the master UI — every one of
// them still counts as "done" wherever this is checked.
export async function getTerminalTaskStatusValues() {
  const statuses = await getTaskStatuses();
  return new Set(statuses.filter((s) => s.isTerminal).map((s) => s.value));
}

export { TASK_STATUS_CODE };

// "Related To" (Order / Contract / Stock In / ...) rides the same generic
// dropdown_master/dropdown_option tables Care Pack and Delivery Partner use
// (see lib/carePackMigration.js) — global (companyGuid NULL), so an Admin can
// add new related-record types from the New Task form itself instead of
// them being hardcoded here.
const TASK_RELATED_TYPE_CODE = "TASK_RELATED_TYPE";
const TASK_RELATED_TYPE_DEFAULTS = ["Order", "Contract", "Stock In"];
let relatedTypeEnsured = false;
export async function ensureTaskRelatedTypeSeeded() {
  if (relatedTypeEnsured) return;
  const [[existing]] = await mysqlPool.query(
    "SELECT id FROM dropdown_master WHERE dropdown_code = ?",
    [TASK_RELATED_TYPE_CODE]
  );
  if (!existing) {
    const guid = randomUUID();
    const [result] = await mysqlPool.query(
      "INSERT INTO dropdown_master (companyGuid, guid, dropdown_code, dropdown_name, fieldType, is_active) VALUES (NULL, ?, ?, ?, 'DROPDOWN', 1)",
      [guid, TASK_RELATED_TYPE_CODE, "Task Related To"]
    );
    const masterId = result.insertId;
    await mysqlPool.query(
      `INSERT INTO dropdown_option (guid, dropdown_id, option_label, option_value, display_order, is_active) VALUES ${TASK_RELATED_TYPE_DEFAULTS.map(() => "(?, ?, ?, ?, ?, 1)").join(",")}`,
      TASK_RELATED_TYPE_DEFAULTS.flatMap((label, i) => [randomUUID(), masterId, label, label, i + 1])
    );
  }
  relatedTypeEnsured = true;
}
export { TASK_RELATED_TYPE_CODE };

// A task reads as "Overdue" once its deadline has passed and it isn't in a
// terminal ("done") status yet — this is derived at read time (not a stored
// status) so a deadline edit or a status change always reflects immediately,
// with no separate cron needed to flip it back and forth. `terminalValues`
// is a Set from getTerminalTaskStatusValues(), fetched once per request
// (not per row) by the caller.
export const withEffectiveStatus = (row, terminalValues) => {
  const isDone = terminalValues.has(row.status);
  const isOverdue = !isDone && row.deadline && new Date(row.deadline).getTime() < Date.now();
  return { ...row, isDone, effectiveStatus: isOverdue ? "Overdue" : row.status };
};
