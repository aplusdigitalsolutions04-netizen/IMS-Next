import { mysqlPool } from "@/lib/db";
import { ensureTasksTable, getTerminalTaskStatusValues } from "@/lib/tasksMigration";
import { createNotification } from "@/lib/notifications";

// "Due soon" (within 24h) and "overdue" reminders for the signed-in user's
// own tasks. There is no cron in this app, so this runs lazily from the
// notifications poll (throttled per user) — each task is notified at most
// once per kind, tracked by dueSoonNotifiedAt / overdueNotifiedAt.
let columnEnsured = false;
async function ensureReminderColumn() {
  if (columnEnsured) return;
  await ensureTasksTable();
  try {
    await mysqlPool.query("ALTER TABLE tasks ADD COLUMN dueSoonNotifiedAt DATETIME NULL");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
  columnEnsured = true;
}

const lastRun = new Map(); // userGuid -> timestamp
const MIN_GAP_MS = 60 * 1000;

const fmtDue = (d) =>
  new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });

export async function runTaskReminders(user) {
  if (!user?.id) return;
  const now = Date.now();
  if (now - (lastRun.get(user.id) || 0) < MIN_GAP_MS) return;
  lastRun.set(user.id, now);

  try {
    await ensureReminderColumn();
    const terminal = await getTerminalTaskStatusValues();

    // Overdue
    const [overdue] = await mysqlPool.query(
      `SELECT t.guid, t.title, t.status FROM tasks t
         JOIN task_assignees ta ON ta.taskGuid = t.guid AND ta.userGuid = ?
        WHERE t.isDeleted = 0 AND t.deadline IS NOT NULL AND t.deadline < NOW() AND t.overdueNotifiedAt IS NULL`,
      [user.id]
    );
    const overdueRows = overdue.filter((t) => !terminal.has(t.status));
    if (overdueRows.length > 0) {
      await mysqlPool.query("UPDATE tasks SET overdueNotifiedAt = NOW() WHERE guid IN (?)", [overdueRows.map((r) => r.guid)]);
      for (const t of overdueRows) {
        await createNotification(mysqlPool, {
          targetUserGuid: user.id, title: "Task overdue", message: `"${t.title}" is past its deadline.`,
          type: "warning", priority: "high", link: "/tasks", companyGuid: user.companyId,
        });
      }
    }

    // Due within the next 24 hours
    const [soon] = await mysqlPool.query(
      `SELECT t.guid, t.title, t.status, t.deadline FROM tasks t
         JOIN task_assignees ta ON ta.taskGuid = t.guid AND ta.userGuid = ?
        WHERE t.isDeleted = 0 AND t.deadline IS NOT NULL AND t.deadline >= NOW()
          AND t.deadline <= DATE_ADD(NOW(), INTERVAL 24 HOUR) AND t.dueSoonNotifiedAt IS NULL`,
      [user.id]
    );
    const soonRows = soon.filter((t) => !terminal.has(t.status));
    if (soonRows.length > 0) {
      await mysqlPool.query("UPDATE tasks SET dueSoonNotifiedAt = NOW() WHERE guid IN (?)", [soonRows.map((r) => r.guid)]);
      for (const t of soonRows) {
        await createNotification(mysqlPool, {
          targetUserGuid: user.id, title: "Task due soon", message: `"${t.title}" is due ${fmtDue(t.deadline)}.`,
          type: "warning", priority: "high", link: "/tasks", companyGuid: user.companyId,
        });
      }
    }
  } catch (err) {
    // Reminders are best-effort — never let them break the notifications fetch.
    console.error("Task reminders failed:", err.message);
  }
}
