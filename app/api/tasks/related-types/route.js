import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requirePermission, requireEditPermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureTaskRelatedTypeSeeded, TASK_RELATED_TYPE_CODE } from "@/lib/tasksMigration";

async function getMasterId() {
  await ensureTaskRelatedTypeSeeded();
  const [[master]] = await mysqlPool.query("SELECT id FROM dropdown_master WHERE dropdown_code = ?", [TASK_RELATED_TYPE_CODE]);
  return master.id;
}

// The "Related To" list on a task (Order / Contract / Stock In / ...) is a
// plain admin-managed dropdown (dropdown_master/dropdown_option, same tables
// Care Pack and Delivery Partner use) — anyone who can assign tasks can add
// a new type inline from the New Task form, rather than it being a fixed,
// hardcoded list only a developer could extend.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requirePermission(user, "tasks", "You do not have permission to access tasks.");

  const masterId = await getMasterId();
  const [rows] = await mysqlPool.query(
    "SELECT option_label AS label, option_value AS value FROM dropdown_option WHERE dropdown_id = ? AND is_active = 1 ORDER BY display_order ASC",
    [masterId]
  );
  return NextResponse.json({ data: rows });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requirePermission(user, "tasks", "You do not have permission to access tasks.");
  requireEditPermission(user, "allow_assign_tasks");

  const { name } = await parseJsonBody(request);
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new ApiError(400, "Type name is required.");

  const masterId = await getMasterId();
  const [existing] = await mysqlPool.query(
    "SELECT guid FROM dropdown_option WHERE dropdown_id = ? AND LOWER(option_label) = LOWER(?)",
    [masterId, trimmed]
  );
  if (existing.length) return NextResponse.json({ message: "Already exists", value: trimmed });

  const [[{ maxSort }]] = await mysqlPool.query(
    "SELECT COALESCE(MAX(display_order), 0) as maxSort FROM dropdown_option WHERE dropdown_id = ?",
    [masterId]
  );
  await mysqlPool.query(
    "INSERT INTO dropdown_option (guid, dropdown_id, option_label, option_value, display_order, is_active) VALUES (?, ?, ?, ?, ?, 1)",
    [randomUUID(), masterId, trimmed, trimmed, maxSort + 1]
  );

  return NextResponse.json({ message: "Type added", value: trimmed }, { status: 201 });
});
