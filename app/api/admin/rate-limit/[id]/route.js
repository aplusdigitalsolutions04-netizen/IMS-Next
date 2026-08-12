import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { invalidateRulesCache } from "@/lib/rateLimiter";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "rateLimitSettings", "Only Admin can change rate limit settings.");
  const { id } = await params;

  const { windowMs, maxRequests } = await parseJsonBody(request);
  const windowNum = Number(windowMs);
  const maxNum = Number(maxRequests);
  if (!Number.isFinite(windowNum) || windowNum < 1000) throw new ApiError(400, "Window must be at least 1000ms.");
  if (!Number.isFinite(maxNum) || maxNum < 1) throw new ApiError(400, "Max requests must be at least 1.");

  const [result] = await mysqlPool.query(
    "UPDATE rate_limit_rules SET windowMs = ?, maxRequests = ?, updatedBy = ? WHERE guid = ?",
    [windowNum, maxNum, user.username || user.email || "Admin", id]
  );
  if (result.affectedRows === 0) throw new ApiError(404, "Rule not found");

  // Rules are cached for up to 10s (lib/rateLimiter.js) to avoid a DB hit on
  // every API request — invalidate immediately so the new limit is live for
  // the very next request instead of waiting out that window.
  invalidateRulesCache();

  return NextResponse.json({ message: "Rate limit rule updated" });
});
