import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, ApiError } from "@/lib/auth";
import { authorizeWarranty } from "@/lib/warrantyAuth";
import { sendWarrantyEmail } from "@/lib/mailer";
import { logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Sends warranty email for an order via SMTP
export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeWarranty(user, "POST");

  const { to, cc, bcc, subject, body: emailBody, attachments, accountGuid, purpose } = body;
  if (!to) throw new ApiError(400, '"To" email is required');
  if (!subject) throw new ApiError(400, "Subject is required");
  const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
  if (!validEmail(to)) throw new ApiError(400, 'Invalid "To" email address');
  if (cc && !cc.split(",").every((e) => validEmail(e.trim()))) throw new ApiError(400, "Invalid CC email address");
  if (bcc && !bcc.split(",").every((e) => validEmail(e.trim()))) throw new ApiError(400, "Invalid BCC email address");

  try {
    // `purpose` comes from whichever template the user picked in the compose
    // flow — that decides which connected email account the send resolves
    // to (falls back to "warranty" for older callers that don't send it).
    await sendWarrantyEmail({ companyGuid: user.companyId, purpose: purpose || "warranty", accountGuid, to, cc, bcc, subject, body: emailBody, attachments });
  } catch (err) {
    console.error("[warranty] POST /send-email:", err);
    throw new ApiError(500, err.message || "Failed to send email");
  }

  await logUserActivity(mysqlPool, user, "Send Warranty Email", [{ to, subject }], request.headers.get("x-forwarded-for") || null);
  return NextResponse.json({ message: "Email sent successfully" });
});
