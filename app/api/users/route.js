import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, authorizeMasterWrite, resolveRole, ApiError } from "@/lib/auth";
import { sanitizeUser, safeStr, hashPassword } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Mounted behind `requirePermission("users", ...)` in Backend4/index.js.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "users", "User management access required.");

  // Same page/limit convention as GetVendorList and friends. Explicit column
  // list (no `password` hash pulled into memory for a response that never
  // returns it anyway) — includes the per-user allow_edit_* columns
  // sanitizeUser() falls back to for any user whose roleId isn't set yet,
  // dropping them would silently break that fallback.
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page")) || 1;
  const limit = parseInt(searchParams.get("limit")) || 100;
  const offset = (page - 1) * limit;

  const [[{ total }]] = await mysqlPool.query("SELECT COUNT(*) as total FROM users");

  const [rows] = await mysqlPool.query(
    `SELECT userid, username, role, roleId, fullName, email, phone, profilePhoto,
            permissions, allCompaniesAccess, notificationsEnabled, createdAt, updatedAt,
            allow_edit_models, allow_edit_serials, allow_edit_godown, allow_create_order,
            allow_edit_order_processing, allow_edit_billing, allow_edit_dispatch, allow_edit_installations,
            allow_edit_damaged, allow_edit_returns, allow_edit_fbf_fba, allow_edit_warranty, allow_edit_inventory
     FROM users ORDER BY createdAt DESC, userid DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const [companyLinks] = rows.length
    ? await mysqlPool.query(
        `SELECT userGuid, companyGuid FROM user_companies WHERE userGuid IN (?)`,
        [rows.map((r) => r.userid)]
      )
    : [[]];
  const companyIdsByUser = {};
  companyLinks.forEach((l) => {
    (companyIdsByUser[l.userGuid] ||= []).push(l.companyGuid);
  });

  return NextResponse.json({
    data: rows.map((r) => ({ ...sanitizeUser(r), companyIds: companyIdsByUser[r.userid] || [] })),
    total,
    page,
    limit,
  });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "users", { isCreate: true, denyMessage: "You do not have permission to add users." });

  const {
    username, password, roleId, fullName, email, phone,
    companyIds, allCompaniesAccess,
  } = await parseJsonBody(request);

  const safeUsername = safeStr(username, "");
  if (!safeUsername || !password) throw new ApiError(400, "Username and password are required.");
  if (!roleId) throw new ApiError(400, "A role is required — pick one from Manage Roles, or Admin.");
  if (!allCompaniesAccess && (!Array.isArray(companyIds) || companyIds.length === 0)) {
    throw new ApiError(400, "Assign at least one company to this user, or they won't be able to log in.");
  }

  const [check] = await mysqlPool.query("SELECT userid FROM users WHERE username=?", [safeUsername]);
  if (check.length > 0) throw new ApiError(400, "Username already exists.");

  const { role, roleId: resolvedRoleId } = await resolveRole(roleId);
  if (!role) throw new ApiError(400, "Selected role could not be found.");

  const hashed = await hashPassword(password);

  await mysqlPool.query(
    `INSERT INTO users (userid, username, password, role, roleId, fullName, email, phone, permissions,
       allCompaniesAccess, createdAt, updatedAt)
     VALUES (UUID(),?,?,?,?,?,?,?,'[]',?,NOW(),NOW())`,
    [safeUsername, hashed, role, resolvedRoleId, safeStr(fullName), safeStr(email), safeStr(phone),
      allCompaniesAccess ? 1 : 0]
  );

  const [newUser] = await mysqlPool.query("SELECT * FROM users WHERE username=?", [safeUsername]);
  if (Array.isArray(companyIds) && companyIds.length > 0) {
    for (const cid of companyIds) {
      await mysqlPool.query("INSERT INTO user_companies (userGuid, companyGuid, isDefault) VALUES (?, ?, ?)", [newUser[0].userid, cid, cid === companyIds[0] ? 1 : 0]);
    }
  }

  return NextResponse.json({ message: "User created successfully.", user: sanitizeUser(newUser[0]) }, { status: 201 });
});
