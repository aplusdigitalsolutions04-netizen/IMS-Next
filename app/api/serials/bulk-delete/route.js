import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany } from "@/lib/auth";
import { authorizeSerials } from "@/lib/serialsAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeSerials(user, "POST");

  const body = await parseJsonBody(request);
  const ids = Array.isArray(body.ids) ? body.ids : [body.ids];
  if (ids.length > 0) await mysqlPool.query("UPDATE inventorystockinserial SET isDeleted=1 WHERE guid IN (?) AND companyGuid=?", [ids, user.companyId]);
  broadcastRealtimeEvent(user.companyId, "serials");
  return NextResponse.json({ message: "Bulk deleted (soft)" });
});
