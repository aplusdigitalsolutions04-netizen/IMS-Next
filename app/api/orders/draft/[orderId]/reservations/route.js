import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeOrdersRequest, requireCompany, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureDraftReservationsTable } from "@/lib/draftReservationMigration";

// Lets a Draft order's model/serial picks be saved WITHOUT confirming the
// order — ConfirmDraftModal.jsx's "Save" button, distinct from "Confirm &
// Move to Active". A picked serial is marked 'Reserved' (not 'Dispatched')
// so it disappears from every "Available" serial picker/count elsewhere in
// the app — preventing another order from picking the same physical unit —
// while still being freely re-editable/releasable from this same draft.
export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  const { orderId } = await params;
  authorizeOrdersRequest(user, "GET", new URL(request.url).pathname, null);
  await ensureDraftReservationsTable();

  const [rows] = await mysqlPool.query(
    `SELECT r.draftItemGuid, r.unitIndex, r.modelGuid, r.serialGuid, r.quantity
     FROM order_draft_reservations r
     JOIN order_items oi ON r.draftItemGuid = oi.guid
     WHERE oi.orderGuid = ? AND r.companyGuid = ?
     ORDER BY r.draftItemGuid, r.unitIndex`,
    [orderId, user.companyId]
  );

  const byItem = {};
  rows.forEach((r) => {
    (byItem[r.draftItemGuid] ||= []).push({ unitIndex: r.unitIndex, modelGuid: r.modelGuid, serialGuid: r.serialGuid, quantity: r.quantity });
  });
  return NextResponse.json({ selections: byItem });
});

export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  const { orderId } = await params;
  authorizeOrdersRequest(user, "POST", new URL(request.url).pathname, null);
  await ensureDraftReservationsTable();

  const { items } = await parseJsonBody(request);
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "At least one item is required to save.");
  }

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderRows] = await conn.query(
      "SELECT guid FROM orders WHERE guid = ? AND companyGuid = ? AND status = 'Draft' FOR UPDATE",
      [orderId, user.companyId]
    );
    if (!orderRows.length) throw new ApiError(404, "Draft order not found.");

    for (const item of items) {
      const { draftItemGuid, units } = item;
      if (!draftItemGuid || !Array.isArray(units)) continue;

      const [draftItemRows] = await conn.query(
        "SELECT guid FROM order_items WHERE guid = ? AND orderGuid = ? AND companyGuid = ?",
        [draftItemGuid, orderId, user.companyId]
      );
      if (!draftItemRows.length) throw new ApiError(404, `Draft item ${draftItemGuid} not found.`);

      // Release every serial this draft item had reserved before this save
      // — the fresh set below re-reserves whatever's still actually picked,
      // so anything dropped (unit removed, or swapped for a different
      // serial) goes back to Available instead of staying stuck forever.
      const [existing] = await conn.query(
        "SELECT serialGuid FROM order_draft_reservations WHERE draftItemGuid = ? AND companyGuid = ? AND serialGuid IS NOT NULL FOR UPDATE",
        [draftItemGuid, user.companyId]
      );
      for (const row of existing) {
        await conn.query(
          "UPDATE inventorystockinserial SET serialStatus = 'Available' WHERE guid = ? AND companyGuid = ? AND serialStatus = 'Reserved'",
          [row.serialGuid, user.companyId]
        );
      }
      await conn.query("DELETE FROM order_draft_reservations WHERE draftItemGuid = ? AND companyGuid = ?", [draftItemGuid, user.companyId]);

      for (let i = 0; i < units.length; i++) {
        const unit = units[i] || {};
        if (unit.serialGuid) {
          const [[serial]] = await conn.query(
            "SELECT serialStatus FROM inventorystockinserial WHERE guid = ? AND companyGuid = ? FOR UPDATE",
            [unit.serialGuid, user.companyId]
          );
          if (!serial) throw new ApiError(404, `Serial not found.`);
          if (serial.serialStatus !== "Available") {
            throw new ApiError(400, `A selected serial is no longer Available (someone else may have picked it) — please re-select it.`);
          }
          await conn.query(
            "UPDATE inventorystockinserial SET serialStatus = 'Reserved' WHERE guid = ? AND companyGuid = ?",
            [unit.serialGuid, user.companyId]
          );
        }
        if (!unit.modelGuid && !unit.serialGuid && !unit.quantity) continue;
        await conn.query(
          `INSERT INTO order_draft_reservations (guid, companyGuid, draftItemGuid, unitIndex, modelGuid, serialGuid, quantity)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), user.companyId, draftItemGuid, i, unit.modelGuid || null, unit.serialGuid || null, unit.quantity || null]
        );
      }
    }

    await conn.commit();
    return NextResponse.json({ message: "Saved." });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});
