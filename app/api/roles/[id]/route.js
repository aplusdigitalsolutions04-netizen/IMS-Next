import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeMasterWrite, authorizeMasterDelete, invalidateUserCache, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "roles", { isCreate: false, denyMessage: "You do not have permission to edit roles." });
  const { id } = await params;

  const { name, permissions, editPermissions } = await parseJsonBody(request);

  const [existing] = await mysqlPool.query("SELECT name FROM roles WHERE guid=? AND isDeleted=0", [id]);
  if (!existing.length) throw new ApiError(404, "Role not found.");

  const trimmedName = String(name || "").trim();
  if (!trimmedName) throw new ApiError(400, "Role name is required.");
  if (trimmedName.toLowerCase() === "admin") {
    throw new ApiError(400, "\"Admin\" is reserved and cannot be used as a role name.");
  }
  const [dup] = await mysqlPool.query(
    "SELECT guid FROM roles WHERE LOWER(name)=LOWER(?) AND guid<>? AND isDeleted=0",
    [trimmedName, id]
  );
  if (dup.length > 0) throw new ApiError(400, "A role with this name already exists.");

  const finalPermissions = Array.isArray(permissions) ? permissions : null;
  const finalEditPermissions = Array.isArray(editPermissions) ? editPermissions : null;

  const [result] = await mysqlPool.query(
    `UPDATE roles SET name=?, baseTier=?,
       permissions = COALESCE(?, permissions),
       editPermissions = COALESCE(?, editPermissions)
     WHERE guid=? AND isDeleted=0`,
    [trimmedName, trimmedName,
      finalPermissions ? JSON.stringify(finalPermissions) : null,
      finalEditPermissions ? JSON.stringify(finalEditPermissions) : null,
      id]
  );
  if (result.affectedRows === 0) throw new ApiError(404, "Role not found.");

  // Users reference this role by roleId, not by name, so a rename doesn't
  // need to touch the users table — but their cached permissions/name need
  // invalidating so the next request picks up the change.
  const [affectedUsers] = await mysqlPool.query("SELECT userid FROM users WHERE roleId=?", [id]);
  affectedUsers.forEach((u) => invalidateUserCache(u.userid));

  return NextResponse.json({ message: "Role updated successfully." });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeMasterDelete(user, "roles", "You do not have permission to delete roles.");
  const { id } = await params;

  const [existing] = await mysqlPool.query("SELECT guid FROM roles WHERE guid=? AND isDeleted=0", [id]);
  if (!existing.length) throw new ApiError(404, "Role not found.");

  const [inUse] = await mysqlPool.query("SELECT COUNT(*) as total FROM users WHERE roleId=?", [id]);
  if (Number(inUse[0]?.total || 0) > 0) {
    throw new ApiError(400, "Reassign every user off this role before deleting it.");
  }

  const [result] = await mysqlPool.query("UPDATE roles SET isDeleted=1 WHERE guid=?", [id]);
  if (result.affectedRows === 0) throw new ApiError(404, "Role not found.");

  return NextResponse.json({ message: "Role deleted successfully." });
});
