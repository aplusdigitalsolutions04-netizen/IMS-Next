import { mysqlPool } from "./db";

// Lazily creates `inventorynonserializedbatch` — one row per Stock-In line for
// a non-serialized (no "Ask Serial No.") item variant, keeping its purchase
// rate and remaining quantity separate from every other batch of the same
// variant. inventoryvariantstock.availablePCS/avgPurchaseRate/lastPurchaseRate
// stay as the fast aggregate total (still what dispatch/stock-out check
// against) — this table exists only so Current Stock can show "10 @ ₹100,
// 5 @ ₹120" instead of a single blended/overwritten price.
let ensured = false;
export async function ensureNonSerializedBatchTable() {
  if (ensured) return;
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS inventorynonserializedbatch (
      guid CHAR(36) NOT NULL PRIMARY KEY,
      companyGuid CHAR(36) NOT NULL,
      itemVariantId CHAR(36) NOT NULL,
      godownGuid CHAR(36) NULL,
      stockInDetailId CHAR(36) NULL,
      purchaseRate DECIMAL(12,2) NOT NULL DEFAULT 0,
      qtyReceived INT NOT NULL,
      qtyRemaining INT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_nsbatch_variant_fifo (itemVariantId, createdAt),
      INDEX idx_nsbatch_stockindetail (stockInDetailId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}
