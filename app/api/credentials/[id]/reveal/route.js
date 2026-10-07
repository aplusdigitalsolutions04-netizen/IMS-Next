import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission, ApiError } from "@/lib/auth";
import { logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureCredentialsTables } from "@/lib/credentialsMigration";
import { decryptSecret } from "@/lib/credentialsCrypto";
import { requireViewPasswords, companyCondition } from "@/lib/credentialsHelpers";

// The ONLY place a secret is decrypted and returned. Every call is written to
// the audit log (who, which entry, which field, view vs copy) — never the
// value itself.
//   target: "password" | "field:<customFieldId>" | "history:<historyGuid>"
//   purpose: "view" | "copy"
export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "credentials", "You do not have permission to access credentials.");
  requireViewPasswords(user);
  await ensureCredentialsTables();
  const { id } = await params;

  const { target = "password", purpose = "view" } = await parseJsonBody(request);
  const scope = companyCondition(user);
  const [[cred]] = await mysqlPool.query(
    `SELECT * FROM credentials WHERE guid = ? AND isDeleted = 0 AND ${scope.sql}`,
    [id, ...scope.params]
  );
  if (!cred) throw new ApiError(404, "Credential not found.");

  let encrypted = null;
  let label = "password";
  if (target === "password") {
    encrypted = cred.passwordEnc;
  } else if (String(target).startsWith("field:")) {
    const fieldId = String(target).slice(6);
    const fields = Array.isArray(cred.customFields) ? cred.customFields : JSON.parse(cred.customFields || "[]");
    const field = fields.find((f) => f.id === fieldId && f.secret);
    if (!field) throw new ApiError(404, "Field not found.");
    encrypted = field.value;
    label = `field "${field.label}"`;
  } else if (String(target).startsWith("history:")) {
    const [[h]] = await mysqlPool.query(
      "SELECT passwordEnc FROM credential_password_history WHERE guid = ? AND credentialGuid = ?",
      [String(target).slice(8), id]
    );
    if (!h) throw new ApiError(404, "History entry not found.");
    encrypted = h.passwordEnc;
    label = "previous password";
  } else {
    throw new ApiError(400, "Invalid target.");
  }

  const value = decryptSecret(encrypted);
  await logUserActivity(
    mysqlPool, user, purpose === "copy" ? "CREDENTIAL_SECRET_COPIED" : "CREDENTIAL_SECRET_VIEWED",
    { credentialGuid: id, title: cred.title, field: label }, request.headers.get("x-forwarded-for") || null
  );
  return NextResponse.json({ value });
});
