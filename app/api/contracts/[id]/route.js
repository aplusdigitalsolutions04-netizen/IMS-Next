import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeReadWrite, requireCompany, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";

const EDITABLE_FIELDS = [
  "bidNumber", "contractNumber", "generatedDate", "buyerContact", "products", "buyerEmail", "buyerGstin",
  "buyerAddress", "deliveryStartAfter", "deliveryCompletedBy", "ministry", "department", "organisation",
  "officeZone", "sellerCompany", "sellerContact", "sellerGstin", "consigneeDesignation", "consigneeEmail",
  "consigneeContact", "consigneeAddress", "status", "cancelReason", "cancelRemarks",
];

const authorize = (user, method) =>
  authorizeReadWrite(user, method, {
    permission: "orders",
    editColumnName: "allow_edit_order_processing",
    adminOnlyDelete: true,
    denyMessage: "You do not have permission to manage contracts.",
  });

// A contract links to its order only by orderid == contractNumber (set once
// in app/api/orders/draft/route.js when the draft is created) — there's no
// FK, so look it up by that match. If the order is still a Draft, no serial
// numbers have been committed to it yet, so it's safe to remove alongside
// the contract; once it's been confirmed (status moves off 'Draft' in
// app/api/orders/draft/[orderId]/confirm/route.js), real serials are already
// marked Dispatched against it and it must not be silently deleted.
async function findLinkedOrder(conn, contractNumber, companyGuid) {
  if (!contractNumber) return null;
  const [rows] = await conn.query(
    "SELECT guid, status FROM orders WHERE orderid = ? AND companyGuid = ? AND isDeleted = 0 LIMIT 1",
    [contractNumber, companyGuid]
  );
  return rows[0] || null;
}

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorize(user, "PUT");
  const { id } = await params;
  const body = await parseJsonBody(request);

  const updates = Object.keys(body).filter((k) => EDITABLE_FIELDS.includes(k));
  if (updates.length === 0) throw new ApiError(400, "No editable fields provided");

  if (updates.includes("contractNumber")) {
    const contractNumber = String(body.contractNumber || "").trim();
    if (!contractNumber) throw new ApiError(400, "Contract Number is required");
    const [dup] = await mysqlPool.query(
      "SELECT guid FROM contracts WHERE contractNumber=? AND companyGuid=? AND guid<>? AND isDeleted=0",
      [contractNumber, user.companyId, id]
    );
    if (dup.length > 0) throw new ApiError(400, "A contract with this Contract Number already exists");
  }

  const isCancelling = updates.includes("status") && body.status === "Cancelled";

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();

    const [[current]] = await conn.query(
      "SELECT contractNumber FROM contracts WHERE guid=? AND companyGuid=? AND isDeleted=0",
      [id, user.companyId]
    );
    if (!current) throw new ApiError(404, "Contract not found");

    if (isCancelling) {
      const linkedOrder = await findLinkedOrder(conn, current.contractNumber, user.companyId);
      if (linkedOrder) {
        if (linkedOrder.status === "Draft") {
          await conn.query(
            "UPDATE orders SET isDeleted=1, status='Order Cancelled', cancellationReason=?, cancelledBy=?, cancelledAt=NOW() WHERE guid=? AND companyGuid=?",
            ["Linked contract was cancelled", user.username || user.fullName || "Unknown", linkedOrder.guid, user.companyId]
          );
        } else {
          throw new ApiError(400, "This contract's order has already been confirmed with serial numbers assigned — it cannot be cancelled.");
        }
      }
    }

    const setClause = updates.map((k) => `${k}=?`).join(", ");
    const values = updates.map((k) => (body[k] === undefined ? null : body[k]));

    const [result] = await conn.query(
      `UPDATE contracts SET ${setClause}, modifiedBy=?, modifiedAt=NOW() WHERE guid=? AND companyGuid=? AND isDeleted=0`,
      [...values, user.username || user.fullName || "Unknown", id, user.companyId]
    );
    if (result.affectedRows === 0) throw new ApiError(404, "Contract not found");

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err instanceof ApiError) throw err;
    if (err.code === "ER_DUP_ENTRY") throw new ApiError(400, "A contract with this Contract Number already exists");
    throw err;
  } finally {
    conn.release();
  }

  broadcastRealtimeEvent(user.companyId, "contracts");
  if (isCancelling) broadcastRealtimeEvent(user.companyId, "orders");
  return NextResponse.json({ message: "Contract updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorize(user, "DELETE");
  const { id } = await params;

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();

    const [[current]] = await conn.query(
      "SELECT contractNumber FROM contracts WHERE guid=? AND companyGuid=? AND isDeleted=0",
      [id, user.companyId]
    );
    if (!current) throw new ApiError(404, "Contract not found");

    const linkedOrder = await findLinkedOrder(conn, current.contractNumber, user.companyId);
    if (linkedOrder) {
      if (linkedOrder.status === "Draft") {
        await conn.query(
          "UPDATE orders SET isDeleted=1, status='Order Cancelled', cancellationReason=?, cancelledBy=?, cancelledAt=NOW() WHERE guid=? AND companyGuid=?",
          ["Linked contract was deleted", user.username || user.fullName || "Unknown", linkedOrder.guid, user.companyId]
        );
      } else {
        throw new ApiError(400, "This contract's order has already been confirmed with serial numbers assigned — the contract cannot be deleted.");
      }
    }

    const [result] = await conn.query(
      "UPDATE contracts SET isDeleted=1 WHERE guid=? AND companyGuid=?",
      [id, user.companyId]
    );
    if (result.affectedRows === 0) throw new ApiError(404, "Contract not found");

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err instanceof ApiError) throw err;
    throw err;
  } finally {
    conn.release();
  }

  broadcastRealtimeEvent(user.companyId, "contracts");
  broadcastRealtimeEvent(user.companyId, "orders");
  return NextResponse.json({ message: "Contract deleted" });
});
