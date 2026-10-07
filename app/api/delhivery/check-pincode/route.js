import { NextResponse } from "next/server";
import { authenticateRequest, requireShippingAccess } from "@/lib/auth";
import { getConfig, delhiveryRequest } from "@/lib/delhivery";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Expects: { pincode, weightGrams?, paymentMode?: 'Prepaid'|'COD', codAmount? }
// Checks serviceability for the destination pincode, and — if serviceable —
// also fetches the freight charge estimate from the configured shipper
// pincode to that destination.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireShippingAccess(user);

  const config = getConfig();
  const { pincode, weightGrams, paymentMode, codAmount } = await parseJsonBody(request);

  if (!pincode) {
    return NextResponse.json({ message: "pincode is required." }, { status: 400 });
  }

  let serviceability;
  try {
    serviceability = await delhiveryRequest(`/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(pincode)}`, {
      method: "GET",
    });
  } catch (err) {
    return NextResponse.json({ message: err.message, response: err.payload || null }, { status: err.status || 500 });
  }

  const postalCode = serviceability?.delivery_codes?.[0]?.postal_code;
  const isServiceable = !!postalCode;

  if (!isServiceable) {
    return NextResponse.json({ pincode, serviceable: false, serviceability });
  }

  if (!config.shipper.pincode) {
    return NextResponse.json({
      pincode,
      serviceable: true,
      serviceability,
      chargesError: "DELHIVERY_SHIPPER_PINCODE is not configured — cannot estimate charges.",
    });
  }

  const weight = Number(weightGrams) || 500;
  const isCod = paymentMode === "COD";
  const chargeParams = new URLSearchParams({
    md: "S", // Surface — cheapest/default mode
    ss: "Delivered",
    o_pin: config.shipper.pincode,
    d_pin: String(pincode),
    cgm: String(weight),
    pt: isCod ? "COD" : "Pre-paid",
    ...(isCod ? { cod: String(Number(codAmount) || 0) } : {}),
  });

  let charges = null;
  let chargesError = null;
  try {
    charges = await delhiveryRequest(`/api/kinko/v1/invoice/charges/.json?${chargeParams.toString()}`, {
      method: "GET",
    });
  } catch (err) {
    chargesError = err.message;
  }

  return NextResponse.json({
    pincode,
    serviceable: true,
    serviceability,
    charges,
    chargesError,
  });
});
