import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureDailyTasksTable } from "@/lib/dailyTasksMigration";
import { requireManageSetup } from "@/lib/dailyTasksHelpers";

async function loadColumn(guid, user) {
  const [[col]] = await mysqlPool.query(
    "SELECT * FROM daily_task_columns WHERE guid = ? AND companyGuid <=> ?", [guid, user.companyId]
  );
  if (!col) throw new ApiError(404, "Column not found.");
  return col;
}

// Rename / change a dropdown's options / hide. The column's type is fixed once
// created (existing values were entered as that type).
export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "dailyTasks", "You do not have permission to access daily tasks.");
  requireManageSetup(user);
  await ensureDailyTasksTable();
  const { guid } = await params;
  const col = await loadColumn(guid, user);
  const body = await parseJsonBody(request);

  if (body.label !== undefined) {
    const label = String(body.label).trim();
    if (!label) throw new ApiError(400, "Column name is required.");
    const [dupe] = await mysqlPool.query(
      "SELECT guid FROM daily_task_columns WHERE companyGuid <=> ? AND LOWER(label) = LOWER(?) AND isActive = 1 AND guid <> ?", [user.companyId, label, guid]
    );
    if (dupe.length) throw new ApiError(400, `A column named "${label}" already exists.`);
    await mysqlPool.query("UPDATE daily_task_columns SET label = ? WHERE guid = ?", [label, guid]);
  }
  if (body.options !== undefined && col.type === "dropdown") {
    const options = [...new Set((Array.isArray(body.options) ? body.options : []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 50);
    if (options.length === 0) throw new ApiError(400, "A dropdown needs at least one option.");
    await mysqlPool.query("UPDATE daily_task_columns SET options = ? WHERE guid = ?", [JSON.stringify(options), guid]);
  }
  if (body.isActive !== undefined) {
    await mysqlPool.query("UPDATE daily_task_columns SET isActive = ? WHERE guid = ?", [body.isActive ? 1 : 0, guid]);
  }
  return NextResponse.json({ message: "Column updated" });
});

// Delete removes the column AND its values from every row. Use Hide (isActive
// false) instead to keep the data.
export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "dailyTasks", "You do not have permission to access daily tasks.");
  requireManageSetup(user);
  await ensureDailyTasksTable();
  const { guid } = await params;
  await loadColumn(guid, user);

  await mysqlPool.query(
    "UPDATE daily_tasks SET customValues = JSON_REMOVE(customValues, ?) WHERE companyGuid <=> ? AND customValues IS NOT NULL",
    [`$."${guid}"`, user.companyId]
  );
  await mysqlPool.query("DELETE FROM daily_task_columns WHERE guid = ?", [guid]);
  return NextResponse.json({ message: "Column deleted" });
});
