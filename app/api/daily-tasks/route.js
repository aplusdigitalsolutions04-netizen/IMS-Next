import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission, hasAllCompaniesAccess, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureDailyTasksTable } from "@/lib/dailyTasksMigration";
import { getTaskStatuses, getDefaultTaskStatus } from "@/lib/tasksMigration";
import {
  canViewAllDailyTasks, canManageStatuses, canManageDailyTaskSetup, isValidYmd, todayYmd,
  getActiveColumns, parseCustomValues, sanitizeCustomValues,
} from "@/lib/dailyTasksHelpers";

const SELECT_COLS = `d.guid, d.userGuid, DATE_FORMAT(d.taskDate, '%Y-%m-%d') AS taskDate, d.task, d.status, d.customValues,
            d.screenshotFilename, d.screenshotAt, d.createdAt, d.updatedAt`;
const withValues = (r) => ({ ...r, customValues: parseCustomValues(r.customValues) });

// Status uses the same admin-editable master (with colors) as Tasks, so the
// list a user picks from is returned here too — a Daily Tasks user doesn't
// necessarily have the separate "Tasks" permission that /api/tasks/statuses needs.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "dailyTasks", "You do not have permission to access daily tasks.");
  await ensureDailyTasksTable();

  const sp = new URL(request.url).searchParams;
  const from = isValidYmd(sp.get("from")) ? sp.get("from") : todayYmd();
  const to = isValidYmd(sp.get("to")) ? sp.get("to") : from;
  const viewAll = canViewAllDailyTasks(user);

  // A normal user only ever gets their own rows, whatever userId they pass.
  let userFilter = user.id;
  if (viewAll) userFilter = sp.get("userId") && sp.get("userId") !== "all" ? sp.get("userId") : null;

  const params = [user.companyId, from, to];
  let where = "d.isDeleted = 0 AND d.companyGuid <=> ? AND d.taskDate BETWEEN ? AND ?";
  if (userFilter) { where += " AND d.userGuid = ?"; params.push(userFilter); }

  const [rows] = await mysqlPool.query(
    `SELECT ${SELECT_COLS}, COALESCE(NULLIF(u.fullName, ''), u.username) AS userName
     FROM daily_tasks d LEFT JOIN users u ON u.userid = d.userGuid
     WHERE ${where}
     ORDER BY userName ASC, d.taskDate DESC, d.createdAt ASC`,
    params
  );

  let users = [];
  if (viewAll) {
    [users] = hasAllCompaniesAccess(user)
      ? await mysqlPool.query("SELECT userid, COALESCE(NULLIF(fullName, ''), username) AS name FROM users ORDER BY name ASC")
      : await mysqlPool.query(
          `SELECT DISTINCT u.userid, COALESCE(NULLIF(u.fullName, ''), u.username) AS name FROM users u
           LEFT JOIN user_companies uc ON uc.userGuid = u.userid
           WHERE u.allCompaniesAccess = 1 OR uc.companyGuid = ? ORDER BY name ASC`,
          [user.companyId]
        );
  }

  const statuses = (await getTaskStatuses()).filter((s) => s.isActive).map(({ guid, value, label, color, isTerminal, isDefault }) => ({ guid, value, label, color, isTerminal, isDefault }));
  const columns = await getActiveColumns(user.companyId);
  return NextResponse.json({
    data: rows.map(withValues), statuses, columns, users, viewAll, from, to, currentUserId: user.id,
    canManageSetup: canManageDailyTaskSetup(user), canManageStatuses: canManageStatuses(user),
  });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "dailyTasks", "You do not have permission to access daily tasks.");
  await ensureDailyTasksTable();

  const body = await parseJsonBody(request);
  const task = String(body.task || "").trim();
  if (!task) throw new ApiError(400, "Task is required.");
  const taskDate = isValidYmd(body.taskDate) ? body.taskDate : todayYmd();

  const active = (await getTaskStatuses()).filter((s) => s.isActive);
  const status = body.status && active.some((s) => s.value === body.status) ? body.status : await getDefaultTaskStatus();
  const customValues = sanitizeCustomValues(body.customValues, await getActiveColumns(user.companyId));

  const guid = randomUUID();
  await mysqlPool.query(
    "INSERT INTO daily_tasks (guid, companyGuid, userGuid, taskDate, task, status, customValues) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [guid, user.companyId, user.id, taskDate, task, status, JSON.stringify(customValues)]
  );
  const [[row]] = await mysqlPool.query(`SELECT ${SELECT_COLS} FROM daily_tasks d WHERE d.guid = ?`, [guid]);
  return NextResponse.json({ data: withValues(row) }, { status: 201 });
});
