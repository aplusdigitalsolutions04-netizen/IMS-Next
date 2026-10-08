import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission, isSuperUser, ApiError } from "@/lib/auth";
import { normalizeRole } from "@/lib/helpers";
import { withErrorHandling } from "@/lib/apiResponse";
import { ensureDailyTasksTable } from "@/lib/dailyTasksMigration";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/upload";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const shortReason = (err) => String(err?.message || err || "unknown").replace(/\s+/g, " ").trim().slice(0, 220);

// Runs `npm install sharp` inside the app folder. Tries plain `npm` first, then the npm that ships next to the
// running node binary (hosts often have npm off the PATH of the app process). Resolves with a short note on
// success; rejects with the last npm error text (kept short so it can be shown to the admin).
function installSharp() {
  const path = require("path");
  const fs = require("fs");
  const nodeDir = path.dirname(process.execPath);
  const npmCli = [
    path.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ].find((f) => fs.existsSync(f));
  const attempts = [
    ["npm", ["install", "sharp@0.35.0", "--no-save", "--no-audit", "--no-fund", "--force"], true],
    ...(npmCli ? [[process.execPath, [npmCli, "install", "sharp@0.35.0", "--no-save", "--no-audit", "--no-fund", "--force"], false]] : []),
  ];
  return attempts.reduce(
    (chain, [cmd, args, shell]) =>
      chain.catch(
        () =>
          new Promise((resolve, reject) =>
            execFile(cmd, args, { shell, cwd: process.cwd(), timeout: 240000, maxBuffer: 4 * 1024 * 1024 }, (e, stdout, stderr) => {
              if (e) return reject(new Error(shortReason(String(stderr || "").trim().split("
").slice(-3).join(" ") || e.message)));
              resolve("npm install finished");
            })
          )
      ),
    Promise.reject(new Error("not started"))
  );
}

// The user's name and the date/time are stamped onto the image HERE, on the
// server, using the server's clock and the logged-in account — not by the
// browser — so the stamp can't be faked by whoever took the screenshot.
async function stampImage(buffer, label) {
  // Loaded here (not at the top of the file) so a server where the native `sharp` binary is missing returns a
  // readable message instead of a bare "Internal Server Error" for every upload.
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch (err) {
    console.error("[daily-tasks] sharp could not be loaded:", err);
    const loadReason = shortReason(err);
    // No SSH on this host, so try to install it ourselves once, then retry.
    let installReason = "";
    try {
      installReason = await installSharp();
      sharp = (await import("sharp")).default;
    } catch (err2) {
      console.error("[daily-tasks] automatic sharp install failed:", err2);
      throw new ApiError(
        500,
        `Image processing is not available on the server (the 'sharp' package is missing or not built for this server). ` +
        `Load error: ${loadReason}. Auto-install: ${installReason || shortReason(err2)}. ` +
        `Fix: run "npm install sharp@0.35.0" on the server (or ask the host to), then restart the app.`
      );
    }
  }
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
    if (err instanceof ApiError) throw err; // e.g. sharp missing on the server — say so
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
