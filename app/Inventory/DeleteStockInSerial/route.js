import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureDeletedByColumns } from "@/lib/deletedItemsMigration";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);
  await ensureDeletedByColumns();

  const { serialId } = body;
  await mysqlPool.execute(
    "UPDATE inventorystockinserial SET isDeleted = 1, deletedBy = ?, deletedAt = NOW() WHERE serialId = ?",
    [user.username || user.fullName || "Unknown", serialId]
  );
  return NextResponse.json({ message: "Success" });
});
