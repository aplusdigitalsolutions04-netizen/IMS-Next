import { NextResponse } from "next/server";
import { authenticateRequest, requirePermission, ApiError } from "@/lib/auth";
import { sendManualReminder } from "@/lib/mailer";
import { withErrorHandling } from "@/lib/apiResponse";

// Purely manual — fires only when an admin clicks "Send Reminder" on a
// specific sent email in the Sent Emails page. Nothing in this app calls
// this on a schedule or automatically.
export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "sentEmails", "Only Admin can send reminders.");
  const { id } = await params;

  try {
    await sendManualReminder(id);
  } catch (err) {
    throw new ApiError(400, err.message || "Failed to send reminder");
  }

  return NextResponse.json({ message: "Reminder sent" });
});
