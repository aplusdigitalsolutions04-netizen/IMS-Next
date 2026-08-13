import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeFbfFba } from "@/lib/fbfFbaAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeFbfFba(user, "PUT");
  const { guid } = await params;

  const { warehouseGuid, quantity, modelGuid, itemId } = await parseJsonBody(request);

  const [existing] = await mysqlPool.query("SELECT * FROM fbf_fba_stock WHERE guid = ? AND companyGuid = ?", [guid, user.companyId]);
  if (existing.length === 0) throw new ApiError(404, "Stock record not found");

  const currentRecord = existing[0];

  let finalQuantity = currentRecord.quantity;
  if (currentRecord.itemKind === "nonSerialized") {
    finalQuantity = quantity !== undefined ? Number(quantity) : currentRecord.quantity;
  }

  await mysqlPool.query(
    `UPDATE fbf_fba_stock
     SET warehouseGuid = COALESCE(?, warehouseGuid),
         quantity = ?,
         modelGuid = COALESCE(?, modelGuid),
         itemId = COALESCE(?, itemId),
         lastUpdated = NOW()
     WHERE guid = ? AND companyGuid = ?`,
    [warehouseGuid || null, finalQuantity, modelGuid || null, itemId || null, guid, user.companyId]
  );

  return NextResponse.json({ message: "Stock updated successfully" });
});
