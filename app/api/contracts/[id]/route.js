import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeReadWrite, requireCompany, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";

const EDITABLE_FIELDS = [
  "bidNumber", "contractNumber", "generatedDate", "buyerContact", "products", "buyerEmail", "buyerGstin",
  "buyerAddress", "deliveryStartAfter", "deliveryCompletedBy", "deliveryInstructions", "ministry", "department", "organisation",
  "officeZone", "sellerCompany", "sellerContact", "sellerGstin", "consigneeDesignation", "consigneeEmail",
  "consigneeContact", "consigneeAddress", "status", "cancelReason", "cancelRemarks",
];

// See the matching comment in app/api/contracts/route.js — this was
// copy-pasted from an Order Processing route and gated on "orders" (a
// PROTECTED_EDIT_PERMISSIONS tab), silently requiring the unrelated
// allow_edit_order_processing edit-flag too. "contracts" view access alone
// is enough, same as contract creation.
const authorize = (user, method) =>
  authorizeReadWrite(user, method, {
    permission: "contracts",
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

// Contract field -> orders column, for the subset that has a direct
// equivalent on `orders` (see [[ims-next-migration]] for the fuller field
// mapping used when an order is first drafted from a contract in
// app/api/orders/draft/route.js). Only fields the user actually edited get
// pushed through, and only orderid/serials/status stay untouched — those are
// operational state the order owns, not contract data.
const ORDER_SYNC_FIELDS = {
  organisation: "customerName",
  buyerAddress: "buyerAddress",
  buyerContact: "contactNumber",
  buyerEmail: "buyerEmail",
  buyerGstin: "gstNumber",
  consigneeEmail: "consigneeEmail",
  consigneeAddress: "shippingAddress",
  bidNumber: "bidNumber",
};

// Keeps the linked order's copy of buyer/consignee/bid details in sync after
// a contract edit — before this, editing a contract only ever touched the
// `contracts` row, so Order Processing kept showing whatever was there when
// the draft was first created, silently drifting from the contract.
async function syncLinkedOrder(conn, contractNumber, companyGuid, body, updates) {
  const syncKeys = updates.filter((k) => ORDER_SYNC_FIELDS[k]);
  if (syncKeys.length === 0) return;
  const linkedOrder = await findLinkedOrder(conn, contractNumber, companyGuid);
  if (!linkedOrder) return;

  const setClause = syncKeys.map((k) => `${ORDER_SYNC_FIELDS[k]}=?`).join(", ");
  const values = syncKeys.map((k) => (body[k] === undefined ? null : body[k]));
  await conn.query(
    `UPDATE orders SET ${setClause} WHERE guid=? AND companyGuid=?`,
    [...values, linkedOrder.guid, companyGuid]
  );
}

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "contracts", "You do not have permission to access contracts.");
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

    // Uses `current.contractNumber` (the value before this edit) — orderid
    // never changes to follow a contractNumber edit, so the order stays
    // linked by its original number regardless.
    if (!isCancelling) await syncLinkedOrder(conn, current.contractNumber, user.companyId, body, updates);

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
  if (isCancelling || updates.some((k) => ORDER_SYNC_FIELDS[k])) broadcastRealtimeEvent(user.companyId, "orders");
  return NextResponse.json({ message: "Contract updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "contracts", "You do not have permission to access contracts.");
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
