import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeFbfFbaMaster } from "@/lib/fbfFbaMasterAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeFbfFbaMaster(user, "PUT");
  requireCompany(user);
  const { guid } = await params;

  const { platform, state, warehouseName, warehouseAddress } = await parseJsonBody(request);
  if (!platform || !state || !warehouseName) throw new ApiError(400, "Platform, State and Warehouse Name are required.");

  await mysqlPool.query(
    "UPDATE fbf_fba_warehouses SET platform = ?, state = ?, warehouseName = ?, warehouseAddress = ? WHERE guid = ? AND companyGuid = ?",
    [platform, state, warehouseName, warehouseAddress || "", guid, user.companyId]
  );
  return NextResponse.json({ message: "Warehouse updated successfully" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeFbfFbaMaster(user, "DELETE");
  requireCompany(user);
  const { guid } = await params;

  await mysqlPool.query("UPDATE fbf_fba_warehouses SET isDeleted = 1 WHERE guid = ? AND companyGuid = ?", [guid, user.companyId]);
  return NextResponse.json({ message: "Warehouse deleted successfully" });
});
