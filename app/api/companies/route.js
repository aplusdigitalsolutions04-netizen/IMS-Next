import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeMasterWrite, hasAllCompaniesAccess, isSuperUser, ApiError } from "@/lib/auth";
import { normalizeRole, parseAllowedPlatforms, parseJsonArray } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureCompanyAdditionalGstColumn } from "@/lib/companiesMigration";
import { normGstin } from "@/lib/companyMatch";

export const GET = withErrorHandling(async (request) => {
  // Any authenticated user can list companies — this backs company pickers
  // used well outside Company Master itself (Email Accounts, user forms,
  // etc.). But the list itself is scoped to companies the user actually has
  // access to (same membership check as switch-company), not every company
  // in the system — only Admin/allCompaniesAccess users see all of them.
  const user = await authenticateRequest(request);
  await ensureCompanyAdditionalGstColumn();

  const [rows] = hasAllCompaniesAccess(user)
    ? await mysqlPool.query("SELECT * FROM companies ORDER BY name ASC")
    : await mysqlPool.query(
        `SELECT c.* FROM user_companies uc
         JOIN companies c ON uc.companyGuid = c.guid
         WHERE uc.userGuid = ?
         ORDER BY c.name ASC`,
        [user.id]
      );
  return NextResponse.json(rows.map((r) => ({
    ...r,
    allowedPlatforms: parseAllowedPlatforms(r.allowedPlatforms),
    additionalGstNumbers: parseJsonArray(r.additionalGstNumbers),
  })));
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "companyMaster", { isCreate: true, denyMessage: "You do not have permission to add companies." });
  await ensureCompanyAdditionalGstColumn();

  const { name, gstNumber, allowedPlatforms, additionalGstNumbers, isActive } = await parseJsonBody(request);
  if (!name) throw new ApiError(400, "Company name is required.");

  const platformsJson = allowedPlatforms && allowedPlatforms.length > 0 ? JSON.stringify(allowedPlatforms) : null;
  // Deduped, normalized, and never includes the primary gstNumber itself —
  // that one's already covered, listing it again here would just make
  // allGstNumbers() do redundant work every time it reads this company back.
  const extraGst = Array.isArray(additionalGstNumbers)
    ? [...new Set(additionalGstNumbers.map(normGstin).filter((g) => g && g !== normGstin(gstNumber)))]
    : [];
  const extraGstJson = extraGst.length > 0 ? JSON.stringify(extraGst) : null;

  const guid = randomUUID();
  await mysqlPool.query(
    "INSERT INTO companies (guid, name, gstNumber, allowedPlatforms, additionalGstNumbers, isActive) VALUES (?, ?, ?, ?, ?, ?)",
    [guid, name, gstNumber || null, platformsJson, extraGstJson, isActive === false ? 0 : 1]
  );

  // Non-Admin users (Admin/allCompaniesAccess already sees every company via
  // hasAllCompaniesAccess) need an explicit user_companies row before they can
  // switch into a company they just created — otherwise a Company Master-
  // permitted user could create one but never actually use it.
  if (!isSuperUser(normalizeRole(user.role)) && !user.allCompaniesAccess) {
    await mysqlPool.query(
      "INSERT INTO user_companies (userGuid, companyGuid, isDefault) VALUES (?, ?, 0)",
      [user.id, guid]
    );
  }

  return NextResponse.json({ message: "Company created successfully.", guid });
});
