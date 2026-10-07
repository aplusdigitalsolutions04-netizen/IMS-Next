import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission, hasAllCompaniesAccess, ApiError } from "@/lib/auth";
import { logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureCredentialsTables } from "@/lib/credentialsMigration";
import { encryptSecret } from "@/lib/credentialsCrypto";
import { requireManage, toPublicCredential, buildStoredCustomFields, canManageCredentials, canViewCredentialPasswords } from "@/lib/credentialsHelpers";

// Anyone with the "Credentials" view permission sees the list (titles,
// usernames, URLs...) — passwords are never in this response; they come only
// from the reveal endpoint, which needs "View Credential Passwords".
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "credentials", "You do not have permission to access credentials.");
  await ensureCredentialsTables();

  // ?scope=all — Admin / all-companies-access users can list every company's
  // credentials at once (grouped by company on the page). Anyone else asking
  // for it just gets their active company, never another one's.
  const canViewAllCompanies = hasAllCompaniesAccess(user);
  const wantsAll = canViewAllCompanies && new URL(request.url).searchParams.get("scope") === "all";

  const [rows] = await mysqlPool.query(
    `SELECT c.*, cu.username AS createdByName, pu.username AS passwordChangedByName, co.name AS companyName
     FROM credentials c
     LEFT JOIN users cu ON cu.userid = c.createdBy
     LEFT JOIN users pu ON pu.userid = c.passwordChangedBy
     LEFT JOIN companies co ON co.guid = c.companyGuid
     WHERE c.isDeleted = 0 ${wantsAll ? "" : "AND c.companyGuid <=> ?"}
     ORDER BY co.name ASC, c.title ASC`,
    wantsAll ? [] : [user.companyId]
  );

  return NextResponse.json({
    data: rows.map(toPublicCredential),
    canManage: canManageCredentials(user),
    canViewPasswords: canViewCredentialPasswords(user),
    canViewAllCompanies,
  });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "credentials", "You do not have permission to access credentials.");
  requireManage(user);
  await ensureCredentialsTables();

  const body = await parseJsonBody(request);
  const title = String(body.title || "").trim();
  if (!title) throw new ApiError(400, "Title is required.");

  const guid = randomUUID();
  const hasPassword = body.password !== undefined && body.password !== null && body.password !== "";
  await mysqlPool.query(
    `INSERT INTO credentials (guid, companyGuid, title, username, passwordEnc, url, category, notes, customFields, createdBy, updatedBy, passwordChangedAt, passwordChangedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      guid, user.companyId, title, body.username?.trim() || null,
      hasPassword ? encryptSecret(body.password) : null,
      body.url?.trim() || null, body.category || null, body.notes || null,
      JSON.stringify(buildStoredCustomFields(body.customFields)),
      user.id, user.id, hasPassword ? new Date() : null, hasPassword ? user.id : null,
    ]
  );

  await logUserActivity(mysqlPool, user, "CREDENTIAL_CREATED", { credentialGuid: guid, title }, request.headers.get("x-forwarded-for") || null);
  return NextResponse.json({ message: "Credential added", guid }, { status: 201 });
});
