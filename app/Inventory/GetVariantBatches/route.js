import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";
import { ensureNonSerializedBatchTable } from "@/lib/nonSerializedBatchMigration";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);
  requireCompany(user);
  await ensureNonSerializedBatchTable();

  const { searchParams } = new URL(request.url);
  const itemVariantId = searchParams.get("itemVariantId");
  if (!itemVariantId) {
    return NextResponse.json({ message: "itemVariantId is required" }, { status: 400 });
  }

  const [rows] = await mysqlPool.query(
    `SELECT b.guid, b.purchaseRate, b.qtyReceived, b.qtyRemaining, b.createdAt, g.godownName
     FROM inventorynonserializedbatch b
     LEFT JOIN godowns g ON b.godownGuid = g.guid
     WHERE b.itemVariantId = ? AND b.companyGuid = ? AND b.qtyRemaining > 0
     ORDER BY b.createdAt ASC`,
    [itemVariantId, user.companyId]
  );

  return NextResponse.json({ data: rows, total: rows.length, message: "Success" });
});
