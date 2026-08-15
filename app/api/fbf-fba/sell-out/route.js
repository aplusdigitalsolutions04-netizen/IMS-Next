import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeFbfFba, resolveModelId } from "@/lib/fbfFbaAuth";
import { recordSerialMovement } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";

// Sell / Out Functionality (FIFO Logic, or specific serials if provided)
export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeFbfFba(user, "POST");

  const { modelGuid, itemId, type, quantity, amount, transactionDate, referenceId, createdBy, warehouseGuid } = body;
  const requestedSerialNumbers = Array.isArray(body.serialNumbers)
    ? body.serialNumbers.map((s) => String(s).trim()).filter(Boolean)
    : (body.serialNumber ? [String(body.serialNumber).trim()] : []);
  const itemKind = body.itemKind || (itemId ? "nonSerialized" : "serialized");
  const isSerialized = itemKind === "serialized";
  const safeItemId = isSerialized ? null : String(itemId || "").trim();
  const safeQuantity = Number(quantity);
  const safeAmount = amount === null || amount === undefined || amount === "" ? null : Number(amount);
  const safeTransactionDate = transactionDate ? new Date(transactionDate) : new Date();

  if (safeAmount !== null && (!Number.isFinite(safeAmount) || safeAmount < 0)) throw new ApiError(400, "Amount must be a valid positive number");
  if (Number.isNaN(safeTransactionDate.getTime())) throw new ApiError(400, "Invalid sell out date");

  const connection = await mysqlPool.getConnection();
  try {
    const safeModelId = isSerialized ? await resolveModelId(connection, modelGuid) : null;

    if (isSerialized && !safeModelId) throw new ApiError(400, "Model is required for serialized stock");
    if (!isSerialized && !safeItemId) throw new ApiError(400, "Item is required for non-serialized stock");
    if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) throw new ApiError(400, "Quantity must be greater than zero");
    if (requestedSerialNumbers.length > 0 && requestedSerialNumbers.length !== safeQuantity) {
      throw new ApiError(400, `You specified ${requestedSerialNumbers.length} serial(s) but quantity is ${safeQuantity}. They must match.`);
    }

    await connection.beginTransaction();

    const [stock] = isSerialized
      ? await connection.query("SELECT quantity FROM fbf_fba_stock WHERE modelGuid = ? AND type = ? AND companyGuid = ? AND (warehouseGuid = ? OR (warehouseGuid IS NULL AND ? IS NULL)) FOR UPDATE", [safeModelId, type, user.companyId, warehouseGuid || null, warehouseGuid || null])
      : await connection.query("SELECT quantity FROM fbf_fba_stock WHERE itemKind = 'nonSerialized' AND itemId = ? AND type = ? AND companyGuid = ? AND (warehouseGuid = ? OR (warehouseGuid IS NULL AND ? IS NULL)) FOR UPDATE", [safeItemId, type, user.companyId, warehouseGuid || null, warehouseGuid || null]);

    if (!stock[0] || stock[0].quantity < safeQuantity) {
      throw new Error("Insufficient stock in " + type);
    }

    let soldSerials = [];
    if (isSerialized) {
      let availableSerials;
      if (requestedSerialNumbers.length > 0) {
        const [matched] = await connection.query(`
          SELECT guid, serialNumber as value FROM inventorystockinserial
          WHERE itemVariantId = ? AND serialStatus = ? AND isDeleted = 0 AND serialNumber IN (?) AND companyGuid = ?
          FOR UPDATE
        `, [safeModelId, type, requestedSerialNumbers, user.companyId]);
        if (matched.length !== requestedSerialNumbers.length) {
          const found = new Set(matched.map((s) => s.value));
          const missing = requestedSerialNumbers.filter((sn) => !found.has(sn));
          throw new Error(`These serials are not currently in ${type} for this model: ${missing.join(", ")}`);
        }
        availableSerials = matched;
      } else {
        const [fifo] = await connection.query(`
          SELECT guid, serialNumber as value FROM inventorystockinserial
          WHERE itemVariantId = ? AND serialStatus = ? AND isDeleted = 0 AND companyGuid = ?
          ORDER BY createdAt ASC LIMIT ?
          FOR UPDATE
        `, [safeModelId, type, user.companyId, safeQuantity]);
        availableSerials = fifo;
      }

      if (availableSerials.length < safeQuantity) throw new Error("Not enough serialized units found");

      soldSerials = availableSerials.map((s) => s.value);
      const serialIds = availableSerials.map((s) => s.guid);

      await connection.query("UPDATE inventorystockinserial SET serialStatus = 'Sold' WHERE guid IN (?) AND companyGuid = ?", [serialIds, user.companyId]);

      for (const sObj of availableSerials) {
        await recordSerialMovement(connection, {
          companyGuid: user.companyId,
          serialNumberGuid: sObj.guid,
          serialValue: sObj.value,
          actionType: "Sold",
          status: "Sold",
          notes: `Sold via ${type} (Ref: ${referenceId})`,
          createdBy,
        });
      }
    }

    if (isSerialized) {
      await connection.query("UPDATE fbf_fba_stock SET quantity = quantity - ? WHERE modelGuid = ? AND type = ? AND companyGuid = ? AND (warehouseGuid = ? OR (warehouseGuid IS NULL AND ? IS NULL))", [safeQuantity, safeModelId, type, user.companyId, warehouseGuid || null, warehouseGuid || null]);
    } else {
      await connection.query("UPDATE fbf_fba_stock SET quantity = quantity - ? WHERE itemKind = 'nonSerialized' AND itemId = ? AND type = ? AND companyGuid = ? AND (warehouseGuid = ? OR (warehouseGuid IS NULL AND ? IS NULL))", [safeQuantity, safeItemId, type, user.companyId, warehouseGuid || null, warehouseGuid || null]);
    }

    if (isSerialized) {
      await connection.query(`
        INSERT INTO fbf_fba_transactions (guid, companyGuid, modelGuid, itemId, itemKind, type, warehouseGuid, transactionType, quantity, amount, transactionDate, referenceId, serialNumbers, createdBy)
        VALUES (UUID(), ?, ?, NULL, 'serialized', ?, ?, 'OUT', ?, ?, ?, ?, ?, ?)
      `, [user.companyId, safeModelId, type, warehouseGuid || null, safeQuantity, safeAmount, safeTransactionDate, referenceId, JSON.stringify(soldSerials), createdBy]);
    } else {
      await connection.query(`
        INSERT INTO fbf_fba_transactions (guid, companyGuid, modelGuid, itemId, itemKind, type, warehouseGuid, transactionType, quantity, amount, transactionDate, referenceId, serialNumbers, createdBy)
        VALUES (UUID(), ?, NULL, ?, 'nonSerialized', ?, ?, 'OUT', ?, ?, ?, ?, ?, ?)
      `, [user.companyId, safeItemId || null, type, warehouseGuid || null, safeQuantity, safeAmount, safeTransactionDate, referenceId, JSON.stringify(soldSerials), createdBy]);
    }

    await connection.commit();
    // Sold serials flip to 'Sold' — see the matching comment in
    // app/api/fbf-fba/return/route.js for why this broadcast is needed.
    if (isSerialized) broadcastRealtimeEvent(user.companyId, "serials");
    return NextResponse.json({ message: "Stock updated successfully", soldSerials });
  } catch (err) {
    await connection.rollback();
    if (err instanceof ApiError) throw err;
    return NextResponse.json({ message: err.message }, { status: 500 });
  } finally {
    connection.release();
  }
});
