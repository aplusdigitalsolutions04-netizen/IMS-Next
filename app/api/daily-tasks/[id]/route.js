import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission, isSuperUser, ApiError } from "@/lib/auth";
import { normalizeRole } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureDailyTasksTable } from "@/lib/dailyTasksMigration";
import { getTaskStatuses } from "@/lib/tasksMigration";
import { isValidYmd, getActiveColumns, parseCustomValues, sanitizeCustomValues } from "@/lib/dailyTasksHelpers";
import { deleteUploadedFile } from "@/lib/upload";

// A row belongs to whoever added it: only they (or Admin) can edit or delete
// it, so "who added what, and when" in the admin view can't be rewritten by
// someone else.
async function loadOwned(id, user) {
  const [[row]] = await mysqlPool.query(
    "SELECT * FROM daily_tasks WHERE guid = ? AND isDeleted = 0 AND companyGuid <=> ?",
    [id, user.companyId]
  );
  if (!row) throw new ApiError(404, "Task not found.");
  if (row.userGuid !== user.id && !isSuperUser(normalizeRole(user.role))) {
    throw new ApiError(403, "You can only change your own daily tasks.");
  }
  return row;
}

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "dailyTasks", "You do not have permission to access daily tasks.");
  await ensureDailyTasksTable();
  const { id } = await params;
  const row = await loadOwned(id, user);
  const body = await parseJsonBody(request);

  const fields = [];
  const values = [];
  if (body.task !== undefined) {
    const task = String(body.task).trim();
    if (!task) throw new ApiError(400, "Task can't be empty.");
    fields.push("task = ?"); values.push(task);
  }
  if (body.status !== undefined) {
    const active = (await getTaskStatuses()).filter((s) => s.isActive);
    if (!active.some((s) => s.value === body.status)) throw new ApiError(400, "Invalid status.");
    fields.push("status = ?"); values.push(body.status);
  }
  if (body.taskDate !== undefined) {
    if (!isValidYmd(body.taskDate)) throw new ApiError(400, "Invalid date.");
    fields.push("taskDate = ?"); values.push(body.taskDate);
  }
  if (body.customValues !== undefined) {
    // merge: only the columns sent are touched, the rest keep their values
    const merged = {
      ...parseCustomValues(row.customValues),
      ...sanitizeCustomValues(body.customValues, await getActiveColumns(user.companyId)),
    };
    fields.push("customValues = ?"); values.push(JSON.stringify(merged));
  }
  if (fields.length === 0) throw new ApiError(400, "Nothing to update.");

  await mysqlPool.query(`UPDATE daily_tasks SET ${fields.join(", ")} WHERE guid = ?`, [...values, id]);
  return NextResponse.json({ message: "Updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "dailyTasks", "You do not have permission to access daily tasks.");
  await ensureDailyTasksTable();
  const { id } = await params;
  const row = await loadOwned(id, user);

  await mysqlPool.query("UPDATE daily_tasks SET isDeleted = 1 WHERE guid = ?", [id]);
  if (row.screenshotFilename) await deleteUploadedFile(row.screenshotFilename);
  return NextResponse.json({ message: "Deleted" });
});
