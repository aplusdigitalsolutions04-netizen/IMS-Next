import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { requireTasksOrDailyAccess, requireStatusManage } from "@/lib/dailyTasksHelpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureTaskStatusSeeded, TASK_STATUS_CODE } from "@/lib/tasksMigration";
import { ensureDailyTasksTable } from "@/lib/dailyTasksMigration";

async function findOwnedOption(guid) {
  const [[row]] = await mysqlPool.query(
    `SELECT o.id, o.option_label, o.option_value FROM dropdown_option o
     JOIN dropdown_master m ON o.dropdown_id = m.id
     WHERE o.guid = ? AND m.dropdown_code = ?`,
    [guid, TASK_STATUS_CODE]
  );
  return row || null;
}

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireTasksOrDailyAccess(user);
  requireStatusManage(user);
  await ensureTaskStatusSeeded();
  const { guid } = await params;

  const { name, isActive, isDefault, isTerminal, color } = await parseJsonBody(request);
  const option = await findOwnedOption(guid);
  if (!option) throw new ApiError(404, "Status not found.");

  if (color !== undefined) {
    if (color !== null && !/^#[0-9a-fA-F]{6}$/.test(color)) throw new ApiError(400, "Color must be a hex code like #4f46e5.");
    await mysqlPool.query("UPDATE dropdown_option SET extra2 = ? WHERE id = ?", [color || null, option.id]);
  }

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) throw new ApiError(400, "Status name is required.");
    // Renaming changes the *value* stored on every task currently in this
    // status too — otherwise those tasks would silently point at a status
    // value that no longer exists in the master.
    await mysqlPool.query("UPDATE dropdown_option SET option_label = ?, option_value = ? WHERE id = ?", [trimmed, trimmed, option.id]);
    await mysqlPool.query("UPDATE tasks SET status = ? WHERE status = ?", [trimmed, option.option_value]);
    await ensureDailyTasksTable();
    await mysqlPool.query("UPDATE daily_tasks SET status = ? WHERE status = ?", [trimmed, option.option_value]);
    option.option_value = trimmed;
  }

  if (isActive !== undefined) {
    await mysqlPool.query("UPDATE dropdown_option SET is_active = ? WHERE id = ?", [isActive ? 1 : 0, option.id]);
  }

  // Exactly one status is meaningfully "the default" / "the terminal one" —
  // setting either here clears it from every other status under the same
  // master first.
  if (isDefault !== undefined) {
    if (isDefault) {
      const [[master]] = await mysqlPool.query("SELECT dropdown_id FROM dropdown_option WHERE id = ?", [option.id]);
      await mysqlPool.query("UPDATE dropdown_option SET is_default = 0 WHERE dropdown_id = ?", [master.dropdown_id]);
    }
    await mysqlPool.query("UPDATE dropdown_option SET is_default = ? WHERE id = ?", [isDefault ? 1 : 0, option.id]);
  }
  if (isTerminal !== undefined) {
    if (isTerminal) {
      const [[master]] = await mysqlPool.query("SELECT dropdown_id FROM dropdown_option WHERE id = ?", [option.id]);
      await mysqlPool.query("UPDATE dropdown_option SET extra1 = NULL WHERE dropdown_id = ?", [master.dropdown_id]);
    }
    await mysqlPool.query("UPDATE dropdown_option SET extra1 = ? WHERE id = ?", [isTerminal ? "terminal" : null, option.id]);
  }

  return NextResponse.json({ message: "Status updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireTasksOrDailyAccess(user);
  requireStatusManage(user);
  await ensureTaskStatusSeeded();
  const { guid } = await params;

  const option = await findOwnedOption(guid);
  if (!option) throw new ApiError(404, "Status not found.");

  await ensureDailyTasksTable();
  const [[{ usageCount }]] = await mysqlPool.query(
    `SELECT (SELECT COUNT(*) FROM tasks WHERE status = ? AND isDeleted = 0)
          + (SELECT COUNT(*) FROM daily_tasks WHERE status = ? AND isDeleted = 0) AS usageCount`,
    [option.option_value, option.option_value]
  );
  if (usageCount > 0) {
    throw new ApiError(400, `"${option.option_label}" is used by ${usageCount} existing task(s) — deactivate it instead of deleting, so those tasks keep a valid status.`);
  }

  await mysqlPool.query("DELETE FROM dropdown_option WHERE id = ?", [option.id]);
  return NextResponse.json({ message: "Status deleted" });
});
