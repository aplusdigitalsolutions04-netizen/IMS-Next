import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { ApiError, authenticateRequest, hasAllCompaniesAccess } from "@/lib/auth";
import { sanitizeUser, signToken, logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Requires an already-valid JWT (login always issues one, scoped to the user's
// default/first company) — re-issues it scoped to a different company the user
// has access to, after verifying membership via user_companies.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  const { companyGuid } = await parseJsonBody(request);
  if (!companyGuid) throw new ApiError(400, "companyGuid is required");

  // Verify user has access to this company — Admin (and allCompaniesAccess-
  // flagged users) can switch into any active company without a
  // user_companies row.
  const [rows] = hasAllCompaniesAccess(user)
    ? await mysqlPool.query(`SELECT guid, name, allowedPlatforms FROM companies WHERE guid = ? AND isActive = 1`, [companyGuid])
    : await mysqlPool.query(
        `SELECT c.guid, c.name, c.allowedPlatforms
         FROM user_companies uc
         JOIN companies c ON uc.companyGuid = c.guid
         WHERE uc.userGuid = ? AND c.guid = ? AND c.isActive = 1`,
        [user.id, companyGuid]
      );

  if (rows.length === 0) {
    throw new ApiError(403, "You do not have access to this company or it is inactive.");
  }

  // Re-issue token
  user.companyId = rows[0].guid;
  
  // Note: signToken expects user.userid or user.id
  const token = signToken({ ...user, userid: user.id });

  await logUserActivity(
    mysqlPool,
    user,
    "Switch Company",
    [{ field: "company", newValue: rows[0].name }],
    request.headers.get("x-forwarded-for") || null
  );

  const sanitized = sanitizeUser(user);
  sanitized.companyId = user.companyId;

  return NextResponse.json({ token, user: sanitized });
});
