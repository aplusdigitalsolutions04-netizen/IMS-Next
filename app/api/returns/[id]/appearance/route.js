import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { authorizeReturns } from "@/lib/returnsAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeReturns(user, "PUT");
  const { id } = await params;

  const { rowColor, tags } = await parseJsonBody(request);
  await mysqlPool.query("UPDATE returns SET rowColor=?, tags=? WHERE guid=? AND companyGuid=?", [rowColor || null, tags || null, id, user.companyId]);
  return NextResponse.json({ message: "Appearance updated successfully" });
});
