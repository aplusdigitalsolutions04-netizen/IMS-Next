import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeFbfFba, resolveModelId } from "@/lib/fbfFbaAuth";
import { recordSerialMovement } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";

// Reverse of add-stock — pulls stock back out of an FBF/FBA warehouse and
// into regular inventory. Mirrors sell-out's transaction/locking structure,
// but instead of marking serials 'Sold', puts them back to 'Available' (the
// normal in-stock status everywhere else in the app — see e.g.
// FinalizeStockIn) and clears fbfFbaType/warehouseGuid so they no longer
// read as "sent to a marketplace warehouse". Non-serialized items have no
// per-unit record to flip — add-stock never touched a separate main-
// inventory ledger for them either, so returning them is just the reverse
// decrement on fbf_fba_stock, nothing more.
//
// A second, distinct case: type === "Sold" (serialized only). This is a
// customer returning something that was already sold out of FBF/FBA
// (sell-out set serialStatus='Sold') — the physical unit goes straight to
// main inventory, not back into the FBF/FBA warehouse, since sell-out
// already decremented fbf_fba_stock when the sale happened and there's
// nothing there to "give back". So this path skips the fbf_fba_stock
// check/decrement and the fbf_fba_transactions log entirely (no aggregate
// row is affected) — recordSerialMovement below is the audit trail for it.
export const POST = withErrorHandling(async (request) => {
  const rawBody = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeFbfFba(user, "POST");

  const { modelGuid, itemId, type, warehouseGuid, createdBy } = rawBody;
  const itemKind = rawBody.itemKind || (itemId ? "nonSerialized" : "serialized");
  const isSerialized = itemKind === "serialized";
  const isSoldReturn = isSerialized && type === "Sold";
  const safeItemId = isSerialized ? null : String(itemId || "").trim();
  const requestedSerialNumbers = Array.isArray(rawBody.serialNumbers)
    ? rawBody.serialNumbers.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const safeQuantity = isSerialized ? requestedSerialNumbers.length : Number(rawBody.quantity);

  const validTypes = isSerialized ? ["FBF", "FBA", "Sold"] : ["FBF", "FBA"];
  if (!type || !validTypes.includes(type)) throw new ApiError(400, "Invalid stock type");
  if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) throw new ApiError(400, "Quantity must be greater than zero");
  if (isSerialized && requestedSerialNumbers.length === 0) throw new ApiError(400, "Provide at least one serial number to return");
  if (!isSerialized && !safeItemId) throw new ApiError(400, "Item is required for non-serialized stock");

  const connection = await mysqlPool.getConnection();
  try {
    const safeModelId = isSerialized ? await resolveModelId(connection, modelGuid) : null;
    if (isSerialized && !safeModelId) throw new ApiError(400, "Model is required for serialized stock");

    await connection.beginTransaction();

    if (!isSoldReturn) {
      const [stock] = isSerialized
        ? await connection.query(
            "SELECT guid, quantity FROM fbf_fba_stock WHERE itemKind = 'serialized' AND modelGuid = ? AND type = ? AND companyGuid = ? AND (warehouseGuid = ? OR (warehouseGuid IS NULL AND ? IS NULL)) FOR UPDATE",
            [safeModelId, type, user.companyId, warehouseGuid || null, warehouseGuid || null]
          )
        : await connection.query(
            "SELECT guid, quantity FROM fbf_fba_stock WHERE itemKind = 'nonSerialized' AND itemId = ? AND type = ? AND companyGuid = ? AND (warehouseGuid = ? OR (warehouseGuid IS NULL AND ? IS NULL)) FOR UPDATE",
            [safeItemId, type, user.companyId, warehouseGuid || null, warehouseGuid || null]
          );

      if (!stock[0] || stock[0].quantity < safeQuantity) {
        throw new Error(`Insufficient stock in ${type} to return ${safeQuantity} — only ${stock[0]?.quantity || 0} available.`);
      }
    }

    let returnedSerials = [];
    if (isSerialized) {
      // No warehouseGuid filter here — a serial number is already a unique
      // identifier (itemVariantId + serialStatus + serialNumber + company is
      // more than enough to pin down one row), so gating on warehouse too
      // only hurts: serials sent to FBF/FBA before add-stock started
      // stamping warehouseGuid per-serial still have it NULL on this table
      // even though return-lookup can correctly infer their warehouse from
      // fbf_fba_transactions — requiring an exact match here would reject
      // exactly those (valid) returns. Warehouse still matters for which
      // fbf_fba_stock aggregate row gets decremented, below.
      const matchStatus = isSoldReturn ? "Sold" : type;
      const [matched] = await connection.query(
        `SELECT guid, serialNumber as value FROM inventorystockinserial
         WHERE itemVariantId = ? AND serialStatus = ? AND isDeleted = 0 AND serialNumber IN (?) AND companyGuid = ?
         FOR UPDATE`,
        [safeModelId, matchStatus, requestedSerialNumbers, user.companyId]
      );
      if (matched.length !== requestedSerialNumbers.length) {
        const found = new Set(matched.map((s) => s.value));
        const missing = requestedSerialNumbers.filter((sn) => !found.has(sn));
        throw new Error(
          isSoldReturn
            ? `These serials are not currently marked Sold from FBF/FBA: ${missing.join(", ")}`
            : `These serials are not currently in ${type}: ${missing.join(", ")}`
        );
      }

      returnedSerials = matched.map((s) => s.value);
      const serialIds = matched.map((s) => s.guid);

      await connection.query(
        "UPDATE inventorystockinserial SET serialStatus = 'Available', fbfFbaType = NULL, warehouseGuid = NULL WHERE guid IN (?) AND companyGuid = ?",
        [serialIds, user.companyId]
      );

      for (const s of matched) {
        await recordSerialMovement(connection, {
          companyGuid: user.companyId,
          serialNumberGuid: s.guid,
          serialValue: s.value,
          actionType: "Returned",
          status: "Available",
          notes: isSoldReturn
            ? "Returned by customer (was sold via FBF/FBA) — restocked to main inventory"
            : `Returned from ${type} stock`,
          createdBy,
        });
      }
    }

    if (!isSoldReturn) {
      if (isSerialized) {
        await connection.query(
          "UPDATE fbf_fba_stock SET quantity = quantity - ? WHERE modelGuid = ? AND type = ? AND companyGuid = ? AND (warehouseGuid = ? OR (warehouseGuid IS NULL AND ? IS NULL))",
          [safeQuantity, safeModelId, type, user.companyId, warehouseGuid || null, warehouseGuid || null]
        );
      } else {
        await connection.query(
          "UPDATE fbf_fba_stock SET quantity = quantity - ? WHERE itemKind = 'nonSerialized' AND itemId = ? AND type = ? AND companyGuid = ? AND (warehouseGuid = ? OR (warehouseGuid IS NULL AND ? IS NULL))",
          [safeQuantity, safeItemId, type, user.companyId, warehouseGuid || null, warehouseGuid || null]
        );
      }

      if (isSerialized) {
        await connection.query(
          `INSERT INTO fbf_fba_transactions (guid, companyGuid, modelGuid, itemId, itemKind, type, warehouseGuid, transactionType, quantity, serialNumbers, createdBy)
           VALUES (UUID(), ?, ?, NULL, 'serialized', ?, ?, 'RETURN', ?, ?, ?)`,
          [user.companyId, safeModelId, type, warehouseGuid || null, safeQuantity, JSON.stringify(returnedSerials), createdBy]
        );
      } else {
        await connection.query(
          `INSERT INTO fbf_fba_transactions (guid, companyGuid, modelGuid, itemId, itemKind, type, warehouseGuid, transactionType, quantity, serialNumbers, createdBy)
           VALUES (UUID(), ?, NULL, ?, 'nonSerialized', ?, ?, 'RETURN', ?, ?, ?)`,
          [user.companyId, safeItemId, type, warehouseGuid || null, safeQuantity, JSON.stringify([]), createdBy]
        );
      }
    }

    await connection.commit();
    // Returned serials flip back to 'Available' in inventorystockinserial —
    // AppDataContext's cached `serials` list (used by Global Search, New
    // Dispatch's serial validation, etc.) only refreshes on this broadcast,
    // otherwise it keeps showing the pre-return FBF/FBA status until the
    // page is reloaded.
    if (isSerialized) broadcastRealtimeEvent(user.companyId, "serials");
    const message = isSoldReturn
      ? `Successfully returned ${safeQuantity} item${safeQuantity === 1 ? "" : "s"} to main inventory (was sold via FBF/FBA)`
      : `Successfully returned ${safeQuantity} item${safeQuantity === 1 ? "" : "s"} from ${type}`;
    return NextResponse.json({ message, returnedSerials });
  } catch (err) {
    await connection.rollback();
    // Rethrow (don't hand-build the 500 response) so withErrorHandling's
    // catch-all logs it (console.error + the API request log) — building
    // the response here directly skipped both silently.
    throw err;
  } finally {
    connection.release();
  }
});
