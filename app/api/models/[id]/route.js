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
// Master itemVariantId now (see app/api/models/route.js GET). Price
// (sellingPrice) is Dispatch's inline price edit; packagingCost/package
// Length/Width/Height/Weight back Dispatch's "Packaging Cost & Dimensions"
// editor — both write straight to inventoryitemvariant, full spec editing
// otherwise lives in the Item Variant Master screens.
export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorize(user, "PUT");
  const { id } = await params;

  const { mrp, packagingCost, packageLength, packageWidth, packageHeight, packageWeight } = await parseJsonBody(request);

  const [existing] = await mysqlPool.query("SELECT itemVariantId FROM inventoryitemvariant WHERE itemVariantId=? AND isDeleted=0 AND companyGuid=?", [id, user.companyId]);
  if (!existing.length) throw new ApiError(404, "Model not found");

  const changes = [];
  if (mrp !== undefined) {
    await mysqlPool.query("UPDATE inventoryitemvariant SET sellingPrice=? WHERE itemVariantId=? AND companyGuid=?", [mrp, id, user.companyId]);
    changes.push({ field: "sellingPrice", newValue: mrp });
  }
  if (packagingCost !== undefined || packageLength !== undefined || packageWidth !== undefined || packageHeight !== undefined || packageWeight !== undefined) {
    await mysqlPool.query(
      `UPDATE inventoryitemvariant
       SET packagingCost = ?, packageLength = ?, packageWidth = ?, packageHeight = ?, packageWeight = ?
       WHERE itemVariantId=? AND companyGuid=?`,
      [packagingCost ?? 0, packageLength ?? null, packageWidth ?? null, packageHeight ?? null, packageWeight ?? null, id, user.companyId]
    );
    changes.push({ field: "packagingCost", newValue: packagingCost });
  }

  await logUserActivity(mysqlPool, user, "Update Model", changes, request.headers.get("x-forwarded-for") || null);
  broadcastRealtimeEvent(user.companyId, "models");
  return NextResponse.json({ message: "Model updated" });
});
