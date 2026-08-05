import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { ApiError, hasAllCompaniesAccess } from "@/lib/auth";
import { sanitizeUser, safeStr, verifyPassword, hashPassword, signToken, logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { recordLoginAttempt } from "@/lib/rateLimiter";

export const POST = withErrorHandling(async (request) => {
  const { username, password } = await parseJsonBody(request);
  if (!username || !password) throw new ApiError(400, "Username and password are required.");

  // Rate limiting on /api/auth/login is per-IP (see proxy.js) — an admin
  // unblocking someone needs to know *which* IP is theirs when several show
  // up as blocked, so every failed attempt records which username was tried
  // against this IP. Same x-forwarded-for parsing as proxy.js, so this lines
  // up with the IP the rate limiter is actually tracking.
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

  const [rows] = await mysqlPool.query(
    `SELECT u.*, r.permissions as rolePermissions, r.editPermissions as roleEditPermissions
     FROM users u LEFT JOIN roles r ON u.roleId = r.guid AND r.isDeleted = 0
     WHERE (u.username=? OR u.email=?) LIMIT 1`,
    [safeStr(username, ""), safeStr(username, "")]
  );
  if (rows.length === 0) {
    recordLoginAttempt(ip, username);
    throw new ApiError(401, "Invalid credentials");
  }
  const user = rows[0];

  const { ok, legacy } = await verifyPassword(password, user.password);
  if (!ok) {
    recordLoginAttempt(ip, username);
    throw new ApiError(401, "Invalid credentials");
  }

  // Admin (and allCompaniesAccess-flagged users) see every active company,
  // present and future, without needing a row per company in user_companies.
  const [userCompanies] = hasAllCompaniesAccess(user)
    ? await mysqlPool.query(`SELECT guid, name, allowedPlatforms, logoFilename FROM companies WHERE isActive = 1`)
    : await mysqlPool.query(
        `SELECT c.guid, c.name, c.allowedPlatforms, c.logoFilename
         FROM user_companies uc
         JOIN companies c ON uc.companyGuid = c.guid
         WHERE uc.userGuid = ? AND c.isActive = 1`,
        [user.userid]
      );

  if (userCompanies.length === 0) {
    throw new ApiError(403, "You do not have access to any active companies.");
  }

  if (legacy) {
    const newHash = await hashPassword(password);
    await mysqlPool.query("UPDATE users SET password=? WHERE userid=?", [newHash, user.userid]);
  }

  await mysqlPool.query("UPDATE users SET forceLogoutAt = NULL WHERE userid = ?", [user.userid]);

  if (userCompanies.length === 1) {
    user.companyId = userCompanies[0].guid;
    const token = signToken(user);
    
    await logUserActivity(
      mysqlPool,
      { id: user.userid, username: user.username, role: user.role },
      "Login",
      [{ field: "session", newValue: "Started", companyGuid: user.companyId }],
      request.headers.get("x-forwarded-for") || null
    );
    
    const sanitized = sanitizeUser(user);
    sanitized.companyId = user.companyId;
    return NextResponse.json({ token, user: sanitized, companies: userCompanies });
  }

  // Multiple companies: issue a token scoped to the default (or first) company so the
  // user is fully logged in immediately; the frontend still shows a picker/switcher,
  // and switching later goes through /api/auth/switch-company as normal.
  const [defaultRow] = await mysqlPool.query(
    "SELECT companyGuid FROM user_companies WHERE userGuid = ? AND isDefault = 1 LIMIT 1",
    [user.userid]
  );
  const chosenCompanyGuid = defaultRow[0]?.companyGuid || userCompanies[0].guid;
  user.companyId = chosenCompanyGuid;
  const token = signToken(user);

  await logUserActivity(
    mysqlPool,
    { id: user.userid, username: user.username, role: user.role },
    "Login",
    [{ field: "session", newValue: "Started", companyGuid: user.companyId }],
    request.headers.get("x-forwarded-for") || null
  );

  const sanitized = sanitizeUser(user);
  sanitized.companyId = user.companyId;
  return NextResponse.json({ token, user: sanitized, companies: userCompanies });
});
