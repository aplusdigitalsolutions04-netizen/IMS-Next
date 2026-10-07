import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, authorizeMasterWrite, isSuperUser, ApiError } from "@/lib/auth";
import { normalizeRole } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureEmailAccountsOwnerColumn, ensureEmailAccountsSignatureColumn, ensureEmailAccountsSharedColumn } from "@/lib/emailAccountsMigration";

function parseSharedWith(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function validatePurpose(purpose) {
  const [[row]] = await mysqlPool.query("SELECT purposeKey FROM email_purposes WHERE purposeKey = ? AND isActive = 1", [purpose]);
  if (!row) throw new ApiError(400, `"${purpose}" is not a valid, active purpose — add it under Email Accounts > Manage Purposes first.`);
}

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "emailAccounts", "Only Admin can view email accounts.");
  await ensureEmailAccountsOwnerColumn();
  await ensureEmailAccountsSignatureColumn();
  await ensureEmailAccountsSharedColumn();

  const [rows] = await mysqlPool.query(`
    SELECT e.*, c.name as companyName
    FROM email_accounts e
    LEFT JOIN companies c ON e.companyGuid = c.guid
    ORDER BY e.purpose ASC, c.name ASC
  `);
  // Whoever added a webmail account (or anyone Admin explicitly shared it
  // with, via sharedWith) is who sees it exists — not just its mail
  // (already enforced on /api/email-inbox), the account row itself is
  // hidden from everyone else here too. Filtered in JS rather than SQL
  // since the row count here is always small and sharedWith needs parsing
  // anyway.
  const isAdmin = isSuperUser(normalizeRole(user.role));
  const visible = isAdmin
    ? rows
    : rows.filter((r) => r.createdBy === user.id || parseSharedWith(r.sharedWith).includes(String(user.id)));
  // Never send the SMTP password back to the client.
  const sanitized = visible.map(({ smtpPass, sharedWith, ...rest }) => ({ ...rest, sharedWith: parseSharedWith(sharedWith) }));
  return NextResponse.json({ data: sanitized });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "emailAccounts", { isCreate: true, denyMessage: "You do not have permission to add email accounts." });
  await ensureEmailAccountsOwnerColumn();
  await ensureEmailAccountsSignatureColumn();
  await ensureEmailAccountsSharedColumn();

  const body = await parseJsonBody(request);
  const {
    companyGuid, purpose, accountName, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromName, fromEmail, isActive,
    imapEnabled, imapHost, imapPort, imapSecure, signature, sharedWith,
  } = body;

  await validatePurpose(purpose);
  if (!accountName?.trim()) throw new ApiError(400, "Account name is required");
  if (!smtpHost?.trim()) throw new ApiError(400, "SMTP host is required");
  if (!smtpUser?.trim()) throw new ApiError(400, "SMTP user is required");
  if (!smtpPass?.trim()) throw new ApiError(400, "SMTP password is required");
  if (!fromEmail?.trim()) throw new ApiError(400, "From email is required");
  if (imapEnabled && !imapHost?.trim()) throw new ApiError(400, "IMAP host is required to enable inbox reading");

  // Only Admin can grant sharing — a non-admin creating their own account
  // has no standing to hand other people access to it unilaterally.
  const isAdmin = isSuperUser(normalizeRole(user.role));

  // One mailbox = one account. If this exact mailbox (same login on the same SMTP
  // host) is already added — by Admin or anybody else — don't create a second row.
  //   • the person who already has it  -> told it already exists
  //   • someone else, with the right password -> the existing account is simply
  //     shared with them, so it shows once (for Admin too) and also for them
  //   • someone else, wrong password -> refused (knowing an address is not access)
  const [dupes] = await mysqlPool.query(
    "SELECT guid, accountName, smtpPass, createdBy, sharedWith FROM email_accounts WHERE LOWER(TRIM(smtpUser)) = ? AND LOWER(TRIM(smtpHost)) = ?",
    [smtpUser.trim().toLowerCase(), smtpHost.trim().toLowerCase()]
  );
  if (dupes.length > 0) {
    const existing = dupes[0];
    const shared = parseSharedWith(existing.sharedWith);
    const alreadyHasIt = isAdmin || existing.createdBy === user.id || shared.includes(String(user.id));
    if (alreadyHasIt) {
      throw new ApiError(409, `This email account already exists as "${existing.accountName}" — it is not added twice.`);
    }
    if (String(existing.smtpPass) !== smtpPass.trim()) {
      throw new ApiError(400, "This email account is already added, but the password you entered doesn't match, so it can't be shared with you.");
    }
    shared.push(String(user.id));
    await mysqlPool.query("UPDATE email_accounts SET sharedWith = ? WHERE guid = ?", [JSON.stringify(shared), existing.guid]);
    return NextResponse.json({
      message: `This email account already existed ("${existing.accountName}") — it was not added twice; it is now available to you.`,
      guid: existing.guid,
      merged: true,
    });
  }
  const sharedWithJson = isAdmin && Array.isArray(sharedWith) ? JSON.stringify(sharedWith.map(String)) : null;

  const guid = randomUUID();
  await mysqlPool.query(
    `INSERT INTO email_accounts
       (guid, companyGuid, purpose, accountName, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromName, fromEmail, isActive,
        imapEnabled, imapHost, imapPort, imapSecure, createdBy, signature, sharedWith)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      guid, companyGuid || null, purpose, accountName.trim(), smtpHost.trim(),
      Number(smtpPort) || 587, smtpSecure ? 1 : 0, smtpUser.trim(), smtpPass.trim(),
      fromName?.trim() || null, fromEmail.trim(), isActive === false ? 0 : 1,
      imapEnabled ? 1 : 0, imapHost?.trim() || null, Number(imapPort) || 993, imapSecure === false ? 0 : 1,
      user.id, signature || null, sharedWithJson,
    ]
  );

  return NextResponse.json({ message: "Email account created", guid });
});
