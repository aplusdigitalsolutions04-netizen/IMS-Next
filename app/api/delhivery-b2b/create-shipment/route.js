import { NextResponse } from "next/server";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

// Delhivery's B2B (LTL freight) waybill-creation API uses a different
// endpoint/payload than the B2C Express API in app/api/delhivery/create-shipment
// — lib/delhiveryB2B.js only has the login flow wired up so far. Wire the
// real request here once the B2B API docs (endpoint + request/response
// shape) are available; until then, fail clearly instead of guessing at an
// undocumented request against a live freight account.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);

  return NextResponse.json({
    message: "Delhivery B2B shipment creation isn't connected yet — needs the B2B waybill API endpoint and payload format from Delhivery's B2B docs.",
  }, { status: 501 });
});
