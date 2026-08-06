import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { ApiError } from "@/lib/auth";
import { sanitizeUser, safeStr, hashPassword } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

async function getUserCount() {
  const [rows] = await mysqlPool.query("SELECT COUNT(*) as total FROM users");
  return Number(rows[0]?.total || 0);
}

export const POST = withErrorHandling(async (request) => {
  const { username, password } = await parseJsonBody(request);
  const safeUsername = safeStr(username, "");
  if (!safeUsername || !password) throw new ApiError(400, "Username and password are required.");

  const total = await getUserCount();

  const [check] = await mysqlPool.query("SELECT userid FROM users WHERE username=?", [safeUsername]);
  if (check.length > 0) throw new ApiError(400, "Username already exists.");

  // This page bootstraps the first Admin account (total === 0) with no login
  // required. After that, signup is a public *access request* — the account
  // is created with no roleId and no company access, so it exists but can't
  // log in or do anything (see /api/auth/login's "no active companies"
  // check) until an Admin reviews it on the Users page and assigns a role,
  // permissions, and company access there. This keeps the request/approval
  // flow entirely inside the existing Users edit screen — no separate
  // "pending requests" system needed.
  //
  // `role` is a fixed MySQL ENUM (no blank/"pending" member, NOT NULL) — it
  // can't hold an empty string, so a pending request keeps the enum's own
  // default ('User') and is instead identified by `roleId IS NULL`, exactly
  // like sanitizeUser() already treats "no roleId" as "no permissions yet".
  const requestedRole = total === 0 ? "Admin" : "User";
  const hashed = await hashPassword(password);

  await mysqlPool.query(
    "INSERT INTO users (userid, username, password, role, roleId, createdAt, updatedAt) VALUES (UUID(),?,?,?,NULL,NOW(),NOW())",
    [safeUsername, hashed, requestedRole]
  );

  const [newUser] = await mysqlPool.query("SELECT * FROM users WHERE username=?", [safeUsername]);
  return NextResponse.json({
    message: total === 0
      ? "Admin account created successfully."
      : "Signup request submitted. An Admin needs to approve it and assign your access before you can log in.",
    user: sanitizeUser(newUser[0]),
  });
});
