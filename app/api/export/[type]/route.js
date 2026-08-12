import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeReadWrite, ApiError } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeReadWrite(user, "GET", { permission: "dashboard", denyMessage: "You do not have access to exports." });
  const { type } = await params;

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "csv";
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const sqlParams = [];
  let query, filename;

  switch (type) {
    case "models":
      query = `
        SELECT itv.variantName as name, b.brandName as company, c.categoryName as category,
          i.itemName as description, itv.sellingPrice as mrp, 0 as stockQuantity,
          (SELECT GROUP_CONCAT(CONCAT(dm.dropdown_name, ': ', sv.value) SEPARATOR '; ')
           FROM inventoryitemvariantspecvalue sv
           JOIN dropdown_master dm ON sv.specificationId = dm.id
           WHERE sv.itemVariantId = itv.itemVariantId) AS specifications,
          COUNT(s.guid) as totalSerials, SUM(CASE WHEN s.serialStatus='Available' THEN 1 ELSE 0 END) as availableSerials
        FROM inventoryitemvariant itv
        LEFT JOIN inventoryitemmaster i ON itv.itemId=i.itemId
        LEFT JOIN inventorybrandmaster b ON i.brandId=b.brandId
        LEFT JOIN inventorycategorymaster c ON i.categoryId=c.categoryId
        LEFT JOIN inventorystockinserial s ON s.itemVariantId=itv.itemVariantId AND s.isDeleted=0
        WHERE itv.isDeleted=0 GROUP BY itv.itemVariantId, itv.variantName, b.brandName, c.categoryName, i.itemName, itv.sellingPrice
        ORDER BY itv.variantName
      `;
      filename = "models";
      break;

    case "serials":
      // NOTE: mrp previously came from the legacy `models` table (COALESCE(m.mrp, 0)).
      // inventoryitemvariant has no equivalent mrp column, so this is now always 0.
      query = `
        SELECT s.serialNumber as serialNumber, fbiv.variantName as modelName, fbbm.brandName as company, s.landingPrice, 0 as mrp,
          s.landingPriceReason, s.serialStatus as status, s.createdAt
        FROM inventorystockinserial s
        LEFT JOIN inventoryitemvariant fbiv ON s.itemVariantId=fbiv.itemVariantId AND fbiv.isDeleted=0
        LEFT JOIN inventoryitemmaster fbim ON fbiv.itemId=fbim.itemId AND fbim.isDeleted=0
        LEFT JOIN inventorybrandmaster fbbm ON fbim.brandId=fbbm.brandId AND fbbm.isDeleted=0
        WHERE s.isDeleted=0 ORDER BY s.createdAt DESC
      `;
      filename = "serials";
      break;

    case "dispatches":
      query = `
        SELECT o.dispatchDate, o.platform AS firmName, o.orderid as customer,
          COALESCE(o.address,o.shippingAddress) as address,
          oi.sellingPrice, o.packagingCost, o.commission, s.serialNumber as serialNumber,
          fbiv.variantName as modelName, fbbm.brandName as company, o.status, ins.installationRequired, ins.installationStatus,
          ol.courierPartner, ol.trackingId, o.freightCharges, ol.logisticsStatus, o.ewayBillFilename
        FROM order_items oi JOIN orders o ON oi.orderGuid=o.guid
        LEFT JOIN order_logistics ol ON o.guid=ol.orderGuid
        LEFT JOIN order_installations ins ON o.guid=ins.orderGuid
        LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid=s.guid
        LEFT JOIN inventoryitemvariant fbiv ON s.itemVariantId=fbiv.itemVariantId AND fbiv.isDeleted=0
        LEFT JOIN inventoryitemmaster fbim ON fbiv.itemId=fbim.itemId AND fbim.isDeleted=0
        LEFT JOIN inventorybrandmaster fbbm ON fbim.brandId=fbbm.brandId AND fbbm.isDeleted=0
        WHERE o.isDeleted=0
      `;
      if (startDate && endDate) {
        query += " AND o.dispatchDate>=? AND o.dispatchDate<=?";
        sqlParams.push(`${startDate.split("T")[0]} 00:00:00`, `${endDate.split("T")[0]} 23:59:59`);
      }
      query += " ORDER BY o.dispatchDate DESC";
      filename = "dispatches";
      break;

    case "returns":
      query = `
        SELECT r.returnDate, s.serialNumber as serialNumber, fbiv.variantName as modelName, r.condition,
          r.dispatchGuid as orderId, r.invoiceNumber, r.reason
        FROM returns r
        JOIN inventorystockinserial s ON r.serialNumberGuid=s.guid
        LEFT JOIN inventoryitemvariant fbiv ON s.itemVariantId=fbiv.itemVariantId AND fbiv.isDeleted=0
        WHERE r.isDeleted=0 ORDER BY r.returnDate DESC
      `;
      filename = "returns";
      break;

    default:
      throw new ApiError(400, "Invalid export type");
  }

  const [data] = await mysqlPool.query(query, sqlParams);
  if (!data.length) throw new ApiError(404, "No data to export");

  if (format === "csv") {
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map((row) => Object.values(row).map((v) => `"${v ?? ""}"`).join(","));
    return new NextResponse([headers, ...rows].join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=${filename}.csv`,
      },
    });
  }

  return NextResponse.json(data);
});
