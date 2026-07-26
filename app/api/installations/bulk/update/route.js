import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeInstallations } from "@/lib/installationsAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeInstallations(user, "PUT");

  const { ids, updates } = await parseJsonBody(request);
  if (!Array.isArray(ids) || !ids.length) throw new ApiError(400, "No IDs provided");
  const { technicianName, technicianContact, installationStatus, scheduledDate } = updates;

  const results = { success: [], failed: [] };
  for (const id of ids) {
    const [itemRows] = await mysqlPool.query("SELECT orderGuid FROM order_items WHERE guid=? AND companyGuid=?", [id, user.companyId]);
    if (!itemRows.length) { results.failed.push(id); continue; }
    const clauses = [], params = [];
    if (technicianName !== undefined) { clauses.push("technicianName=?"); params.push(technicianName); }
    if (technicianContact !== undefined) { clauses.push("technicianContact=?"); params.push(technicianContact); }
    if (installationStatus !== undefined) { clauses.push("installationStatus=?"); params.push(installationStatus); }
    if (scheduledDate !== undefined) { clauses.push("scheduledDate=?"); params.push(new Date(scheduledDate)); }
    if (clauses.length) { params.push(itemRows[0].orderGuid, user.companyId); await mysqlPool.query(`UPDATE order_installations SET ${clauses.join(",")} WHERE orderGuid=? AND companyGuid=?`, params); }
    results.success.push(id);
  }
  return NextResponse.json({ message: `${results.success.length} installations updated`, results });
});
