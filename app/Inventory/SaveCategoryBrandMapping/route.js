import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, authorizeMasterWrite } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "mapping", { isCreate: true });
  requireAuth(user);

  const { categoryId, brandId } = body;
  await mysqlPool.execute("INSERT INTO inventorycategorybrandmapping (mappingId, categoryId, brandId) VALUES (?, ?, ?)", [uuidv4(), categoryId, brandId]);
  return NextResponse.json({ message: "Success" });
});
