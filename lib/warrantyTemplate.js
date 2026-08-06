// ── Default certificate body — matches the Word letter-head.docx layout ──────
export const DEFAULT_CERT_HTML = `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4;color:#000;padding:14px 28px 20px 28px;">

  <p style="margin:0 0 2px 0;"><strong>Reference No.:</strong> {{GEM_NUMBER}}</p>
  <p style="margin:0 0 12px 0;"><strong>Date:</strong> {{DISPATCH_DATE}}</p>

  <p style="margin:0 0 2px 0;"><strong>To</strong></p>
  <p style="margin:0 0 12px 0;font-weight:bold;">{{TO_ADDRESS}}</p>

  <p style="margin:0 0 12px 0;text-align:center;font-weight:bold;text-decoration:underline;font-size:12pt;letter-spacing:0.5px;">WARRANTY CERTIFICATE</p>

  <p style="margin:0 0 10px 0;"><strong>Subject:</strong> Warranty Certificate &ndash; Contract No. {{GEM_NUMBER}}</p>

  <p style="margin:0 0 10px 0;"><strong>Respected Sir/Madam,</strong></p>

  <p style="margin:0 0 10px 0;">This is to certify that the equipment supplied under the above-mentioned contract is covered under warranty by the OEM as per the details below:</p>

  <p style="margin:0 0 6px 0;"><strong>Invoice No. : {{INVOICE_NUMBER}}</strong></p>

  <p style="margin:0 0 2px 0;"><strong>Product Details :</strong></p>
  <p style="margin:0 0 2px 0;"><strong>Product Name :</strong> {{MODEL_NAME}} Printer with {{WARRANTY_PERIOD}} Warranty ({{QUANTITY}} unit/units)</p>
  <p style="margin:0 0 10px 0;"><strong>Serial Numbers :</strong> {{SERIAL_NUMBERS}}.</p>

  <p style="margin:0 0 4px 0;"><strong>Warranty Terms &amp; Conditions:</strong></p>
  <p style="margin:0 0 3px 0;">1. The product is warranted against manufacturing defects for a period of {{WARRANTY_PERIOD}} from the date of supply {{DISPATCH_DATE}}.</p>
  <p style="margin:0 0 3px 0;">2. During the warranty period, any defective part will be repaired or replaced free of cost.</p>
  <p style="margin:0 0 3px 0;">3. The warranty does not cover damages resulting from mishandling, improper installation by unauthorized personnel, or external electrical fluctuations beyond specified limits.</p>
  <p style="margin:0 0 10px 0;">4. Post-warranty service support and spare parts will be available through the authorized service center on a chargeable basis.</p>

  <p style="margin:0 0 12px 0;"><strong>This certificate is issued in compliance with the contract terms and conditions and remains valid for the specified warranty period from the date of supply. ({{DISPATCH_DATE}})</strong></p>

  <p style="margin:0 0 2px 0;"><strong>Thanks &amp; Regards,</strong></p>
  <p style="margin:0 0 4px 0;">For <strong>A PLUS DIGITAL SOLUTIONS</strong></p>

  {{SIGNATURE_STAMP}}

  <p style="margin:4px 0 0 0;">(Authorized Signatory)</p>
</div>`;

export function renderTemplate(htmlBody, template, order) {
  const warrantyPeriod = order.warranty || "1 Year";
  const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

  let expiryDate = "";
  try {
    const base = new Date(order.dispatchDate || order.orderDate || Date.now());
    const num = parseInt(warrantyPeriod) || 1;
    const isMonths = /month/i.test(warrantyPeriod);
    if (isMonths) {
      base.setMonth(base.getMonth() + num);
    } else {
      base.setFullYear(base.getFullYear() + num);
    }
    expiryDate = fmt(base);
  } catch {}

  const gemNumber = order.bidNumber || order.orderNumber || order.invoiceNumber || "";
  const toAddress = [order.consigneeName || order.customer || "", order.shippingAddress || order.address || order.buyerAddress || ""].filter(Boolean).join("<br>");

  const vars = {
    "{{COMPANY_NAME}}": template.companyName || "",
    "{{COMPANY_ADDRESS}}": template.companyAddress || "",
    "{{COMPANY_PHONE}}": template.companyPhone || "",
    "{{COMPANY_EMAIL}}": template.companyEmail || "",
    "{{COMPANY_GSTIN}}": template.companyGstin || "",
    "{{GEM_NUMBER}}": gemNumber,
    "{{BID_NUMBER}}": gemNumber,
    "{{CONTRACT_NO}}": gemNumber,
    "{{ORDER_NUMBER}}": String(order.orderNumber || order.orderid || ""),
    "{{INVOICE_NUMBER}}": order.invoiceNumber || "",
    "{{CUSTOMER_NAME}}": order.customer || order.customerName || "",
    "{{CONSIGNEE_NAME}}": order.consigneeName || order.customer || "",
    "{{ADDRESS}}": (order.shippingAddress || order.address || order.buyerAddress || "").replace(/\n/g, "<br>"),
    "{{TO_ADDRESS}}": toAddress,
    "{{CONTACT_NUMBER}}": order.contactNumber || "",
    "{{MODEL_NAME}}": order.modelName || "",
    "{{SERIAL_NUMBER}}": order.serialValue || "",
    "{{SERIAL_NUMBERS}}": order.allSerials || order.serialValue || "",
    "{{QUANTITY}}": String(order.quantity || order.serialCount || ""),
    "{{PURCHASE_DATE}}": fmt(order.orderDate),
    "{{DISPATCH_DATE}}": fmt(order.dispatchDate) || fmt(order.orderDate),
    "{{WARRANTY_PERIOD}}": warrantyPeriod,
    "{{WARRANTY_EXPIRY}}": expiryDate,
    "{{SELLING_PRICE}}": order.sellingPrice ? `₹${Number(order.sellingPrice).toLocaleString("en-IN")}` : "",
    "{{GST_NUMBER}}": order.gstNumber || "",
    "{{CERT_NUMBER}}": `WC-${String(order.orderNumber || order.orderid || "").padStart(6, "0")}`,
    "{{SIGNATURE_STAMP}}": template.signatureImageUrl
      ? `<img src="${template.signatureImageUrl}" style="max-height:90px;max-width:220px;height:auto;width:auto;display:block;" />`
      : "",
  };

  let html = htmlBody;
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(k).join(v || "");
  }
  return html;
}
