import nodemailer from "nodemailer";
import { mysqlPool } from "./db";

// Multiple SMTP "accounts" can be configured (Settings > Email Accounts) —
// one per purpose (warranty/dispatch/payment/general), optionally scoped to
// a specific company. Resolution order for a given (companyGuid, purpose):
//   1. exact match: this company + this purpose
//   2. this company + purpose "general"
//   3. global default (companyGuid NULL) for this purpose
//   4. global default (companyGuid NULL) + purpose "general"
//   5. fall back to the single SMTP_* env-var account (legacy behavior)
async function resolveEmailAccount(companyGuid, purpose) {
  const [rows] = await mysqlPool.query(
    `SELECT * FROM email_accounts WHERE isActive = 1 AND (
       (companyGuid = ? AND purpose = ?) OR
       (companyGuid = ? AND purpose = 'general') OR
       (companyGuid IS NULL AND purpose = ?) OR
       (companyGuid IS NULL AND purpose = 'general')
     )
     ORDER BY
       (companyGuid = ? AND purpose = ?) DESC,
       (companyGuid = ? AND purpose = 'general') DESC,
       (companyGuid IS NULL AND purpose = ?) DESC
     LIMIT 1`,
    [companyGuid, purpose, companyGuid, purpose, companyGuid, purpose, companyGuid, purpose]
  );
  return rows[0] || null;
}

// Same resolution order as resolveEmailAccount, for the (optional) saved
// subject/body template of a purpose — lets a feature call renderTemplate()
// to get {subject, body} with placeholders substituted, then hand that
// straight to sendMail(). Returns null if no template is configured (caller
// should fall back to building its own subject/body in that case).
async function resolveTemplate(companyGuid, purpose) {
  const [rows] = await mysqlPool.query(
    `SELECT * FROM email_templates WHERE isActive = 1 AND (
       (companyGuid = ? AND purpose = ?) OR
       (companyGuid = ? AND purpose = 'general') OR
       (companyGuid IS NULL AND purpose = ?) OR
       (companyGuid IS NULL AND purpose = 'general')
     )
     ORDER BY
       (companyGuid = ? AND purpose = ?) DESC,
       (companyGuid = ? AND purpose = 'general') DESC,
       (companyGuid IS NULL AND purpose = ?) DESC
     LIMIT 1`,
    [companyGuid, purpose, companyGuid, purpose, companyGuid, purpose, companyGuid, purpose]
  );
  return rows[0] || null;
}

// Substitutes {{PLACEHOLDER}} tokens in the resolved template's subject/body
// with values from `data` (e.g. { CUSTOMER_NAME: "...", ORDER_ID: "..." }).
// Unmatched placeholders are left as-is so a missing value is obvious.
export async function renderTemplate(companyGuid, purpose, data = {}) {
  const template = await resolveTemplate(companyGuid, purpose);
  if (!template) return null;
  const fill = (text) =>
    Object.entries(data).reduce((acc, [key, value]) => acc.split(`{{${key}}}`).join(value ?? ""), text || "");
  return { subject: fill(template.emailSubject), body: fill(template.emailBody) };
}

function transporterFor(account) {
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: Number(account.smtpPort),
    secure: !!account.smtpSecure,
    auth: { user: account.smtpUser, pass: account.smtpPass },
  });
}

function envTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const escapeHtml = (str) =>
  (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

// Actually hands the message to the resolved SMTP account — no reminder
// bookkeeping here, so both the real sendMail() and reminder resends can
// share it without a reminder resend logging itself as needing its own
// follow-up (which would otherwise loop forever).
async function deliver({ companyGuid, purpose = "general", to, cc, bcc, subject, body, attachments }) {
  const account = await resolveEmailAccount(companyGuid, purpose);
  const transporter = account ? transporterFor(account) : envTransporter();
  const fromEmail = account?.fromEmail || process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromName = account?.fromName || "A Plus Digital Solutions";

  return transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
    subject,
    text: body || "",
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.8">${escapeHtml(body)}</div>`,
    attachments: Array.isArray(attachments) ? attachments : [],
  });
}

// Generic sender any feature (warranty, dispatch, payment, ...) can call —
// picks the right SMTP account per the resolution order above. Every send is
// logged to email_sent_log (reminders are entirely manual — see Settings >
// Sent Emails — nothing here auto-resends anything).
export async function sendMail({ companyGuid, purpose = "general", to, cc, bcc, subject, body, attachments }) {
  const info = await deliver({ companyGuid, purpose, to, cc, bcc, subject, body, attachments });

  await mysqlPool.query(
    `INSERT INTO email_sent_log (guid, companyGuid, purpose, toAddress, subject, body, messageId)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
    [companyGuid || null, purpose, to, subject || null, body || null, info?.messageId || null]
  );

  return info;
}

// Manually triggered from the Sent Emails page — resends that exact
// subject/body to the same recipient and records it, but only ever on an
// explicit admin click. Nothing in this app calls this on its own.
export async function sendManualReminder(sentLogGuid) {
  const [[row]] = await mysqlPool.query("SELECT * FROM email_sent_log WHERE guid = ?", [sentLogGuid]);
  if (!row) throw new Error("Sent email not found");

  await deliver({
    companyGuid: row.companyGuid,
    purpose: row.purpose,
    to: row.toAddress,
    subject: `Reminder: ${row.subject || ""}`,
    body: row.body,
  });
  await mysqlPool.query(
    "UPDATE email_sent_log SET remindersSent = remindersSent + 1, lastReminderAt = NOW() WHERE guid = ?",
    [sentLogGuid]
  );
}

export async function sendWarrantyEmail({ companyGuid, to, cc, bcc, subject, body, attachments }) {
  return sendMail({ companyGuid, purpose: "warranty", to, cc, bcc, subject, body, attachments });
}
