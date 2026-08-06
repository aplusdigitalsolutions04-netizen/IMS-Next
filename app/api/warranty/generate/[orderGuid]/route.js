import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeWarranty } from "@/lib/warrantyAuth";
import { uploadDir } from "@/lib/upload";
import { DEFAULT_CERT_HTML, renderTemplate } from "@/lib/warrantyTemplate";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "GET");
  const { orderGuid } = await params;

  const [orderRows] = await mysqlPool.query(`
    SELECT
      o.guid AS orderGuid, o.orderid AS orderNumber,
      o.orderDate, o.dispatchDate,
      o.platform, o.gemOrderType, o.bidNumber,
      o.customerName AS customer, o.consigneeName,
      o.shippingAddress, o.address, o.buyerAddress,
      o.contactNumber, o.altContactNumber,
      o.invoiceNumber, o.gstNumber,
      oi.sellingPrice, oi.warranty, oi.quantity,
      s.serialNumber AS serialValue,
      fbiv.variantName AS modelName, fbbm.brandName AS companyName
    FROM orders o
    LEFT JOIN order_items oi ON oi.orderGuid = o.guid AND oi.companyGuid = o.companyGuid
    LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid = s.guid AND s.companyGuid = o.companyGuid
    LEFT JOIN inventoryitemvariant fbiv ON s.itemVariantId = fbiv.itemVariantId AND fbiv.companyGuid = o.companyGuid
    LEFT JOIN inventoryitemmaster fbim ON fbiv.itemId = fbim.itemId AND fbim.companyGuid = o.companyGuid
    LEFT JOIN inventorybrandmaster fbbm ON fbim.brandId = fbbm.brandId AND fbbm.companyGuid = o.companyGuid
    WHERE o.guid = ? AND o.companyGuid = ?
    LIMIT 1
  `, [orderGuid, user.companyId]);

  if (!orderRows.length) throw new ApiError(404, "Order not found");
  const order = orderRows[0];

  const [allSerialRows] = await mysqlPool.query(`
    SELECT s.serialNumber
    FROM order_items oi
    LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid = s.guid AND s.companyGuid = oi.companyGuid
    WHERE oi.orderGuid = ? AND s.serialNumber IS NOT NULL AND oi.companyGuid = ?
    ORDER BY s.serialNumber
  `, [orderGuid, user.companyId]);
  order.allSerials = allSerialRows.map((r) => r.serialNumber).join(", ");
  order.serialCount = allSerialRows.length || order.quantity || 1;

  const [tplRows] = await mysqlPool.query("SELECT * FROM warranty_template WHERE companyGuid=? LIMIT 1", [user.companyId]);
  const template = tplRows[0] || {};

  const loadImageAsDataUrl = (relativePath, label) => {
    try {
      const imgPath = path.join(uploadDir, relativePath);
      if (!fs.existsSync(imgPath)) return null;
      const imgBuf = fs.readFileSync(imgPath);
      const ext = path.extname(relativePath).toLowerCase().slice(1);
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : `image/${ext}`;
      return `data:${mime};base64,${imgBuf.toString("base64")}`;
    } catch (e) {
      console.warn(`[warranty] Could not load ${label} image:`, e.message);
      return null;
    }
  };

  const headerImgUrl = template.headerImagePath ? loadImageAsDataUrl(template.headerImagePath, "header") : null;
  template.signatureImageUrl = template.signatureImagePath ? loadImageAsDataUrl(template.signatureImagePath, "signature/stamp") : null;

  const [existing] = await mysqlPool.query(
    "SELECT guid, htmlContent, status FROM wc_certs WHERE orderGuid=? AND companyGuid=? ORDER BY createdAt DESC LIMIT 1",
    [orderGuid, user.companyId]
  );

  let html, certGuid = null, certStatus = "draft";
  if (existing.length > 0) {
    html = existing[0].htmlContent;
    certGuid = existing[0].guid;
    certStatus = existing[0].status;
  } else {
    const isStale = !template.htmlBody || template.htmlBody.includes("{{HEADER_IMAGE}}");
    const bodyTemplate = isStale ? DEFAULT_CERT_HTML : template.htmlBody;

    if (isStale) {
      mysqlPool.query("UPDATE warranty_template SET htmlBody=?, headerHtml=NULL WHERE companyGuid=?", [DEFAULT_CERT_HTML, user.companyId]).catch(() => {});
    }

    const bodyHtml = renderTemplate(bodyTemplate, template, order);

    html = headerImgUrl
      ? `<div style="margin:0;padding:0;line-height:0;font-size:0;width:100%;display:block;">`
        + `<img src="${headerImgUrl}" style="display:block;width:100%;height:auto;border:0;" />`
        + `</div>${bodyHtml}`
      : bodyHtml;
  }

  return NextResponse.json({ orderData: order, html, certGuid, certStatus });
});
