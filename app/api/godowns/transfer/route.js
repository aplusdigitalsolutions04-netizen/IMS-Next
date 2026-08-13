import { NextResponse } from "next/server";
import crypto from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, ApiError, requireCompany } from "@/lib/auth";
import { authorizeGodownTransfer } from "@/lib/godownsAuth";
import { logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeGodownTransfer(user, "POST");

  const { sourceGodownId, destinationGodownId, serialIds, itemVariantId, quantity, modelName } = await parseJsonBody(request);
  if (!sourceGodownId || !destinationGodownId) throw new ApiError(400, "Missing required fields");
  if (sourceGodownId === destinationGodownId) throw new ApiError(400, "Source and destination godowns cannot be the same");

  const [srcG] = await mysqlPool.query("SELECT godownName FROM godowns WHERE guid=? AND companyGuid=?", [sourceGodownId, user.companyId]);
  const [dstG] = await mysqlPool.query("SELECT godownName FROM godowns WHERE guid=? AND companyGuid=?", [destinationGodownId, user.companyId]);
  if (!srcG.length || !dstG.length) throw new ApiError(400, "Invalid godown selected");

  const isSerialized = Array.isArray(serialIds) && serialIds.length > 0;
  const transferId = crypto.randomUUID();
  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();

    if (isSerialized) {
      const [serials] = await conn.query(
        "SELECT guid, serialNumber as value FROM inventorystockinserial WHERE guid IN (?) AND godownGuid=? AND serialStatus='Available' AND isDeleted=0 AND companyGuid=? FOR UPDATE",
        [serialIds, sourceGodownId, user.companyId]
      );
      if (serials.length !== serialIds.length) throw new ApiError(400, "Some serials are no longer available in the source godown");

      await conn.query("UPDATE inventorystockinserial SET godownGuid=? WHERE guid IN (?) AND companyGuid=?", [destinationGodownId, serialIds, user.companyId]);

      // Single multi-row insert instead of one INSERT per serial — this
      // transaction is holding a FOR UPDATE lock on every one of those
      // serial rows above, so a per-serial loop here stretched the lock
      // window linearly with transfer size.
      const historyRows = serials.map((serial) => [transferId, user.companyId, modelName || "Unknown Model", serial.value, srcG[0].godownName, dstG[0].godownName, user?.username || "System"]);
      await conn.query(
        "INSERT INTO stocktransferhistory (transferId,companyGuid,modelName,serialNumber,fromGodown,toGodown,transferredBy) VALUES ?",
        [historyRows]
      );
    } else {
      if (!itemVariantId) throw new ApiError(400, "itemVariantId is required for a non-serialized transfer");
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) throw new ApiError(400, "A valid quantity is required");

      // Validate against the company's total available stock — non-serialized
      // stock was never tracked per-godown before this feature existed, so
      // `inventorygodownstock` (the per-godown breakdown) may not have a
      // matching source row yet for older stock. The global total is the
      // only number we can trust to actually exist.
      const [[globalStock]] = await conn.query(
        "SELECT availablePCS FROM inventoryvariantstock WHERE itemVariantId=? FOR UPDATE",
        [itemVariantId]
      );
      if (!globalStock || Number(globalStock.availablePCS) < qty) {
        throw new ApiError(400, globalStock ? `Not enough stock — only ${globalStock.availablePCS} available in total.` : "Stock record not found for this item.");
      }

      // Ensure a source row exists, then floor the per-godown decrement at 0
      // (rather than hard-failing) since historical stock may not have been
      // attributed to any specific godown yet.
      await conn.query(
        "INSERT INTO inventorygodownstock (itemVariantId, godownGuid, availablePCS) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE availablePCS = availablePCS",
        [itemVariantId, sourceGodownId]
      );
      await conn.query(
        "UPDATE inventorygodownstock SET availablePCS = GREATEST(0, availablePCS - ?) WHERE itemVariantId=? AND godownGuid=?",
        [qty, itemVariantId, sourceGodownId]
      );

      await conn.query(
        `INSERT INTO inventorygodownstock (itemVariantId, godownGuid, availablePCS) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE availablePCS = availablePCS + VALUES(availablePCS)`,
        [itemVariantId, destinationGodownId, qty]
      );

      await conn.query(
        "INSERT INTO stocktransferhistory (transferId,companyGuid,modelName,quantity,fromGodown,toGodown,transferredBy) VALUES (?,?,?,?,?,?,?)",
        [transferId, user.companyId, modelName || "Unknown Item", qty, srcG[0].godownName, dstG[0].godownName, user?.username || "System"]
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  await logUserActivity(
    mysqlPool,
    user,
    "Stock Transfer",
    [{ field: "model", newValue: modelName }, { field: "count", newValue: isSerialized ? serialIds.length : quantity }, { field: "from", newValue: srcG[0].godownName }, { field: "to", newValue: dstG[0].godownName }],
    request.headers.get("x-forwarded-for") || null
  );
  return NextResponse.json({ message: "Stock transferred successfully", transferId });
});
