import { NextResponse } from "next/server";
import { authenticateRequest, requirePermission } from "@/lib/auth";
import { pollAllInboxes } from "@/lib/imapReader";
import { withErrorHandling } from "@/lib/apiResponse";

// Triggered on-demand — from the Inbox page on load/refresh, or a periodic
// client-side timer while it's open. There's no standing background worker
// in this app (Next.js API routes only run per-request), so freshness is
// tied to someone having the Inbox page open / hitting Refresh. This only
// pulls in replies (which also cancels any pending manual reminder for the
// matching sent email) — reminders themselves are never sent automatically,
// only from an explicit click on the Sent Emails page.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "emailInbox", "Only Admin can poll the email inbox.");

  const results = await pollAllInboxes();
  return NextResponse.json({ message: "Poll complete", results });
});
