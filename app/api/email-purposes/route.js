import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// "general" is the reserved fallback purpose lib/mailer.js's account
// resolution always checks for — never allow it to be renamed away or
// duplicated as a plain slug.
const RESERVED_KEY = "general";

// Manage Purposes lives inside the Email Accounts screen ("Email Accounts >
// Manage Purposes"), so it should follow that screen's own emailAccounts
// permission like every other route there (app/api/email-accounts/route.js)
// — this used to hardcode an Admin-role check instead, so a role granted
// "Email Accounts" access (e.g. Supervisor, Accountant) could open the
// screen but still got denied here specifically.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "emailAccounts", "You do not have permission to view email purposes.");

  const [rows] = await mysqlPool.query("SELECT * FROM email_purposes ORDER BY isSystem DESC, label ASC");
  return NextResponse.json({ data: rows });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "emailAccounts", "You do not have permission to manage email purposes.");

  const { purposeKey, label } = await parseJsonBody(request);
  const key = String(purposeKey || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (!key) throw new ApiError(400, "Purpose key is required");
  if (!label?.trim()) throw new ApiError(400, "Label is required");

  const [existing] = await mysqlPool.query("SELECT guid FROM email_purposes WHERE purposeKey = ?", [key]);
  if (existing.length > 0) throw new ApiError(400, `A purpose with key "${key}" already exists`);

  const guid = randomUUID();
  await mysqlPool.query(
    "INSERT INTO email_purposes (guid, purposeKey, label, isSystem, isActive) VALUES (?, ?, ?, 0, 1)",
    [guid, key, label.trim()]
  );
  return NextResponse.json({ message: "Purpose created", guid, purposeKey: key });
});
