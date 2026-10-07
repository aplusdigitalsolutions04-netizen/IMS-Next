import { NextResponse } from "next/server";
import { authenticateRequest, requireShippingAccess } from "@/lib/auth";
import { loginToDelhivery, sanitizeLoginResponse } from "@/lib/delhivery";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireShippingAccess(user);

  const body = await parseJsonBody(request);
  try {
    const auth = await loginToDelhivery({ force: body?.force === true });
    return NextResponse.json({
      message: "Delhivery login successful",
      loggedInAt: auth.loggedInAt,
      tokenAvailable: Boolean(auth.token),
      response: sanitizeLoginResponse(auth.raw),
    });
  } catch (err) {
    return NextResponse.json({ message: err.message, response: err.payload || null }, { status: err.status || 500 });
  }
});
