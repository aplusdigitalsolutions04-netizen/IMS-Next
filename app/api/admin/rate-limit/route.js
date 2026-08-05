import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireRoles } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { getBucketSnapshot } from "@/lib/rateLimiter";

// Returns the configurable rules (from rate_limit_rules) plus a live
// snapshot of what's currently being tracked in memory — every IP/rule
// combination with an active window right now, and how close to the limit
// it is. This is read-your-own-writes with the Proxy: both run in the same
// Node.js process (see proxy.js), so this reflects real-time state, not a
// delayed/cached view.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can view rate limit settings.");

  const [rules] = await mysqlPool.query("SELECT guid, ruleKey, label, windowMs, maxRequests, updatedBy, updatedAt FROM rate_limit_rules ORDER BY ruleKey");
  const buckets = getBucketSnapshot();

  return NextResponse.json({ rules, buckets });
});
