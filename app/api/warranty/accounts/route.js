import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany } from "@/lib/auth";
import { authorizeWarranty } from "@/lib/warrantyAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Active email accounts a warranty email could be sent from — "warranty" or
// "general" purpose, scoped to this company or the global default. Lets the
// user pick which webmail to send from instead of the automatic resolution
// always deciding silently. Open to anyone with warranty access (not just
// Admin), same as /api/warranty/templates.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "GET");

  const [rows] = await mysqlPool.query(
    `SELECT guid, accountName, purpose, fromName, fromEmail, smtpHost
     FROM email_accounts
     WHERE isActive = 1 AND purpose IN ('warranty', 'general') AND (companyGuid = ? OR companyGuid IS NULL)
     ORDER BY (companyGuid = ?) DESC, (purpose = 'warranty') DESC, accountName ASC`,
    [user.companyId, user.companyId]
  );
  return NextResponse.json({ data: rows });
});
