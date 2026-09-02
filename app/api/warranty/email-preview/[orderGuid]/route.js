import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeWarranty } from "@/lib/warrantyAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Returns rendered email subject/body/to/cc/bcc for a given order
export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "GET");
  const { orderGuid } = await params;
  const templateGuid = new URL(request.url).searchParams.get("templateGuid");

  const [orderRows] = await mysqlPool.query(`
    SELECT
      o.guid AS orderGuid, o.orderid AS orderNumber,
      o.orderDate, o.dispatchDate,
      o.platform, o.gemOrderType, o.bidNumber,
      o.customerName AS customer, o.consigneeName,
      o.buyerEmail, o.consigneeEmail, o.paymentAuthorityEmail,
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
    SELECT s.serialNumber FROM order_items oi
    LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid = s.guid AND s.companyGuid = oi.companyGuid
    WHERE oi.orderGuid = ? AND s.serialNumber IS NOT NULL AND oi.companyGuid = ? ORDER BY s.serialNumber
  `, [orderGuid, user.companyId]);
  order.allSerials = allSerialRows.map((r) => r.serialNumber).join(", ");
  order.serialCount = allSerialRows.length || order.quantity || 1;

  const [tplRows] = await mysqlPool.query("SELECT * FROM warranty_template WHERE companyGuid=? LIMIT 1", [user.companyId]);
  const defaultTemplate = tplRows[0] || {};

  // A specific chosen template (from the "Choose Template" picker, any
  // purpose) overrides subject/body AND its own CC/BCC when it has them set
  // — only falls back to the warranty template master's CC/BCC if the
  // chosen template didn't specify any.
  let template = defaultTemplate;
  let chosenPurpose = null;
  if (templateGuid) {
    const [chosenRows] = await mysqlPool.query(
      `SELECT emailSubject, emailBody, emailCc, emailBcc, purpose FROM email_templates
       WHERE guid = ? AND isActive = 1 AND (companyGuid = ? OR companyGuid IS NULL)`,
      [templateGuid, user.companyId]
    );
    if (chosenRows.length > 0) {
      const chosen = chosenRows[0];
      chosenPurpose = chosen.purpose;
      template = {
        ...defaultTemplate,
        emailSubject: chosen.emailSubject,
        emailBody: chosen.emailBody,
        emailCc: chosen.emailCc || defaultTemplate.emailCc,
        emailBcc: chosen.emailBcc || defaultTemplate.emailBcc,
      };
    }
  }

  const wp = order.warranty || "1 Year";
  const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
  let expiry = "";
  try {
    const base = new Date(order.dispatchDate || order.orderDate || Date.now());
    const num = parseInt(wp) || 1;
    const isMon = /month/i.test(wp);
    if (isMon) { base.setMonth(base.getMonth() + num); } else { base.setFullYear(base.getFullYear() + num); }
    expiry = fmt(base);
  } catch {}

  const gem = order.bidNumber || order.orderNumber || order.invoiceNumber || "";
  const emailVars = {
    "{{COMPANY_NAME}}": template.companyName || "",
    "{{GEM_NUMBER}}": gem,
    "{{BID_NUMBER}}": gem,
    "{{ORDER_NUMBER}}": String(order.orderNumber || ""),
    "{{INVOICE_NUMBER}}": order.invoiceNumber || "",
    "{{CUSTOMER_NAME}}": order.customer || order.consigneeName || "",
    "{{CONSIGNEE_NAME}}": order.consigneeName || order.customer || "",
    "{{ADDRESS}}": (order.shippingAddress || order.address || order.buyerAddress || "").replace(/\n/g, " "),
    "{{CONTACT_NUMBER}}": order.contactNumber || "",
    "{{MODEL_NAME}}": order.modelName || "",
    "{{SERIAL_NUMBER}}": order.serialValue || "",
    "{{SERIAL_NUMBERS}}": order.allSerials || order.serialValue || "",
    "{{QUANTITY}}": String(order.serialCount || order.quantity || ""),
    "{{PURCHASE_DATE}}": fmt(order.orderDate),
    "{{DISPATCH_DATE}}": fmt(order.dispatchDate) || fmt(order.orderDate),
    "{{WARRANTY_PERIOD}}": wp,
    "{{WARRANTY_EXPIRY}}": expiry,
    "{{GST_NUMBER}}": order.gstNumber || "",
    "{{CERT_NUMBER}}": "WC-" + String(order.orderNumber || "").padStart(6, "0"),
    // Aliases for the more generic placeholder names used by non-warranty
    // templates (Dispatch/Payment/etc.) — same underlying order data, just a
    // different name so those templates fill in too, not just warranty ones.
    "{{ORDER_ID}}": String(order.orderNumber || ""),
    "{{PRODUCT_NAME}}": order.modelName || "",
    "{{AMOUNT}}": order.sellingPrice != null ? Number(order.sellingPrice).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
  };

  const fillText = (text) => {
    if (!text) return "";
    let out = text;
    for (const [k, v] of Object.entries(emailVars)) {
      out = out.split(k).join(v || "");
    }
    return out;
  };

  // For a "payment" purpose template, the natural recipient is whoever
  // handles payment on the buyer's side, not the delivery consignee.
  const to = chosenPurpose === "payment"
    ? (order.paymentAuthorityEmail || order.consigneeEmail || order.buyerEmail || template.emailTo || "")
    : (order.consigneeEmail || order.buyerEmail || template.emailTo || "");

  const subject = fillText(template.emailSubject || "");
  const body = fillText(template.emailBody || "");

  // Anything still in {{...}} form after fillText() isn't one of the fixed
  // vars above — rather than silently leaving literal "{{FOO}}" text in the
  // sent email, surface these so the compose UI can prompt the user for a
  // value. This is also how a template author gets a brand-new variable:
  // just write {{ANYTHING}} in the template — no separate place to
  // "register" it first.
  const unresolvedVariables = [...new Set([...subject.matchAll(/\{\{([A-Z0-9_]+)\}\}/g), ...body.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]))];

  return NextResponse.json({
    to,
    cc: template.emailCc || "",
    bcc: template.emailBcc || "",
    subject,
    body,
    unresolvedVariables,
  });
});
