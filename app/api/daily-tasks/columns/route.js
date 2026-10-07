import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureDailyTasksTable } from "@/lib/dailyTasksMigration";
import { requireManageSetup } from "@/lib/dailyTasksHelpers";

const TYPES = ["text", "number", "date", "dropdown"]; // not exported: Next route files may only export HTTP handlers
const cleanOptions = (o) => [...new Set((Array.isArray(o) ? o : []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 50);

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "dailyTasks", "You do not have permission to access daily tasks.");
  requireManageSetup(user);
  await ensureDailyTasksTable();

  const body = await parseJsonBody(request);
  const label = String(body.label || "").trim();
  if (!label) throw new ApiError(400, "Column name is required.");
  const type = TYPES.includes(body.type) ? body.type : "text";
  const options = type === "dropdown" ? cleanOptions(body.options) : null;
  if (type === "dropdown" && options.length === 0) throw new ApiError(400, "Add at least one option for a dropdown column.");

  const [dupe] = await mysqlPool.query(
    "SELECT guid FROM daily_task_columns WHERE companyGuid <=> ? AND LOWER(label) = LOWER(?) AND isActive = 1", [user.companyId, label]
  );
  if (dupe.length) throw new ApiError(400, `A column named "${label}" already exists.`);

  const [[{ maxOrder }]] = await mysqlPool.query(
    "SELECT COALESCE(MAX(displayOrder), 0) AS maxOrder FROM daily_task_columns WHERE companyGuid <=> ?", [user.companyId]
  );
  const guid = randomUUID();
  await mysqlPool.query(
    "INSERT INTO daily_task_columns (guid, companyGuid, label, type, options, displayOrder) VALUES (?, ?, ?, ?, ?, ?)",
    [guid, user.companyId, label, type, options ? JSON.stringify(options) : null, maxOrder + 1]
  );
  return NextResponse.json({ message: "Column added", guid }, { status: 201 });
});
