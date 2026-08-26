import { NextResponse } from "next/server";
import { authenticateRequest, requireCompany, requirePermission } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { saveOrderAsContract } from "@/lib/orderToContract";

// Single-order entry point for OrderDetailModal.jsx's "Save as Contract"
// button — see lib/orderToContract.js for the actual logic (shared with the
// bulk endpoint at app/api/orders/save-as-contract-bulk/route.js).
export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "contracts", "You do not have permission to save contracts.");
  const { id: orderGuid } = await params;
  const { replace } = await parseJsonBody(request).catch(() => ({}));

  const { guid } = await saveOrderAsContract(orderGuid, user, { replace });

  return NextResponse.json({ message: "Order saved as contract", guid });
});
