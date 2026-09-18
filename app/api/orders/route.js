import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeOrdersRequest, requireCompany } from "@/lib/auth";
import { mapDispatchRow } from "@/lib/helpers";
import { ORDER_SELECT } from "@/lib/ordersQuery";
import { withErrorHandling } from "@/lib/apiResponse";
import { ensureCarePackColumn, ensureCarePackPriceColumn } from "@/lib/carePackMigration";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeOrdersRequest(user, "GET", new URL(request.url).pathname, null);
  await ensureCarePackColumn();
  await ensureCarePackPriceColumn();

  const cId = user.companyId;
  const [orders] = await mysqlPool.query(ORDER_SELECT + " WHERE oi.companyGuid = ? AND o.companyGuid = ? ORDER BY o.dispatchDate DESC", Array(10).fill(cId));
  const [docs] = await mysqlPool.query("SELECT dispatchGuid as dispatchId, docType, filename, createdAt FROM orderdocuments WHERE companyGuid = ? ORDER BY createdAt ASC", [cId]);
  const docsMap = {};
  docs.forEach((d) => { if (!docsMap[d.dispatchId]) docsMap[d.dispatchId] = []; docsMap[d.dispatchId].push(d); });
  return NextResponse.json(orders.map((o) => ({ ...mapDispatchRow(o), documents: docsMap[o.id] || [] })));
});
