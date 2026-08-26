import { NextResponse } from "next/server";
import { authenticateRequest, requireCompany, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { saveOrderAsContract } from "@/lib/orderToContract";

// Multi-select version of app/api/orders/[id]/save-as-contract/route.js, for
// OrderTracking.jsx's bulk "Save as Contract" action. Runs sequentially (not
// Promise.all) — each order can trigger an AI extraction call against its
// attached contract document, and firing those in parallel would multiply
// OpenAI rate-limit risk for no real benefit here. One order failing (e.g.
// no items, or someone else saved it moments ago) doesn't stop the rest —
// every outcome is collected and returned as one summary.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "contracts", "You do not have permission to save contracts.");

  const { orderGuids } = await parseJsonBody(request);
  if (!Array.isArray(orderGuids) || orderGuids.length === 0) {
    throw new ApiError(400, "orderGuids is required");
  }

  const saved = [];
  const skipped = [];
  const failed = [];

  for (const orderGuid of orderGuids) {
    try {
      const { guid, contractNumber } = await saveOrderAsContract(orderGuid, user, { replace: false });
      saved.push({ orderGuid, guid, contractNumber });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        skipped.push({ orderGuid, reason: "already-saved" });
      } else {
        failed.push({ orderGuid, reason: err?.message || "Failed" });
      }
    }
  }

  return NextResponse.json({
    message: `${saved.length} saved, ${skipped.length} skipped, ${failed.length} failed.`,
    saved, skipped, failed,
  });
});
