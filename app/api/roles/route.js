import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeMasterRead, authorizeMasterWrite, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// mysql2 auto-parses a JSON-typed column into a real array/object — but if
// this column was ever created (or migrated) as TEXT/VARCHAR instead, it
// comes back as a raw JSON *string*, which silently broke the "already
// granted" highlight in Manage Roles: Roles.jsx's Array.isArray(role.permissions)
// check failed on a string, so the editor reopened with everything unchecked
// even though the permissions were saved correctly. Normalizing here makes
// the response correct regardless of the underlying column type.
const parseJsonArray = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeMasterRead(user, "roles", "Manage Roles access required.");

  // Every role the admin has created — Admin itself never appears here (not
  // a DB row, hardcoded full-access everywhere).
  const [rows] = await mysqlPool.query(
    "SELECT guid, name, description, permissions, editPermissions FROM roles WHERE isDeleted=0 ORDER BY name ASC"
  );
  const normalized = rows.map((r) => ({
    ...r,
    permissions: parseJsonArray(r.permissions),
    editPermissions: parseJsonArray(r.editPermissions),
  }));
  return NextResponse.json(normalized);
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "roles", { isCreate: true, denyMessage: "You do not have permission to add roles." });

  const { name } = await parseJsonBody(request);
  const trimmedName = String(name || "").trim();
  if (!trimmedName) throw new ApiError(400, "Role name is required.");
  if (trimmedName.toLowerCase() === "admin") {
    throw new ApiError(400, "\"Admin\" is reserved and cannot be used as a role name.");
  }

  const [dup] = await mysqlPool.query(
    "SELECT guid FROM roles WHERE LOWER(name)=LOWER(?) AND isDeleted=0",
    [trimmedName]
  );
  if (dup.length > 0) throw new ApiError(400, "A role with this name already exists.");

  const guid = randomUUID();
  await mysqlPool.query(
    "INSERT INTO roles (guid, name, baseTier, isBaseTier, isDeleted) VALUES (?, ?, ?, 0, 0)",
    [guid, trimmedName, trimmedName]
  );
  return NextResponse.json({ message: "Role created successfully.", guid });
});
