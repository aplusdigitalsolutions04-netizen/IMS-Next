import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeMasterWrite, authorizeMasterDelete, isSuperUser, invalidateUserCache, resolveRole, ApiError } from "@/lib/auth";
import { sanitizeUser, safeStr, hashPassword } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "users", { isCreate: false, denyMessage: "You do not have permission to edit users." });
  const { id } = await params;

  const {
    username, password, roleId, fullName, email, phone,
    companyIds, allCompaniesAccess,
  } = await parseJsonBody(request);

  const [existing] = await mysqlPool.query("SELECT * FROM users WHERE userid=?", [id]);
  if (!existing.length) throw new ApiError(404, "User not found.");
  const cur = existing[0];

  const nextUsername = safeStr(username, cur.username);
  const nextPassword = password && password.trim() !== "" ? await hashPassword(password) : cur.password;

  let nextRole = cur.role;
  let nextRoleId = cur.roleId;
  if (roleId !== undefined) {
    const resolved = await resolveRole(roleId);
    if (!resolved.role) throw new ApiError(400, "Selected role could not be found.");
    nextRole = resolved.role;
    nextRoleId = resolved.roleId;
  }

  const [dup] = await mysqlPool.query("SELECT userid FROM users WHERE username=? AND userid<>?", [nextUsername, id]);
  if (dup.length > 0) throw new ApiError(400, "Username already exists.");
  if (String(id) === String(user.id) && !isSuperUser(nextRole) && isSuperUser(cur.role)) {
    throw new ApiError(400, "You cannot remove your own Admin access.");
  }

  await mysqlPool.query(
    `UPDATE users SET username=?, password=?, role=?, roleId=?, fullName=?, email=?, phone=?,
       allCompaniesAccess=?, updatedAt=NOW()
     WHERE userid=?`,
    [nextUsername, nextPassword, nextRole, nextRoleId, safeStr(fullName, cur.fullName), safeStr(email, cur.email),
      safeStr(phone, cur.phone),
      allCompaniesAccess !== undefined ? (allCompaniesAccess ? 1 : 0) : cur.allCompaniesAccess, id]
  );
  if (companyIds && Array.isArray(companyIds)) {
    await mysqlPool.query("DELETE FROM user_companies WHERE userGuid=?", [id]);
    for (const cid of companyIds) {
      await mysqlPool.query("INSERT INTO user_companies (userGuid, companyGuid, isDefault) VALUES (?, ?, ?)", [id, cid, cid === companyIds[0] ? 1 : 0]);
    }
  }

  invalidateUserCache(id);
  const [updated] = await mysqlPool.query("SELECT * FROM users WHERE userid=?", [id]);
  return NextResponse.json({ message: "User updated successfully.", user: sanitizeUser(updated[0]) });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeMasterDelete(user, "users", "You do not have permission to delete users.");
  const { id } = await params;

  if (String(id) === String(user.id)) throw new ApiError(400, "You cannot delete your own account.");

  const [target] = await mysqlPool.query("SELECT * FROM users WHERE userid=?", [id]);
  if (!target.length) throw new ApiError(404, "User not found.");

  // Admin accounts are never removable, by anyone, regardless of how many
  // other Admins exist — protects against accidentally locking the company
  // out of its own elevated access.
  if (isSuperUser(target[0].role)) {
    throw new ApiError(400, "Admin accounts cannot be deleted.");
  }

  await mysqlPool.query("DELETE FROM users WHERE userid=?", [id]);
  return NextResponse.json({ message: "User deleted successfully." });
});
