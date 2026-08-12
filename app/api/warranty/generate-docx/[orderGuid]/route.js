import path from "path";
import { NextResponse } from "next/server";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import AdmZip from "adm-zip";
import mammoth from "mammoth";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeWarranty } from "@/lib/warrantyAuth";
import { readUploadedFileBuffer } from "@/lib/upload";
import { parseThemeColors, resolveThemeColorsInXml } from "@/lib/warrantyDocx";
import { withErrorHandling } from "@/lib/apiResponse";

// Fill the stored DOCX template with order data and return the filled .docx file.
export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "GET");
  const { orderGuid } = await params;

  const [tplRows] = await mysqlPool.query(
    "SELECT docxBinary, docxFileName, headerImagePath FROM warranty_template WHERE companyGuid=? LIMIT 1", [user.companyId]
  );
  if (!tplRows[0]?.docxBinary) {
    throw new ApiError(404, "No DOCX template configured. Upload a template in Warranty Template Master.");
  }

  const [orderRows] = await mysqlPool.query(`
    SELECT
      o.guid AS orderGuid, o.orderid AS orderNumber,
      o.orderDate, o.dispatchDate, o.platform, o.gemOrderType, o.bidNumber,
      o.customerName AS customer, o.consigneeName,
      o.shippingAddress, o.address, o.buyerAddress,
      o.contactNumber, o.invoiceNumber, o.gstNumber,
      oi.sellingPrice, oi.warranty, oi.quantity,
      s.serialNumber AS serialValue, fbiv.variantName AS modelName, fbbm.brandName AS companyName
    FROM orders o
    LEFT JOIN order_items oi ON oi.orderGuid = o.guid AND oi.companyGuid = o.companyGuid
    LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid = s.guid AND s.companyGuid = o.companyGuid
    LEFT JOIN inventoryitemvariant fbiv ON s.itemVariantId = fbiv.itemVariantId AND fbiv.companyGuid = o.companyGuid
    LEFT JOIN inventoryitemmaster fbim ON fbiv.itemId = fbim.itemId AND fbim.companyGuid = o.companyGuid
    LEFT JOIN inventorybrandmaster fbbm ON fbim.brandId = fbbm.brandId AND fbbm.companyGuid = o.companyGuid
    WHERE o.guid = ? AND o.companyGuid = ? LIMIT 1
  `, [orderGuid, user.companyId]);
  if (!orderRows.length) throw new ApiError(404, "Order not found");
  const order = orderRows[0];

  const [allSerialRows] = await mysqlPool.query(`
    SELECT s.serialNumber FROM order_items oi
    LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid = s.guid AND s.companyGuid = oi.companyGuid
    WHERE oi.orderGuid = ? AND s.serialNumber IS NOT NULL AND oi.companyGuid = ? ORDER BY s.serialNumber
  `, [orderGuid, user.companyId]);
  order.allSerials = allSerialRows.map((r) => r.serialNumber).join(", ");
  order.serialCount = allSerialRows.length || order.quantity || 1;

  const warrantyPeriod = order.warranty || "1 Year";
  const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
  const address = [
    order.consigneeName || order.customer || "",
    order.shippingAddress || order.address || order.buyerAddress || "",
  ].filter(Boolean).join("\n");

  const fields = {
    GEM_NUMBER: order.bidNumber || order.orderNumber || "",
    TO_ADDRESS: address,
    INVOICE_NUMBER: order.invoiceNumber || "",
    PRODUCT_NAME: order.modelName || "",
    SERIAL_NUMBERS: order.allSerials || order.serialValue || "",
    SERIAL_NUMBERS_COUNTS: String(order.serialCount || order.quantity || ""),
    DATE: fmt(order.orderDate),
    DISPATCH_DATE: fmt(order.dispatchDate || order.orderDate),
    WARRANTY_PERIOD: warrantyPeriod,
    QUANTITY: String(order.quantity || order.serialCount || ""),
    COMPANY_NAME: order.companyName || "",
    CUSTOMER_NAME: order.customer || order.consigneeName || "",
    CONSIGNEE_NAME: order.consigneeName || order.customer || "",
    MODEL_NAME: order.modelName || "",
    BID_NUMBER: order.bidNumber || order.orderNumber || "",
    CONTRACT_NO: order.bidNumber || order.orderNumber || "",
    ORDER_NUMBER: String(order.orderNumber || ""),
  };

  const renderData = {};
  for (const [k, v] of Object.entries(fields)) {
    renderData[k] = v;
    renderData[k.toLowerCase()] = v;
  }

  const zip = new PizZip(tplRows[0].docxBinary);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render(renderData);

  let buffer = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });

  try {
    const az = new AdmZip(buffer);
    const themeColors = parseThemeColors(az);
    if (Object.keys(themeColors).length > 0) {
      console.log("[warranty] Theme colors found:", themeColors);
      const resolveEntry = (name) => {
        const entry = az.getEntry(name);
        if (!entry) return;
        az.updateFile(name, Buffer.from(resolveThemeColorsInXml(az.readAsText(entry), themeColors), "utf8"));
      };
      resolveEntry("word/document.xml");
      resolveEntry("word/styles.xml");
      buffer = az.toBuffer();
    }
  } catch (themeErr) {
    console.warn("[warranty] Theme color resolution skipped:", themeErr.message);
  }

  const htmlResult = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const buf = await image.read("base64");
        return { src: `data:${image.contentType};base64,${buf}` };
      }),
    }
  );

  let previewHtml = htmlResult.value || "";

  if (tplRows[0].headerImagePath) {
    try {
      const imgBuf = await readUploadedFileBuffer(tplRows[0].headerImagePath);
      if (imgBuf) {
        const ext = path.extname(tplRows[0].headerImagePath).toLowerCase().slice(1);
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : `image/${ext}`;
        const imgSrc = `data:${mime};base64,${imgBuf.toString("base64")}`;
        previewHtml = `<div style="line-height:0;padding:0;margin:0 0 0 0;"><img src="${imgSrc}" style="max-width:100%;width:100%;height:auto;display:block;" /></div>${previewHtml}`;
      }
    } catch (imgErr) {
      console.warn("[warranty] Could not prepend header image:", imgErr.message);
    }
  }

  return NextResponse.json({
    docxBase64: buffer.toString("base64"),
    previewHtml,
    fileName: `warranty-${String(order.orderNumber || orderGuid).replace(/[^a-zA-Z0-9-_]/g, "")}.docx`,
  });
});
