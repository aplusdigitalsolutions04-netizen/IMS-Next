import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeFbfFbaMaster } from "@/lib/fbfFbaMasterAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeFbfFbaMaster(user, "GET");
  requireCompany(user);

  const [rows] = await mysqlPool.query(`
    SELECT * FROM fbf_fba_warehouses
    WHERE isDeleted = 0 AND companyGuid = ?
    ORDER BY platform ASC, state ASC, warehouseName ASC
  `, [user.companyId]);
  return NextResponse.json(rows);
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeFbfFbaMaster(user, "POST");
  requireCompany(user);

  const { platform, state, warehouseName, warehouseAddress } = await parseJsonBody(request);
  if (!platform || !state || !warehouseName) throw new ApiError(400, "Platform, State and Warehouse Name are required.");

  const newGuid = uuidv4();
  await mysqlPool.query(
    "INSERT INTO fbf_fba_warehouses (guid, platform, state, warehouseName, warehouseAddress, companyGuid) VALUES (?, ?, ?, ?, ?, ?)",
    [newGuid, platform, state, warehouseName, warehouseAddress || "", user.companyId]
  );
  return NextResponse.json({ message: "Warehouse added successfully", guid: newGuid });
});
