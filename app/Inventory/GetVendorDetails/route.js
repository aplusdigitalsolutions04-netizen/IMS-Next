import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);

  const vendorId = new URL(request.url).searchParams.get("vendorId");
  const [rows] = await mysqlPool.query("SELECT * FROM inventoryvendor WHERE vendorId = ? AND companyGuid = ?", [vendorId, user.companyId]);
  if (rows.length === 0) throw new ApiError(404, "Vendor not found");

  return NextResponse.json({ data: rows[0], message: "Success" });
});
