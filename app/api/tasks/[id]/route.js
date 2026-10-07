import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission, isSuperUser, ApiError } from "@/lib/auth";
import { normalizeRole } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureTasksTable, getTaskStatuses, getTerminalTaskStatusValues } from "@/lib/tasksMigration";
import { createNotification } from "@/lib/notifications";
import { deleteUploadedFile } from "@/lib/upload";

const canAssign = (user) => isSuperUser(normalizeRole(user.role)) || !!user.allow_assign_tasks;
// Separate from canAssign: a task's own creator can always edit/delete it
// (guarded by canEditThisTask/canDeleteThisTask below); allow_edit_tasks /
// allow_delete_tasks grant that on EVERY task, not only ones this user
// created — its own Roles checkbox, independent of allow_assign_tasks.
const canEditThisTask = (user, task) =>
  isSuperUser(normalizeRole(user.role)) || !!user.allow_edit_tasks || (canAssign(user) && task.assignedBy === user.id);
const canDeleteThisTask = (user, task) =>
  isSuperUser(normalizeRole(user.role)) || !!user.allow_delete_tasks || (canAssign(user) && task.assignedBy === user.id);

async function loadTask(id, user) {
  const [[task]] = await mysqlPool.query(
    "SELECT * FROM tasks WHERE guid = ? AND isDeleted = 0 AND companyGuid <=> ?",
    [id, user.companyId]
  );
  if (!task) throw new ApiError(404, "Task not found.");
  return task;
}

async function isAssignee(taskGuid, userGuid) {
  const [[row]] = await mysqlPool.query(
    "SELECT 1 FROM task_assignees WHERE taskGuid = ? AND userGuid = ? LIMIT 1",
    [taskGuid, userGuid]
  );
  return !!row;
}

// Any assignee can move the shared task between Pending / In Progress / Done
// (that's the whole point of being assigned it) without needing the
// assign-tasks edit-flag. Editing the task's own details (title, deadline,
// reassigning it) is restricted to whoever is allowed to assign tasks —
// same as creating one.
export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "tasks", "You do not have permission to access tasks.");
  await ensureTasksTable();
  const { id } = await params;
  const task = await loadTask(id, user);
  const body = await parseJsonBody(request);

  const isOwnerOrAdmin = canEditThisTask(user, task);

  const fields = [];
  const values = [];

  if (body.status !== undefined) {
    const assignee = await isAssignee(id, user.id);
    if (!assignee && !isOwnerOrAdmin) throw new ApiError(403, "You cannot update this task's status.");
    const activeStatuses = (await getTaskStatuses()).filter((s) => s.isActive);
    if (!activeStatuses.some((s) => s.value === body.status)) throw new ApiError(400, "Invalid status.");
    const terminalValues = await getTerminalTaskStatusValues();
    const isNowDone = terminalValues.has(body.status);
    const wasDone = terminalValues.has(task.status);
    fields.push("status = ?", "completedAt = ?");
    values.push(body.status, isNowDone ? new Date() : null);
    if (isNowDone && !wasDone && task.assignedBy !== user.id) {
      await createNotification(mysqlPool, {
        targetUserGuid: task.assignedBy,
        title: "Task completed",
        message: `${user.username} marked "${task.title}" as done.`,
        type: "success",
        priority: "low",
        link: "/tasks",
        companyGuid: user.companyId,
      });
    }
  }

  const editableByOwner = ["title", "description", "remarks", "tags", "priority", "deadline", "assignedTo", "relatedType", "relatedId", "attachmentFilename"];
  const wantsOwnerEdit = editableByOwner.some((k) => body[k] !== undefined);
  if (wantsOwnerEdit) {
    if (!isOwnerOrAdmin) throw new ApiError(403, "You do not have permission to edit this task.");
    if (body.title !== undefined) { fields.push("title = ?"); values.push(String(body.title).trim()); }
    if (body.description !== undefined) { fields.push("description = ?"); values.push(body.description || null); }
    if (body.remarks !== undefined) { fields.push("remarks = ?"); values.push(body.remarks || null); }
    if (body.tags !== undefined) {
      const tags = Array.isArray(body.tags) ? [...new Set(body.tags.map((t) => String(t).trim()).filter(Boolean))] : [];
      fields.push("tags = ?"); values.push(tags.length > 0 ? JSON.stringify(tags) : null);
    }
    if (body.priority !== undefined) {
      if (!["Low", "Medium", "High"].includes(body.priority)) throw new ApiError(400, "Invalid priority.");
      fields.push("priority = ?"); values.push(body.priority);
    }
    if (body.deadline !== undefined) {
      // Same local-wall-clock handling as POST /api/tasks above — do not
      // round-trip through Date/toISOString, which would shift it by the
      // server's UTC offset.
      if (body.deadline && isNaN(new Date(body.deadline).getTime())) throw new ApiError(400, "Invalid deadline.");
      const d = body.deadline ? String(body.deadline).replace("T", " ").slice(0, 19) : null;
      fields.push("deadline = ?", "overdueNotifiedAt = NULL");
      values.push(d);
    }
    if (body.relatedType !== undefined) { fields.push("relatedType = ?"); values.push(body.relatedType || null); }
    if (body.relatedId !== undefined) { fields.push("relatedId = ?"); values.push(body.relatedId || null); }
    if (body.attachmentFilename !== undefined) {
      const next = body.attachmentFilename || null;
      // Replacing or removing the attachment leaves the old Drive file
      // orphaned otherwise — best-effort cleanup, same as company
      // logo/profile photo replacement (see lib/upload.js).
      if (task.attachmentFilename && task.attachmentFilename !== next) {
        await deleteUploadedFile(task.attachmentFilename).catch(() => {});
      }
      fields.push("attachmentFilename = ?"); values.push(next);
    }

    // assignedTo replaces the whole assignee list (the New/Edit Task form
    // always sends the complete set it wants, same as a multi-select would).
    if (Array.isArray(body.assignedTo)) {
      const nextAssignees = [...new Set(body.assignedTo.filter(Boolean).map(String))];
      if (nextAssignees.length === 0) throw new ApiError(400, "A task needs at least one assignee.");
      const [currentRows] = await mysqlPool.query("SELECT userGuid FROM task_assignees WHERE taskGuid = ?", [id]);
      const current = new Set(currentRows.map((r) => r.userGuid));
      const added = nextAssignees.filter((a) => !current.has(a));
      await mysqlPool.query("DELETE FROM task_assignees WHERE taskGuid = ?", [id]);
      await mysqlPool.query(
        `INSERT INTO task_assignees (taskGuid, userGuid) VALUES ${nextAssignees.map(() => "(?, ?)").join(",")}`,
        nextAssignees.flatMap((a) => [id, a])
      );
      for (const a of added) {
        if (a === user.id) continue;
        await createNotification(mysqlPool, {
          targetUserGuid: a,
          title: "New task assigned",
          message: `${user.username} assigned you: "${task.title}"`,
          type: "info",
          priority: "low",
          link: "/tasks",
          companyGuid: user.companyId,
        });
      }
    }
  }

  if (fields.length === 0 && !Array.isArray(body.assignedTo)) throw new ApiError(400, "Nothing to update.");
  if (fields.length > 0) {
    await mysqlPool.query(`UPDATE tasks SET ${fields.join(", ")} WHERE guid = ?`, [...values, id]);
  }
  return NextResponse.json({ message: "Task updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "tasks", "You do not have permission to access tasks.");
  await ensureTasksTable();
  const { id } = await params;
  const task = await loadTask(id, user);
  if (!canDeleteThisTask(user, task)) {
    throw new ApiError(403, "You do not have permission to delete this task.");
  }

  await mysqlPool.query("UPDATE tasks SET isDeleted = 1 WHERE guid = ?", [id]);
  await mysqlPool.query("DELETE FROM task_assignees WHERE taskGuid = ?", [id]);
  if (task.attachmentFilename) await deleteUploadedFile(task.attachmentFilename);
  return NextResponse.json({ message: "Task deleted" });
});
