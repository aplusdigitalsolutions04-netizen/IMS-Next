import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, ApiError, isSuperUser } from "@/lib/auth";
import { authorizeWarranty } from "@/lib/warrantyAuth";
import { normalizeRole } from "@/lib/helpers";
import { sendWarrantyEmail } from "@/lib/mailer";
import { resolveEmailAttachments } from "@/lib/orderEmailDocuments";
import { saveBufferToDrive } from "@/lib/upload";
import sanitizeHtml from "sanitize-html";
import { logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Sends warranty email for an order via SMTP
export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  // The Order Tracking compose flow needs "warranty"; the standalone
  // Compose (Settings > Email Inbox, no order involved) only makes sense
  // for someone who can already see a specific account's Inbox/Sent, so
  // accept that instead of forcing them to also hold "warranty".
  const canSendFromInbox = user.permissions?.includes("emailAccounts") || user.permissions?.includes("emailInbox");
  if (!isSuperUser(normalizeRole(user.role)) && !canSendFromInbox) {
    authorizeWarranty(user, "POST");
  }

  const { to, cc, bcc, subject, body: emailBody, bodyHtml: rawBodyHtml, attachments, accountGuid, purpose, orderGuid } = body;
  // The body comes from the rich-text editor: keep the formatting (bold, lists, links, images, colours...) but drop
  // anything that could run script.
  const bodyHtml = rawBodyHtml
    ? sanitizeHtml(String(rawBodyHtml), {
        allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "span", "u", "s", "font", "h1", "h2", "h3", "div"],
        allowedAttributes: {
          a: ["href", "target", "rel"],
          img: ["src", "alt", "width", "height", "style"],
          font: ["color", "size", "face"],
          "*": ["style"],
        },
        allowedSchemes: ["http", "https", "mailto", "tel"],
        allowedSchemesByTag: { img: ["data", "cid", "http", "https"] },
        allowedStyles: {
          "*": {
            color: [/^[#a-z0-9(),.\s%-]+$/i],
            "background-color": [/^[#a-z0-9(),.\s%-]+$/i],
            "font-weight": [/^[a-z0-9]+$/i],
            "font-style": [/^[a-z]+$/i],
            "font-size": [/^[0-9.]+(px|pt|em|rem|%)$/i],
            "font-family": [/^[a-z0-9,'" \-]+$/i],
            "text-decoration": [/^[a-z\s-]+$/i],
            "text-align": [/^(left|right|center|justify)$/i],
            height: [/^[0-9.]+(px|%)$/i],
            width: [/^[0-9.]+(px|%)$/i],
          },
        },
      })
    : null;
  if (!to) throw new ApiError(400, '"To" email is required');
  if (!subject) throw new ApiError(400, "Subject is required");
  const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
  // To / CC / BCC may each hold several addresses, separated by comma or semicolon.
  const splitList = (s) => String(s || "").split(/[,;]+/).map((e) => e.trim()).filter(Boolean);
  const toList = splitList(to);
  if (!toList.length || !toList.every(validEmail)) throw new ApiError(400, 'Invalid "To" email address');
  const ccList = splitList(cc);
  if (!ccList.every(validEmail)) throw new ApiError(400, "Invalid CC email address");
  const bccList = splitList(bcc);
  if (!bccList.every(validEmail)) throw new ApiError(400, "Invalid BCC email address");

  try {
    // `purpose` comes from whichever template the user picked in the compose
    // flow — that decides which connected email account the send resolves
    // to (falls back to "warranty" for older callers that don't send it).
    const resolvedAttachments = await resolveEmailAttachments(attachments, { orderGuid, companyGuid: user.companyId });
    await sendWarrantyEmail({ companyGuid: user.companyId, purpose: purpose || "warranty", accountGuid, to: toList.join(", "), cc: ccList.join(", "), bcc: bccList.join(", "), subject, body: emailBody, bodyHtml, attachments: resolvedAttachments, orderGuid });
  } catch (err) {
    console.error("[warranty] POST /send-email:", err);
    throw new ApiError(500, err.message || "Failed to send email");
  }

  // Files the sender added by hand in the compose window are also kept in ONE common Drive folder
  // ("Email Attachments"). Best effort — a Drive problem must never turn a mail that was already sent into an error.
  for (const a of Array.isArray(attachments) ? attachments : []) {
    if (!a || a.ref || !a.content) continue;
    try {
      const safe = String(a.filename || "file").replace(/[^\w.\- ()]+/g, "_").slice(0, 120);
      await saveBufferToDrive(Buffer.from(a.content, "base64"), `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safe}`, a.contentType, "emailAttachments");
    } catch (err) {
      console.error("[send-email] could not keep a copy of an attachment in Drive:", err.message);
    }
  }

  // Log what was really sent: the template's purpose (Dispatch / Payment / Warranty ...), the order, recipients and
  // attachment count — this always said "Send Warranty Email" with no details, whatever template was used.
  let purposeLabel = "Warranty";
  let orderNo = null;
  try {
    const key = purpose || "warranty";
    const [[p]] = await mysqlPool.query("SELECT label FROM email_purposes WHERE purposeKey = ? LIMIT 1", [key]);
    purposeLabel = p?.label || key.charAt(0).toUpperCase() + key.slice(1);
    if (orderGuid) {
      const [[o]] = await mysqlPool.query("SELECT orderid FROM orders WHERE guid = ? AND companyGuid = ? LIMIT 1", [orderGuid, user.companyId]);
      orderNo = o?.orderid || null;
    }
  } catch {}
  const attachmentCount = Array.isArray(attachments) ? attachments.length : 0;
  await logUserActivity(
    mysqlPool,
    user,
    `Send ${purposeLabel} Email`,
    [
      ...(orderNo ? [{ field: "Order", newValue: orderNo }] : []),
      { field: "To", newValue: toList.join(", ") },
      ...(ccList.length ? [{ field: "CC", newValue: ccList.join(", ") }] : []),
      { field: "Subject", newValue: subject },
      ...(attachmentCount ? [{ field: "Attachments", newValue: String(attachmentCount) }] : []),
    ],
    request.headers.get("x-forwarded-for") || null
  );
  return NextResponse.json({ message: "Email sent successfully" });
});
