import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, ApiError, requireCompany, resolveScopedCompanyGuid } from "@/lib/auth";
import { authorizeSerials as authorize } from "@/lib/serialsAuth";
import { logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorize(user, "GET");

  const companyGuid = resolveScopedCompanyGuid(user, request);
  const c = (alias) => (companyGuid ? `AND ${alias}.companyGuid = ?` : "");
  const params = companyGuid ? Array(9).fill(companyGuid) : [];

  const [rows] = await mysqlPool.query(`
    SELECT s.*, s.guid as id, s.itemVariantId as modelId,
      COALESCE(itv.variantName, 'Unknown Item') as modelName,
      COALESCE(b.brandName, '') as companyName,
      COALESCE(c.categoryName, '') as modelCategory,
      g.godownName, g.godownAddress, g.godownName as warehouseName,
      g.godownAddress as warehouseAddress, s.godownGuid as warehouseGuid,
      iv.vendorFirmName as vendorName,
      lr.reason as latestReturnReason, lr.returnDate as latestReturnDate, lr.condition as latestReturnCondition,
      COALESCE(NULLIF(s.landingPrice, 0), itv.purchasePrice, 0) as landingPrice
    FROM inventorystockinserial s
    LEFT JOIN inventoryitemvariant itv ON s.itemVariantId=itv.itemVariantId AND itv.isDeleted=0 ${c("itv")}
    LEFT JOIN inventoryitemmaster i ON itv.itemId=i.itemId AND i.isDeleted=0 ${c("i")}
    LEFT JOIN inventorybrandmaster b ON i.brandId=b.brandId AND b.isDeleted=0 ${c("b")}
    LEFT JOIN inventorycategorymaster c ON i.categoryId=c.categoryId AND c.isDeleted=0 ${c("c")}
    LEFT JOIN godowns g ON s.godownGuid=g.guid AND g.isDeleted=0 ${c("g")}
    LEFT JOIN inventoryvendor iv ON s.vendorId=iv.vendorId AND iv.isDeleted=0 ${c("iv")}
    LEFT JOIN (
      SELECT r1.* FROM returns r1
      INNER JOIN (
        SELECT serialNumberGuid, MAX(returnDate) as maxDate, MAX(guid) as maxId FROM returns WHERE isDeleted=0 ${c("returns")} GROUP BY serialNumberGuid
      ) r2 ON r1.serialNumberGuid=r2.serialNumberGuid AND r1.returnDate=r2.maxDate AND r1.guid=r2.maxId
      WHERE 1=1 ${c("r1")}
    ) lr ON s.guid=lr.serialNumberGuid
    WHERE s.isDeleted=0 ${c("s")}
    ORDER BY s.createdAt DESC, s.guid DESC
  `, params);
  return NextResponse.json(rows);
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorize(user, "POST");

  const body = await parseJsonBody(request);
  const { modelId, value, status, landingPrice, landingPriceReason } = body;
  const godownGuid = body.godownGuid || body.warehouseGuid || null;

  const [check] = await mysqlPool.query("SELECT guid FROM inventorystockinserial WHERE serialNumber=? AND isDeleted=0 AND companyGuid = ?", [value, user.companyId]);
  if (check.length > 0) throw new ApiError(400, "Serial exists!");

  const newGuid = randomUUID();
  await mysqlPool.query(
    "INSERT INTO inventorystockinserial (serialId,guid,companyGuid,itemVariantId,godownGuid,serialNumber,serialStatus,landingPrice,landingPriceReason,isUsed,isDeleted,createdAt) VALUES (?,?,?,?,?,?,?,?,?,0,0,NOW())",
    [newGuid, newGuid, user.companyId, modelId, godownGuid, value, status || "Available", landingPrice || 0, landingPriceReason || null]
  );
  await logUserActivity(mysqlPool, user, "Add Serial", [{ field: "serialNumber", newValue: value }, { field: "modelId", newValue: modelId }], request.headers.get("x-forwarded-for") || null);
  broadcastRealtimeEvent(user.companyId, "serials");
  return NextResponse.json({ message: "Serial added" });
});
