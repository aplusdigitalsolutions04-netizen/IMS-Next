import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { requireTasksOrDailyAccess, requireStatusManage } from "@/lib/dailyTasksHelpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureTaskStatusSeeded, getTaskStatuses, TASK_STATUS_CODE } from "@/lib/tasksMigration";

// Task Status is an admin-editable master (Pending/In Progress/Done are just
// the seeded defaults, not fixed values) — same dropdown_master/dropdown_option
// tables Care Pack and "Related To" use. Anyone with the "tasks" permission
// can read the list (it drives the status picker everyone uses); only
// whoever can assign tasks can add/edit/delete entries.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireTasksOrDailyAccess(user);

  const data = await getTaskStatuses();
  return NextResponse.json({ data });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireTasksOrDailyAccess(user);
  requireStatusManage(user);
  await ensureTaskStatusSeeded();

  const { name, color } = await parseJsonBody(request);
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new ApiError(400, "Status name is required.");
  if (color !== undefined && color !== null && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new ApiError(400, "Color must be a hex code like #4f46e5.");
  }

  const [[master]] = await mysqlPool.query("SELECT id FROM dropdown_master WHERE dropdown_code = ?", [TASK_STATUS_CODE]);
  const [existing] = await mysqlPool.query(
    "SELECT guid FROM dropdown_option WHERE dropdown_id = ? AND LOWER(option_label) = LOWER(?)",
    [master.id, trimmed]
  );
  if (existing.length) throw new ApiError(400, `"${trimmed}" already exists.`);

  const [[{ maxSort }]] = await mysqlPool.query(
    "SELECT COALESCE(MAX(display_order), 0) as maxSort FROM dropdown_option WHERE dropdown_id = ?",
    [master.id]
  );
  const guid = randomUUID();
  await mysqlPool.query(
    "INSERT INTO dropdown_option (guid, dropdown_id, option_label, option_value, display_order, is_active, extra2) VALUES (?, ?, ?, ?, ?, 1, ?)",
    [guid, master.id, trimmed, trimmed, maxSort + 1, color || null]
  );

  return NextResponse.json({ message: "Status added", guid, value: trimmed }, { status: 201 });
});
