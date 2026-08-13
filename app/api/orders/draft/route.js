import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, requireCompany, ApiError } from "@/lib/auth";
import { safeStr } from "@/lib/helpers";
import { validateBody } from "@/lib/validate";

// Only `products` was previously checked (array, non-empty) — every other
// field flowed straight into an INSERT with no shape/type guarantee. This
// doesn't change what's *required* (everything but products stays optional,
// matching current behavior for contracts missing some fields), just what
// happens when a field IS present but the wrong type.
const productSchema = z.object({
  productName: z.string().nullish(),
  brand: z.string().nullish(),
  model: z.string().nullish(),
  categoryQuadrant: z.string().nullish(),
  hsnCode: z.string().nullish(),
  quantity: z.coerce.number().nullish(),
  unitPrice: z.coerce.number().nullish(),
  totalValue: z.coerce.number().nullish(),
  itemVariantId: z.string().nullish(),
});
const bodySchema = z.object({
  bidNumber: z.string().nullish(),
  contractNumber: z.string().nullish(),
  generatedDate: z.string().nullish(),
  buyerContact: z.string().nullish(),
  buyerEmail: z.string().nullish(),
  buyerGstin: z.string().nullish(),
  buyerAddress: z.string().nullish(),
  consigneeEmail: z.string().nullish(),
  consigneeAddress: z.string().nullish(),
  organisation: z.string().nullish(),
  deliveryStartAfter: z.string().nullish(),
  deliveryCompletedBy: z.string().nullish(),
  pdfFilename: z.string().nullish(),
  products: z.array(productSchema).min(1, "At least one product is required to create an order draft."),
  platformFields: z.record(z.any()).nullish(),
});

// Contract-extracted dates arrive as full ISO timestamps (e.g. "2026-07-08T18:30:00.000Z")
// which MySQL rejects for DATE columns — reduce to a plain YYYY-MM-DD.
const toDateOnly = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";
import { createNotification } from "@/lib/notifications";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Creates a "Draft" order straight from a Contract's extracted data — no
// serial numbers exist yet (nothing has been picked/dispatched), so
// order_items are inserted with serialNumberGuid/modelGuid left null and the
// product description kept in `remarks` instead. Shows up in Order
// Processing's Draft tab (orders.status = 'Draft') until it's actually
// dispatched with real serials later.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  // Creating a draft straight from a contract is Contracts-tab work, not
  // general Order Processing — "contracts" view access is enough on its own
  // (unlike the rest of Order Processing, which stays gated behind the
  // separate allow_create_order/allow_edit_order_processing edit-flags).
  requirePermission(user, "contracts", "You do not have permission to create order drafts.");

  const rawBody = await parseJsonBody(request);
  const {
    bidNumber, contractNumber, generatedDate, buyerContact, buyerEmail, buyerGstin, buyerAddress,
    consigneeEmail, consigneeAddress, organisation,
    deliveryStartAfter, deliveryCompletedBy,
    pdfFilename, products,
  } = validateBody(bodySchema, rawBody);

  // Try to match each contract product against an existing catalog model (by
  // name) so the Confirm-Order step can pre-select it instead of forcing the
  // user to pick it manually every time.
  const [catalogModels] = await mysqlPool.query(
    "SELECT itemVariantId as guid, variantName as name FROM inventoryitemvariant WHERE companyGuid = ? AND isDeleted = 0",
    [user.companyId]
  );
  // Contract text is free-form ("HP LaserJet Pro3004dw Printer with 1 year
  // Warranty") while catalog model names are short ("HP 3004dw"), so an
  // exact-string match almost never hits. Instead, require every
  // alphanumeric "word" of the catalog model name to appear somewhere in
  // the product's combined text (as a substring, so "3004dw" still matches
  // inside "pro3004dw").
  const alnum = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const catalogGuids = new Set(catalogModels.map((catalogModel) => catalogModel.guid));
  const matchModelGuid = (product) => {
    // If the product was already explicitly linked to a model — via the
    // Contract Save / Draft Order "Add Product" wizard, or the "Use Existing
    // Model" choice — that resolution is authoritative and must win over any
    // re-guessing here, otherwise the user's explicit pick gets silently
    // discarded in favor of (possibly wrong, or no) fuzzy text matching.
    if (product.itemVariantId && catalogGuids.has(product.itemVariantId)) return product.itemVariantId;
    const blob = alnum([product.productName, product.brand, product.model].filter(Boolean).join(" "));
    if (!blob) return null;
    const found = catalogModels.find((catalogModel) => {
      const words = String(catalogModel.name || "").toLowerCase().split(/\s+/).map(alnum).filter(Boolean);
      return words.length > 0 && words.every((word) => blob.includes(word));
    });
    return found ? found.guid : null;
  };

  // Every product must resolve to a real Item Master catalog entry before
  // any draft is created — an unmatched product means the item hasn't been
  // added to Item Master yet, and confirming a draft later requires a real
  // model, so better to fail fast here (and tell the admin exactly what's
  // missing) than create a draft item that can never be confirmed.
  const productLabel = (product) => [product.productName, product.brand, product.model].filter(Boolean).join(" — ") || "Unnamed product";
  const unmatched = products.filter((p) => !matchModelGuid(p)).map(productLabel);
  if (unmatched.length > 0) {
    throw new ApiError(
      400,
      `These products aren't in Item Master yet — add them there first, then create the draft again: ${unmatched.join(", ")}`
    );
  }

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();

    const orderId = randomUUID();
    const displayName = safeStr(organisation) || safeStr(contractNumber) || `DRAFT-${Date.now()}`;
    const orderid = safeStr(contractNumber) || displayName;

    await conn.query(
      `INSERT INTO orders
         (guid,companyGuid,orderid,platform,customerName,buyerEmail,consigneeEmail,
          address,shippingAddress,buyerAddress,dispatchedBy,status,gemOrderType,bidNumber,
          orderDate,gstNumber,contactNumber,paymentAuthorityEmail,orderVerified,remarks,dispatchDate,platformFields)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?)`,
      [orderId, user.companyId, orderid, "GeM", displayName, buyerEmail || null,
        consigneeEmail || null, buyerAddress || null, consigneeAddress || null, buyerAddress || null,
        user.username || "System", "Draft", "Direct Order", bidNumber || null,
        toDateOnly(generatedDate), buyerGstin || null, buyerContact || null, buyerEmail || null,
        "No",
        `Draft created from Contract #${contractNumber || orderId}${deliveryStartAfter ? ` — delivery window ${deliveryStartAfter} to ${deliveryCompletedBy || "?"}` : ""}`,
        rawBody.platformFields ? JSON.stringify(rawBody.platformFields) : null]
    );
    await conn.query(
      `INSERT INTO order_logistics (orderGuid, companyGuid, lastDeliveryDate, logisticsStatus) VALUES (?, ?, ?, NULL)`,
      [orderId, user.companyId, toDateOnly(deliveryCompletedBy)]
    );
    await conn.query(
      `INSERT INTO order_installations (orderGuid, companyGuid, installationRequired) VALUES (?, ?, ?)`,
      [orderId, user.companyId, "No"]
    );

    // Contract text often carries the warranty period alongside the model
    // name ("...Pro3004dw Printer with 1 year Warranty") — pull it out so it
    // doesn't have to be re-entered by hand.
    const extractWarranty = (product) => {
      const text = [product.productName, product.model].filter(Boolean).join(" ");
      const match = text.match(/(\d+)\s*[-]?\s*(year|yr|month|mo)s?\b/i);
      if (!match) return null;
      const num = match[1];
      const isYear = /year|yr/i.test(match[2]);
      const unit = isYear ? "Year" : "Month";
      return `${num} ${unit}${num === "1" ? "" : "s"}`;
    };

    const orderItemRows = products.map((product) => {
      const modelGuid = matchModelGuid(product);
      return [
        randomUUID(), user.companyId, orderId, modelGuid, modelGuid,
        Number(product.unitPrice) || 0, Number(product.quantity) || 1,
        pdfFilename || null, productLabel(product) || null, extractWarranty(product),
      ];
    });
    await conn.query(
      `INSERT INTO order_items
         (guid,companyGuid,orderGuid,modelGuid,itemVariantId,sellingPrice,quantity,contractFilename,remarks,warranty)
       VALUES ?`,
      [orderItemRows]
    );

    await conn.commit();
    broadcastRealtimeEvent(user.companyId, "orders");

    await createNotification(mysqlPool, {
      targetRole: "Admin",
      title: "New Draft Order Created",
      message: `Draft order "${orderid}" was created from Contract #${contractNumber || orderId} and needs to be confirmed with model/serial numbers.`,
      type: "draft-order",
      priority: "medium",
      link: orderId,
      companyGuid: user.companyId,
    });

    return NextResponse.json({ message: "Order draft created successfully.", orderId }, { status: 201 });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});
