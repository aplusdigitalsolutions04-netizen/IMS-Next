import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeOrdersRequest, requireCompany, ApiError } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";
import { createNotification } from "@/lib/notifications";

// Marks a still-Draft order as ready for Billing's Draft tab to pick up —
// deliberately opt-in (see app/api/orders/draft/route.js's comment on why
// drafts start with no serials/invoice) so an admin chooses which drafts are
// worth billing ahead of confirmation, rather than every draft appearing
// there automatically the moment it's created.
export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  const { orderId } = await params;
  authorizeOrdersRequest(user, "POST", new URL(request.url).pathname, null);

  const [result] = await mysqlPool.query(
    "UPDATE orders SET draftSentToBilling=1 WHERE guid=? AND companyGuid=? AND status='Draft'",
    [orderId, user.companyId]
  );
  if (result.affectedRows === 0) throw new ApiError(404, "Draft order not found.");

  broadcastRealtimeEvent(user.companyId, "orders");

  const [[order]] = await mysqlPool.query("SELECT orderid FROM orders WHERE guid=?", [orderId]);
  await createNotification(mysqlPool, {
    targetEditFlag: "allow_edit_billing",
    title: "Draft Order Sent for Billing",
    message: `Draft order "${order?.orderid || orderId}" was sent to the Billing Draft tab for invoicing.`,
    type: "draft-order",
    priority: "medium",
    link: orderId,
    companyGuid: user.companyId,
  });

  return NextResponse.json({ message: "Draft order sent for billing." });
});
