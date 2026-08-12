import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, invalidateUserCache, ApiError } from "@/lib/auth";
import { sanitizeUser } from "@/lib/helpers";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/upload";
import { withErrorHandling } from "@/lib/apiResponse";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

async function fetchSanitizedUser(userId) {
  const [rows] = await mysqlPool.query(
    `SELECT u.*, r.permissions as rolePermissions, r.editPermissions as roleEditPermissions
     FROM users u LEFT JOIN roles r ON u.roleId = r.guid AND r.isDeleted = 0
     WHERE u.userid=?`,
    [userId]
  );
  return rows.length ? sanitizeUser(rows[0]) : null;
}

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");
  if (!ALLOWED_TYPES.has(file.type)) throw new ApiError(400, "Only JPG, PNG, WEBP, or GIF images are allowed.");
  if (file.size > MAX_SIZE_BYTES) throw new ApiError(400, "Image must be smaller than 5MB.");

  const [existing] = await mysqlPool.query("SELECT profilePhoto FROM users WHERE userid=?", [user.id]);
  const oldPhoto = existing[0]?.profilePhoto;

  const saved = await saveUploadedFile(file, { prefix: `profile-${user.id}`, folder: "profilePhoto" });
  await mysqlPool.query("UPDATE users SET profilePhoto=? WHERE userid=?", [saved.filename, user.id]);

  if (oldPhoto) deleteUploadedFile(oldPhoto);

  invalidateUserCache(user.id);
  const updated = await fetchSanitizedUser(user.id);
  return NextResponse.json({ message: "Profile photo updated.", user: updated });
});

export const DELETE = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);

  const [existing] = await mysqlPool.query("SELECT profilePhoto FROM users WHERE userid=?", [user.id]);
  const oldPhoto = existing[0]?.profilePhoto;
  if (!oldPhoto) return NextResponse.json({ message: "No profile photo to remove." });

  await mysqlPool.query("UPDATE users SET profilePhoto=NULL WHERE userid=?", [user.id]);
  deleteUploadedFile(oldPhoto);

  invalidateUserCache(user.id);
  const updated = await fetchSanitizedUser(user.id);
  return NextResponse.json({ message: "Profile photo removed.", user: updated });
});
