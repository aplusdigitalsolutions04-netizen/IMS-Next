import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission, requireEditPermission, isSuperUser, ApiError } from "@/lib/auth";
import { normalizeRole } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureTasksTable, withEffectiveStatus, getTerminalTaskStatusValues, getDefaultTaskStatus } from "@/lib/tasksMigration";
import { createNotification } from "@/lib/notifications";

const canAssign = (user) => isSuperUser(normalizeRole(user.role)) || !!user.allow_assign_tasks;

// A task's tags are stored as a JSON array; mysql2 already parses a JSON
// column into a JS value, but guard against a stray string/NULL either way.
const parseTags = (v) => (Array.isArray(v) ? v : (() => { try { const p = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(p) ? p : []; } catch { return []; } })());

// Every task row needs its assignee list attached (name + guid) — one extra
// query for the whole page of rows instead of N+1 per task.
async function attachAssignees(rows) {
  if (rows.length === 0) return rows;
  const [assigneeRows] = await mysqlPool.query(
    `SELECT ta.taskGuid, u.userid, u.username, u.fullName
     FROM task_assignees ta JOIN users u ON u.userid = ta.userGuid
     WHERE ta.taskGuid IN (?)`,
    [rows.map((r) => r.guid)]
  );
  const byTask = new Map();
  for (const a of assigneeRows) {
    if (!byTask.has(a.taskGuid)) byTask.set(a.taskGuid, []);
    byTask.get(a.taskGuid).push({ userGuid: a.userid, name: a.fullName || a.username });
  }
  return rows.map((r) => ({ ...r, tags: parseTags(r.tags), assignees: byTask.get(r.guid) || [] }));
}

// Fires once per task, the first time a GET happens to notice its deadline
// has passed — piggybacked on normal list reads instead of a separate cron,
// same "lazy, on next relevant read" spirit as this codebase's other
// self-migrating/self-checking helpers.
async function notifyNewlyOverdue(user, terminalValues) {
  const [candidates] = await mysqlPool.query(
    `SELECT t.guid, t.title, t.status FROM tasks t
     JOIN task_assignees ta ON ta.taskGuid = t.guid AND ta.userGuid = ?
     WHERE t.isDeleted = 0
       AND t.deadline IS NOT NULL AND t.deadline < NOW() AND t.overdueNotifiedAt IS NULL`,
    [user.id]
  );
  const rows = candidates.filter((t) => !terminalValues.has(t.status));
  if (rows.length === 0) return;
  await mysqlPool.query("UPDATE tasks SET overdueNotifiedAt = NOW() WHERE guid IN (?)", [rows.map((r) => r.guid)]);
  for (const t of rows) {
    await createNotification(mysqlPool, {
      targetUserGuid: user.id,
      title: "Task overdue",
      message: `"${t.title}" is past its deadline.`,
      type: "warning",
      priority: "high",
      link: "/tasks",
      companyGuid: user.companyId,
    });
  }
}

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "tasks", "You do not have permission to access tasks.");
  await ensureTasksTable();
  const terminalValues = await getTerminalTaskStatusValues();
  await notifyNewlyOverdue(user, terminalValues);

  const { searchParams } = new URL(request.url);
  // "mine" (assigned to me — the default, everyone can see this), "byMe"
  // (tasks I handed out), "all" (every task in the company — assigners only).
  const scope = searchParams.get("scope") || "mine";
  const limit = Math.min(parseInt(searchParams.get("limit")) || 500, 500);

  let clause = "WHERE t.isDeleted = 0 AND t.companyGuid <=> ?";
  const params = [user.companyId];
  let join = "";

  if (scope === "byMe") {
    if (!canAssign(user)) throw new ApiError(403, "You do not have permission to assign tasks.");
    clause += " AND t.assignedBy = ?";
    params.push(user.id);
  } else if (scope === "all") {
    if (!canAssign(user)) throw new ApiError(403, "You do not have permission to view all tasks.");
  } else {
    join = "JOIN task_assignees mine ON mine.taskGuid = t.guid AND mine.userGuid = ?";
    params.unshift(user.id);
  }

  const [rows] = await mysqlPool.query(
    `SELECT DISTINCT t.*, ab.username AS assignedByName
     FROM tasks t
     ${join}
     LEFT JOIN users ab ON ab.userid = t.assignedBy
     ${clause}
     ORDER BY t.deadline IS NULL, t.deadline ASC, t.createdAt DESC
     LIMIT ?`,
    [...params, limit]
  );

  const withAssignees = await attachAssignees(rows);
  const withStatus = withAssignees.map((r) => withEffectiveStatus(r, terminalValues));
  // Terminal (done) tasks sink to the bottom, everything else keeps the
  // deadline/created-date ordering the query already applied.
  withStatus.sort((a, b) => Number(a.isDone) - Number(b.isDone));
  return NextResponse.json({ data: withStatus });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "tasks", "You do not have permission to access tasks.");
  requireEditPermission(user, "allow_assign_tasks");
  await ensureTasksTable();

  const body = await parseJsonBody(request);
  const title = String(body.title || "").trim();
  const assignees = [...new Set((Array.isArray(body.assignedTo) ? body.assignedTo : [body.assignedTo]).filter(Boolean).map(String))];
  if (!title) throw new ApiError(400, "Task title is required.");
  if (assignees.length === 0) throw new ApiError(400, "Please choose at least one person for this task.");

  const priority = ["Low", "Medium", "High"].includes(body.priority) ? body.priority : "Medium";
  // The <input type="datetime-local"> the form sends ("2026-09-30T10:00") has
  // no timezone — it's the wall-clock time the user picked. Storing it via
  // `new Date(...).toISOString()` would silently shift it by the server's UTC
  // offset (e.g. 10:00 IST becoming 04:30 in the DATETIME column, which has
  // no timezone of its own). Validate it's a real date, but persist the
  // local string as-is instead of converting it.
  if (body.deadline && isNaN(new Date(body.deadline).getTime())) throw new ApiError(400, "Invalid deadline.");
  const deadline = body.deadline ? String(body.deadline).replace("T", " ").slice(0, 19) : null;

  const tags = Array.isArray(body.tags) ? [...new Set(body.tags.map((t) => String(t).trim()).filter(Boolean))] : [];
  const initialStatus = await getDefaultTaskStatus();

  const guid = randomUUID();
  await mysqlPool.query(
    `INSERT INTO tasks (guid, companyGuid, title, description, remarks, tags, priority, status, deadline, assignedBy, relatedType, relatedId, attachmentFilename)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      guid, user.companyId, title, body.description || null, body.remarks || null,
      tags.length > 0 ? JSON.stringify(tags) : null, priority, initialStatus, deadline,
      user.id, body.relatedType || null, body.relatedId || null, body.attachmentFilename || null,
    ]
  );

  await mysqlPool.query(
    `INSERT INTO task_assignees (taskGuid, userGuid) VALUES ${assignees.map(() => "(?, ?)").join(",")}`,
    assignees.flatMap((a) => [guid, a])
  );

  for (const assignee of assignees) {
    if (assignee === user.id) continue;
    await createNotification(mysqlPool, {
      targetUserGuid: assignee,
      title: "New task assigned",
      message: `${user.username} assigned you: "${title}"${deadline ? ` — due ${deadline.slice(0, 10)}` : ""}`,
      type: "info",
      priority: priority === "High" ? "high" : "low",
      link: "/tasks",
      companyGuid: user.companyId,
    });
  }

  return NextResponse.json({ message: "Task created", guid });
});
