import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeSerials } from "@/lib/serialsAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeSerials(user, "GET");
  const { id: serialId } = await params;

  const [serials] = await mysqlPool.query(`
    SELECT s.guid, s.serialNumber as serialValue, s.serialStatus as currentStatus, s.returnCount, s.createdAt,
           s.itemVariantId as modelId, fbiv.variantName as modelName, fbbm.brandName as companyName
    FROM inventorystockinserial s
    LEFT JOIN inventoryitemvariant fbiv ON s.itemVariantId=fbiv.itemVariantId
    LEFT JOIN inventoryitemmaster fbim ON fbiv.itemId=fbim.itemId
    LEFT JOIN inventorybrandmaster fbbm ON fbim.brandId=fbbm.brandId
    WHERE s.guid=? AND s.isDeleted=0 AND s.companyGuid=?
  `, [serialId, user.companyId]);
  if (!serials.length) throw new ApiError(404, "Serial not found");

  const [history] = await mysqlPool.query(`
    SELECT sm.*, o.dispatchDate, o.status as orderStatus, ol.logisticsStatus, ins.installationStatus, ins.installationRequired,
           COALESCE(o.platform, sm.firmName) as linkedFirmName, COALESCE(o.customerName, o.orderid, sm.customerName) as linkedCustomerName,
           COALESCE(o.shippingAddress, o.address) as linkedShippingAddress, COALESCE(o.invoiceNumber, sm.invoiceNumber) as linkedInvoiceNumber
    FROM serialmovements sm
    LEFT JOIN order_items oi ON oi.guid=sm.dispatchId
    LEFT JOIN orders o ON oi.orderGuid=o.guid
    LEFT JOIN order_logistics ol ON o.guid=ol.orderGuid
    LEFT JOIN order_installations ins ON o.guid=ins.orderGuid
    WHERE sm.serialNumberId=? AND sm.companyGuid=?
    ORDER BY sm.createdAt DESC, sm.guid DESC
  `, [serialId, user.companyId]);

  return NextResponse.json({ serial: serials[0], history });
});
