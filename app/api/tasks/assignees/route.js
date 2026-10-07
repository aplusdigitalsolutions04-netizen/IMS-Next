import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission, requireEditPermission, hasAllCompaniesAccess } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

// A lightweight "who can I assign a task to" list — gated on allow_assign_tasks
// rather than the "users" management permission, since assigning a task to a
// colleague is a much narrower ask than full User Management access.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "tasks", "You do not have permission to access tasks.");
  requireEditPermission(user, "allow_assign_tasks");

  const [rows] = hasAllCompaniesAccess(user)
    ? await mysqlPool.query("SELECT userid, username, fullName, role FROM users ORDER BY username ASC")
    : await mysqlPool.query(
        `SELECT DISTINCT u.userid, u.username, u.fullName, u.role FROM users u
         LEFT JOIN user_companies uc ON uc.userGuid = u.userid
         WHERE u.allCompaniesAccess = 1 OR uc.companyGuid = ?
         ORDER BY u.username ASC`,
        [user.companyId]
      );

  return NextResponse.json({ data: rows });
});
