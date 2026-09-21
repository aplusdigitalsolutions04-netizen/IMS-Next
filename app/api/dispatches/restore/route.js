import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeDispatchRequest, requireCompany } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { restoreDispatchItem } from "@/lib/dispatchHelpers";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeDispatchRequest(user, "POST", body);
  requireCompany(user);

  const { ids } = body;
  const idArray = Array.isArray(ids) ? ids : [ids];
  const results = { success: [], failed: [], errors: {} };
  for (const id of idArray) {
    try {
      await restoreDispatchItem(mysqlPool, id, user.companyId);
      results.success.push(id);
    } catch (err) {
      console.error("Dispatch restore failed:", id, err.message);
      results.failed.push(id);
      results.errors[id] = err.message;
    }
  }
  return NextResponse.json({ message: "Restore completed", results });
});
