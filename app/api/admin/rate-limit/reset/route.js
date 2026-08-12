import { NextResponse } from "next/server";
import { authenticateRequest, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { clearBucket } from "@/lib/rateLimiter";

// Manually clears one IP's current attempt count for a rule — e.g. an admin
// unblocking a legitimate user who got rate-limited (locked-out login,
// script that misbehaved), without waiting for the window to expire.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "rateLimitSettings", "Only Admin can reset rate limit counters.");

  const { ruleKey, ip } = await parseJsonBody(request);
  if (!ruleKey || !ip) throw new ApiError(400, "ruleKey and ip are required.");

  clearBucket(ruleKey, ip);
  return NextResponse.json({ message: "Counter reset" });
});
