import { mysqlPool } from "./db";

// Lazily creates `order_draft_reservations` — lets a Draft order's serial
// number picks be saved WITHOUT confirming the order (see
// app/api/orders/draft/[orderId]/reservations/route.js). One row per unit
// slot on a draft item: for a serialized model, serialGuid is the tentatively
// picked serial (its inventorystockinserial.serialStatus gets set to
// 'Reserved' so it can't be double-picked by another order in the meantime);
// for a non-serialized model there's a single row per draft item carrying
// quantity instead, serialGuid NULL. Rows are cleared the moment the order is
// actually confirmed (see the confirm route) or the draft item they belong to
// is re-saved with different picks.
let ensured = false;
export async function ensureDraftReservationsTable() {
  if (ensured) return;
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS order_draft_reservations (
      guid CHAR(36) NOT NULL PRIMARY KEY,
      companyGuid CHAR(36) NOT NULL,
      draftItemGuid CHAR(36) NOT NULL,
      unitIndex INT NOT NULL,
      modelGuid CHAR(36) NULL,
      serialGuid CHAR(36) NULL,
      quantity INT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_draftitem_unit (draftItemGuid, unitIndex),
      INDEX idx_draftreservations_serial (serialGuid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}
