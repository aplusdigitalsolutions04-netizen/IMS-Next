import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission, isSuperUser, ApiError } from "@/lib/auth";
import { normalizeRole } from "@/lib/helpers";
import { withErrorHandling } from "@/lib/apiResponse";
import { ensureDailyTasksTable } from "@/lib/dailyTasksMigration";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/upload";
import { stampImage } from "@/lib/stampImage";

export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "dailyTasks", "You do not have permission to access daily tasks.");
  await ensureDailyTasksTable();
  const { id } = await params;

  const [[row]] = await mysqlPool.query(
    "SELECT * FROM daily_tasks WHERE guid = ? AND isDeleted = 0 AND companyGuid <=> ?",
    [id, user.companyId]
  );
  if (!row) throw new ApiError(404, "Task not found.");
  if (row.userGuid !== user.id && !isSuperUser(normalizeRole(user.role))) {
    throw new ApiError(403, "You can only add screenshots to your own tasks.");
  }

  const file = (await request.formData()).get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No screenshot uploaded.");
  const raw = Buffer.from(await file.arrayBuffer());
  if (raw.length > 15 * 1024 * 1024) throw new ApiError(413, "Screenshot too large (max 15 MB).");

  const when = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const name = user.fullName || user.username;
  let stamped;
  try {
    stamped = await stampImage(raw, `${name}  •  ${when}`);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("[daily-tasks] stamping the screenshot failed:", err);
    throw new ApiError(400, "That file isn't a valid image.");
  }

  let saved;
  try {
    saved = await saveUploadedFile(new File([stamped], "screenshot.png", { type: "image/png" }), { prefix: "dailytask", folder: "dailyTaskScreenshot" });
  } catch (err) {
    console.error("[daily-tasks] screenshot upload failed:", err);
    throw new ApiError(500, `Could not save the screenshot (${err?.message || "storage error"}). Check the Google Drive connection in Settings.`);
  }
  if (row.screenshotFilename) await deleteUploadedFile(row.screenshotFilename);
  await mysqlPool.query("UPDATE daily_tasks SET screenshotFilename = ?, screenshotAt = NOW() WHERE guid = ?", [saved.filename, id]);

  const [[updated]] = await mysqlPool.query("SELECT screenshotFilename, screenshotAt FROM daily_tasks WHERE guid = ?", [id]);
  return NextResponse.json({ data: updated });
});
