import { randomUUID } from "crypto";
import { ensureNonSerializedBatchTable, ensureNonSerializedBatchVendorColumn } from "./nonSerializedBatchMigration";

// Records a new price batch for a non-serialized Stock-In line. Always an
// INSERT, never a blend/overwrite of an existing row — this is exactly what
// keeps "10 @ ₹100" and a later "5 @ ₹120" visible as two separate lots
// instead of collapsing into one averaged/overwritten price.
export async function addNonSerializedBatch(conn, { companyGuid, itemVariantId, godownGuid, stockInDetailId, purchaseRate, qty, vendorId }) {
  if (!qty) return;
  await ensureNonSerializedBatchVendorColumn();
  await conn.execute(
    `INSERT INTO inventorynonserializedbatch
       (guid, companyGuid, itemVariantId, godownGuid, stockInDetailId, purchaseRate, qtyReceived, qtyRemaining, vendorId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), companyGuid, itemVariantId, godownGuid || null, stockInDetailId || null, purchaseRate || 0, qty, qty, vendorId || null]
  );
}

// FIFO-consumes `qty` units off the oldest batches with qtyRemaining > 0.
// Best-effort bookkeeping only: the real "can we dispatch this" gate is
// inventoryvariantstock.availablePCS (checked by the caller before this
// runs), so if batch rows run short — e.g. stock added before this feature
// existed, with no batch row at all — this simply consumes whatever batches
// exist and stops; it never blocks or throws on a shortfall.
export async function consumeNonSerializedBatch(conn, itemVariantId, qty) {
  let remaining = Number(qty) || 0;
  if (remaining <= 0) return;
  await ensureNonSerializedBatchTable();

  const [batches] = await conn.query(
    "SELECT guid, qtyRemaining FROM inventorynonserializedbatch WHERE itemVariantId = ? AND qtyRemaining > 0 ORDER BY createdAt ASC FOR UPDATE",
    [itemVariantId]
  );

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.qtyRemaining);
    await conn.execute(
      "UPDATE inventorynonserializedbatch SET qtyRemaining = qtyRemaining - ? WHERE guid = ?",
      [take, batch.guid]
    );
    remaining -= take;
  }
}

// Reverses consumeNonSerializedBatch — gives `qty` back to the most
// recently-consumed batches first (createdAt DESC), capped at each batch's
// own qtyReceived so a release can never inflate a batch past what it
// actually received. Same "best-effort bookkeeping only" caveat as consume:
// the real gate is inventoryvariantstock.availablePCS, adjusted separately
// by the caller.
export async function releaseNonSerializedBatch(conn, itemVariantId, qty) {
  let remaining = Number(qty) || 0;
  if (remaining <= 0) return;
  await ensureNonSerializedBatchTable();

  const [batches] = await conn.query(
    "SELECT guid, qtyReceived, qtyRemaining FROM inventorynonserializedbatch WHERE itemVariantId = ? AND qtyRemaining < qtyReceived ORDER BY createdAt DESC FOR UPDATE",
    [itemVariantId]
  );

  for (const batch of batches) {
    if (remaining <= 0) break;
    const give = Math.min(remaining, batch.qtyReceived - batch.qtyRemaining);
    if (give <= 0) continue;
    await conn.execute(
      "UPDATE inventorynonserializedbatch SET qtyRemaining = qtyRemaining + ? WHERE guid = ?",
      [give, batch.guid]
    );
    remaining -= give;
  }
}

// Undoes a specific Stock-In line's batch (matched by stockInDetailId) when
// that stock-in is reverted — removes it outright rather than trying to
// re-inflate qtyRemaining, since some of it may have already been consumed
// by a dispatch in the meantime.
export async function revertNonSerializedBatch(conn, stockInDetailId) {
  if (!stockInDetailId) return;
  await ensureNonSerializedBatchTable();
  await conn.execute("DELETE FROM inventorynonserializedbatch WHERE stockInDetailId = ?", [stockInDetailId]);
}
