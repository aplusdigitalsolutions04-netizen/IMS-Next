import { NextResponse } from "next/server";
import { authenticateRequest, requireShippingAccess } from "@/lib/auth";
import { getConfig, delhiveryRequest } from "@/lib/delhivery";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Expects: { orderId, consigneeName, consigneeAddress, consigneePincode, consigneePhone,
//            paymentMode: 'Prepaid'|'COD', codAmount?, weightGrams?, dimensionsCm?: {l,b,h},
//            quantity, productDescription }
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireShippingAccess(user);

  const config = getConfig();
  if (!config.pickupLocation) {
    return NextResponse.json({ message: "DELHIVERY_PICKUP_LOCATION is not configured in backend environment." }, { status: 400 });
  }

  const {
    orderId, consigneeName, consigneeAddress, consigneeCity, consigneeState,
    consigneePincode, consigneePhone, paymentMode, codAmount, weightGrams,
    dimensionsCm, quantity, productDescription,
  } = await parseJsonBody(request);

  if (!orderId || !consigneeName || !consigneeAddress || !consigneePincode || !consigneePhone) {
    return NextResponse.json({ message: "orderId, consigneeName, consigneeAddress, consigneePincode and consigneePhone are required." }, { status: 400 });
  }

  const shipment = {
    name: consigneeName,
    add: consigneeAddress,
    pin: String(consigneePincode),
    city: consigneeCity || "",
    state: consigneeState || "",
    country: "India",
    phone: String(consigneePhone),
    order: String(orderId),
    payment_mode: paymentMode === "COD" ? "COD" : "Prepaid",
    cod_amount: paymentMode === "COD" ? Number(codAmount) || 0 : 0,
    products_desc: productDescription || "Printer / Electronics",
    quantity: String(quantity || 1),
    weight: String(weightGrams || 500),
    shipment_length: dimensionsCm?.l ? String(dimensionsCm.l) : undefined,
    shipment_width: dimensionsCm?.b ? String(dimensionsCm.b) : undefined,
    shipment_height: dimensionsCm?.h ? String(dimensionsCm.h) : undefined,
    seller_name: config.shipper.name || "",
    seller_add: config.shipper.address || "",
    seller_gst_tin: config.shipper.gst || undefined,
  };

  const body = {
    shipments: [shipment],
    pickup_location: { name: config.pickupLocation },
  };

  const formBody = `format=json&data=${encodeURIComponent(JSON.stringify(body))}`;

  try {
    const result = await delhiveryRequest("/api/cmu/create.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody,
    });

    const packageResult = result?.packages?.[0];
    if (!packageResult || packageResult.status !== "Success") {
      return NextResponse.json({
        message: packageResult?.remarks?.[0] || "Delhivery rejected the shipment request.",
        response: result,
      }, { status: 400 });
    }

    return NextResponse.json({
      message: "Shipment created successfully",
      waybill: packageResult.waybill,
      refnum: packageResult.refnum,
      response: result,
    });
  } catch (err) {
    return NextResponse.json({ message: err.message, response: err.payload || null }, { status: err.status || 500 });
  }
});
