import { NextResponse } from "next/server";
import { authenticateRequest, requireShippingAccess } from "@/lib/auth";
import { getConfig, delhiveryRequest } from "@/lib/delhivery";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Expects: { pickupDate: 'YYYY-MM-DD', pickupTime: 'HH:mm:ss', packageCount, expectedPackageCount? }
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireShippingAccess(user);

  const config = getConfig();
  if (!config.pickupLocation) {
    return NextResponse.json({ message: "DELHIVERY_PICKUP_LOCATION is not configured in backend environment." }, { status: 400 });
  }

  const { pickupDate, pickupTime, packageCount } = await parseJsonBody(request);
  if (!pickupDate || !pickupTime || !packageCount) {
    return NextResponse.json({ message: "pickupDate, pickupTime and packageCount are required." }, { status: 400 });
  }

  try {
    const result = await delhiveryRequest("/fm/request/new/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pickup_time: pickupTime,
        pickup_date: pickupDate,
        pickup_location: config.pickupLocation,
        expected_package_count: Number(packageCount),
      }),
    });

    return NextResponse.json({ message: "Pickup requested successfully", response: result });
  } catch (err) {
    return NextResponse.json({ message: err.message, response: err.payload || null }, { status: err.status || 500 });
  }
});
