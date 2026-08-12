import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);
  requireCompany(user);

  const { optionId } = body;
  await mysqlPool.execute(
    `UPDATE dropdown_option o
     JOIN dropdown_master m ON o.dropdown_id = m.id
     SET o.is_active = 0
     WHERE o.id = ? AND m.companyGuid = ?`,
    [optionId, user.companyId]
  );
  return NextResponse.json({ message: "Success" });
});
