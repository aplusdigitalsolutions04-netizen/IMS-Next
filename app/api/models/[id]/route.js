import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeReadWrite, requireCompany, ApiError } from "@/lib/auth";
import { logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";

const authorize = (user, method) =>
  authorizeReadWrite(user, method, {
    permission: "print_models",
    editColumnName: "allow_edit_models",
    adminOnlyDelete: true,
    denyMessage: "You do not have permission to manage models.",
  });

// The legacy `models` table has been retired — `id` here is always an Item
// Master itemVariantId now (see app/api/models/route.js GET). Only the price
// (sellingPrice) is ever edited through this route today (Dispatch's inline
// price edit) — full spec editing lives in the Item Variant Master screens.
export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorize(user, "PUT");
  const { id } = await params;

  const { mrp } = await parseJsonBody(request);

  const [existing] = await mysqlPool.query("SELECT itemVariantId FROM inventoryitemvariant WHERE itemVariantId=? AND isDeleted=0 AND companyGuid=?", [id, user.companyId]);
  if (!existing.length) throw new ApiError(404, "Model not found");

  if (mrp !== undefined) {
    await mysqlPool.query("UPDATE inventoryitemvariant SET sellingPrice=? WHERE itemVariantId=? AND companyGuid=?", [mrp, id, user.companyId]);
  }

  await logUserActivity(mysqlPool, user, "Update Model", [{ field: "sellingPrice", newValue: mrp }], request.headers.get("x-forwarded-for") || null);
  broadcastRealtimeEvent(user.companyId, "models");
  return NextResponse.json({ message: "Model updated" });
});
