import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany } from "@/lib/auth";
import { authorizeWarranty } from "@/lib/warrantyAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Every active template available to this company, across all purposes —
// used by the email-compose "Choose Template" step in Order Tracking. It's
// intentionally not filtered to purpose='warranty': whichever template the
// user picks here decides both the content AND (via its purpose) which
// connected email account the send auto-resolves to — see /send-email.
// Open to anyone with warranty access (not just Admin), since composing/
// sending an email from an order is a regular warranty-permission action.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "GET");

  const [rows] = await mysqlPool.query(
    `SELECT guid, templateName, emailSubject, emailBody, purpose, emailAccountGuid
     FROM email_templates
     WHERE isActive = 1 AND (companyGuid = ? OR companyGuid IS NULL)
     ORDER BY (companyGuid = ?) DESC, purpose ASC, templateName ASC`,
    [user.companyId, user.companyId]
  );
  return NextResponse.json({ data: rows });
});
