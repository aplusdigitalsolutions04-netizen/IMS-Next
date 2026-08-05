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

  // Batch-fetched once (was one SELECT per id) and, since every id in the
  // batch gets the exact same `updates` applied, the actual UPDATE is also
  // collapsed into a single statement over every matched orderGuid instead
  // of one per id. Wrapped in a transaction so a failure partway through
  // can't leave some installations updated and others not with no way for
  // the caller to tell from the response.
  const conn = await mysqlPool.getConnection();
  const results = { success: [], failed: [] };
  try {
    await conn.beginTransaction();

    const [itemRows] = await conn.query("SELECT guid, orderGuid FROM order_items WHERE guid IN (?) AND companyGuid=?", [ids, user.companyId]);
    const foundIds = new Set(itemRows.map((r) => r.guid));
    results.failed = ids.filter((id) => !foundIds.has(id));
    results.success = ids.filter((id) => foundIds.has(id));

    const orderGuids = [...new Set(itemRows.map((r) => r.orderGuid))];
    const clauses = [], params = [];
    if (technicianName !== undefined) { clauses.push("technicianName=?"); params.push(technicianName); }
    if (technicianContact !== undefined) { clauses.push("technicianContact=?"); params.push(technicianContact); }
    if (installationStatus !== undefined) { clauses.push("installationStatus=?"); params.push(installationStatus); }
    if (scheduledDate !== undefined) { clauses.push("scheduledDate=?"); params.push(new Date(scheduledDate)); }
    if (clauses.length && orderGuids.length) {
      params.push(orderGuids, user.companyId);
      await conn.query(`UPDATE order_installations SET ${clauses.join(",")} WHERE orderGuid IN (?) AND companyGuid=?`, params);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return NextResponse.json({ message: `${results.success.length} installations updated`, results });
});
