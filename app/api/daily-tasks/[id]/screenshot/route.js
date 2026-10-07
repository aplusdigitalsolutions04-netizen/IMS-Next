import { NextResponse } from "next/server";
import sharp from "sharp";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission, isSuperUser, ApiError } from "@/lib/auth";
import { normalizeRole } from "@/lib/helpers";
import { withErrorHandling } from "@/lib/apiResponse";
import { ensureDailyTasksTable } from "@/lib/dailyTasksMigration";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/upload";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The user's name and the date/time are stamped onto the image HERE, on the
// server, using the server's clock and the logged-in account — not by the
// browser — so the stamp can't be faked by whoever took the screenshot.
async function stampImage(buffer, label) {
  const img = sharp(buffer);
  const { width = 1280, height = 720 } = await img.metadata();
  const barH = Math.max(34, Math.round(height * 0.045));
  const fontSize = Math.round(barH * 0.5);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${barH}">
    <rect width="100%" height="100%" fill="#0f172a"/>
    <text x="14" y="${Math.round(barH * 0.68)}" font-size="${fontSize}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" fill="#ffffff">${esc(label)}</text>
  </svg>`;
  // The stamp goes in a NEW strip added below the picture — drawing it over
  // the picture hid the last row of the table.
  const extended = await img.extend({ bottom: barH, background: "#0f172a" }).png().toBuffer();
  return sharp(extended).composite([{ input: Buffer.from(svg), gravity: "south" }]).png().toBuffer();
}

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
    throw new ApiError(400, "That file isn't a valid image.");
  }

  const saved = await saveUploadedFile(new File([stamped], "screenshot.png", { type: "image/png" }), { prefix: "dailytask", folder: "dailyTaskScreenshot" });
  if (row.screenshotFilename) await deleteUploadedFile(row.screenshotFilename);
  await mysqlPool.query("UPDATE daily_tasks SET screenshotFilename = ?, screenshotAt = NOW() WHERE guid = ?", [saved.filename, id]);

  const [[updated]] = await mysqlPool.query("SELECT screenshotFilename, screenshotAt FROM daily_tasks WHERE guid = ?", [id]);
  return NextResponse.json({ data: updated });
});
