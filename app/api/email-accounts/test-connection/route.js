import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { authenticateRequest, authorizeMasterWrite, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Lets the Email Accounts form verify SMTP credentials before saving —
// same gate as actually adding/editing an account, since this is just a
// dry run of that same action. Never touches email_accounts; just opens
// a connection and authenticates, then closes it.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "emailAccounts", { isCreate: true, denyMessage: "You do not have permission to test email accounts." });

  const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass } = await parseJsonBody(request);
  if (!smtpHost?.trim()) throw new ApiError(400, "SMTP host is required");
  if (!smtpUser?.trim()) throw new ApiError(400, "SMTP user is required");
  if (!smtpPass?.trim()) throw new ApiError(400, "SMTP password is required");

  const transporter = nodemailer.createTransport({
    host: smtpHost.trim(),
    port: Number(smtpPort) || 587,
    secure: !!smtpSecure,
    auth: { user: smtpUser.trim(), pass: smtpPass.trim() },
    connectionTimeout: 10000,
  });

  try {
    await transporter.verify();
  } catch (err) {
    // The raw SMTP server response (e.g. "535 5.7.8 ... authentication
    // failed") is the whole point of this endpoint — surface it as-is
    // rather than a generic message, so the user can actually diagnose it.
    throw new ApiError(400, err.response || err.message || "Connection failed");
  }

  return NextResponse.json({ message: "Connection successful" });
});
