import { mysqlPool } from "@/lib/db";
import { isSuperUser, ApiError } from "@/lib/auth";
import { normalizeRole } from "@/lib/helpers";

const isAdmin = (user) => isSuperUser(normalizeRole(user.role));

// Everyone with the "Daily Tasks" tab keeps their own list; seeing OTHER
// people's lists (the user-wise admin view) is Admin or this edit-flag.
export const canViewAllDailyTasks = (user) => isAdmin(user) || !!user.allow_view_all_daily_tasks;

// Adding/editing the extra table columns and the status list from the Daily
// Tasks page. (allow_assign_tasks holders can already manage statuses from the
// Tasks page — it stays valid here too, since it's the same status list.)
export const canManageDailyTaskSetup = (user) => isAdmin(user) || !!user.allow_manage_daily_task_setup;
export const canManageStatuses = (user) => canManageDailyTaskSetup(user) || !!user.allow_assign_tasks;

export function requireManageSetup(user) {
  if (!canManageDailyTaskSetup(user)) throw new ApiError(403, "You do not have permission to manage Daily Task columns.");
}

export function requireStatusManage(user) {
  if (!canManageStatuses(user)) throw new ApiError(403, "You do not have permission to manage statuses.");
}

// The status list is shared by Tasks and Daily Tasks, so either tab's
// permission is enough to read it.
export function requireTasksOrDailyAccess(user) {
  if (isAdmin(user) || user.permissions?.includes("tasks") || user.permissions?.includes("dailyTasks")) return;
  throw new ApiError(403, "You do not have permission to access tasks.");
}

export const isValidYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(new Date(`${s}T00:00:00`).getTime());

export const todayYmd = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const parseJson = (v, fallback) => {
  if (v === null || v === undefined) return fallback;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

export async function getActiveColumns(companyGuid) {
  const [rows] = await mysqlPool.query(
    "SELECT guid, label, type, options, displayOrder FROM daily_task_columns WHERE companyGuid <=> ? AND isActive = 1 ORDER BY displayOrder ASC, createdAt ASC",
    [companyGuid]
  );
  return rows.map((c) => ({ ...c, options: parseJson(c.options, []) }));
}

export const parseCustomValues = (v) => {
  const o = parseJson(v, {});
  return o && typeof o === "object" && !Array.isArray(o) ? o : {};
};

// Keeps only values for real columns and coerces them to that column's type —
// a bad value is dropped (cleared) rather than stored.
export function sanitizeCustomValues(input, columns) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const col of columns) {
    if (!(col.guid in input)) continue;
    const raw = input[col.guid];
    const v = raw === null || raw === undefined ? "" : String(raw).trim();
    if (v === "") { out[col.guid] = ""; continue; }
    if (col.type === "number") out[col.guid] = isNaN(Number(v)) ? "" : v;
    else if (col.type === "date") out[col.guid] = isValidYmd(v) ? v : "";
    else if (col.type === "dropdown") out[col.guid] = (col.options || []).includes(v) ? v : "";
    else out[col.guid] = v.slice(0, 1000);
  }
  return out;
}
