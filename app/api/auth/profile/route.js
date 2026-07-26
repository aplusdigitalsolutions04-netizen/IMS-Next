import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { sanitizeUser, safeStr, logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);

  const [rows] = await mysqlPool.query(
    `SELECT u.*, r.permissions as rolePermissions, r.editPermissions as roleEditPermissions
     FROM users u LEFT JOIN roles r ON u.roleId = r.guid AND r.isDeleted = 0
     WHERE u.userid=?`,
    [user.id]
  );
  if (!rows.length) throw new ApiError(404, "User not found.");
  return NextResponse.json(sanitizeUser(rows[0]));
});

export const PUT = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);

  const { fullName, email, phone, notificationsEnabled } = await parseJsonBody(request);
  const [existing] = await mysqlPool.query("SELECT * FROM users WHERE userid=?", [user.id]);
  if (!existing.length) throw new ApiError(404, "User not found.");
  const cur = existing[0];

  const updates = {};
  const changes = [];

  const nfull = safeStr(fullName);
  const nemail = safeStr(email);
  const nphone = safeStr(phone);

  if (fullName !== undefined && nfull !== cur.fullName) { updates.fullName = nfull; changes.push({ field: "fullName", oldValue: cur.fullName, newValue: nfull }); }
  if (email !== undefined && nemail !== cur.email) { updates.email = nemail; changes.push({ field: "email", oldValue: cur.email, newValue: nemail }); }
  if (phone !== undefined && nphone !== cur.phone) { updates.phone = nphone; changes.push({ field: "phone", oldValue: cur.phone, newValue: nphone }); }

  const nNotif = notificationsEnabled === undefined ? undefined : (notificationsEnabled ? 1 : 0);
  if (nNotif !== undefined && nNotif !== cur.notificationsEnabled) {
    updates.notificationsEnabled = nNotif;
    changes.push({ field: "notificationsEnabled", oldValue: cur.notificationsEnabled, newValue: nNotif });
  }

  if (changes.length > 0) {
    await mysqlPool.query(
      "UPDATE users SET fullName=?, email=?, phone=?, notificationsEnabled=? WHERE userid=?",
      [updates.fullName ?? cur.fullName, updates.email ?? cur.email, updates.phone ?? cur.phone, updates.notificationsEnabled ?? cur.notificationsEnabled, user.id]
    );
    await logUserActivity(mysqlPool, user, "Profile Update", changes, request.headers.get("x-forwarded-for") || null);
  }

  const [updated] = await mysqlPool.query(
    `SELECT u.*, r.permissions as rolePermissions, r.editPermissions as roleEditPermissions
     FROM users u LEFT JOIN roles r ON u.roleId = r.guid AND r.isDeleted = 0
     WHERE u.userid=?`,
    [user.id]
  );
  return NextResponse.json({ message: "Profile updated successfully.", user: sanitizeUser(updated[0]) });
});
