import { NextResponse } from "next/server";
import { z } from "zod";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeFbfFba, resolveModelId } from "@/lib/fbfFbaAuth";
import { recordSerialMovement } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { validateBody } from "@/lib/validate";

// Only covers shape/type safety for fields the business-logic checks further
// down don't already cover (type/quantity/model-or-item presence stay as
// explicit checks below since they're conditional on itemKind) — this closes
// the gap where `serialNumbers` or `warehouseGuid` arriving as the wrong
// type could reach a query without ever being validated.
const bodySchema = z.object({
  modelGuid: z.string().nullish(),
  itemId: z.string().nullish(),
  type: z.string().nullish(),
  quantity: z.coerce.number().nullish(),
  serialNumbers: z.array(z.string().min(1)).nullish(),
  createdBy: z.string().nullish(),
  warehouseGuid: z.string().nullish(),
  itemKind: z.enum(["serialized", "nonSerialized"]).nullish(),
});

export const POST = withErrorHandling(async (request) => {
  const rawBody = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeFbfFba(user, "POST");

  const body = validateBody(bodySchema, rawBody);
  const { modelGuid, itemId, type, quantity, serialNumbers, createdBy, warehouseGuid } = body;
  const itemKind = body.itemKind || (serialNumbers?.length ? "serialized" : "nonSerialized");
  const isSerialized = itemKind === "serialized";
  const safeItemId = isSerialized ? null : String(itemId || "").trim();
  const safeQuantity = Number(quantity);

  const connection = await mysqlPool.getConnection();
  try {
    const safeModelId = isSerialized ? await resolveModelId(connection, modelGuid) : null;

    if (!type || !["FBF", "FBA"].includes(type)) throw new ApiError(400, "Invalid stock type");
    if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) throw new ApiError(400, "Quantity must be greater than zero");
    if (isSerialized && !safeModelId) throw new ApiError(400, "Model is required for serialized stock");
    if (!isSerialized && !safeItemId) throw new ApiError(400, "Item is required for non-serialized stock");

    await connection.beginTransaction();

    if (isSerialized) {
      const [existingStock] = await connection.query(
        "SELECT guid FROM fbf_fba_stock WHERE itemKind = 'serialized' AND modelGuid = ? AND type = ? AND companyGuid = ? AND (warehouseGuid = ? OR (warehouseGuid IS NULL AND ? IS NULL)) LIMIT 1 FOR UPDATE",
        [safeModelId, type, user.companyId, warehouseGuid || null, warehouseGuid || null]
      );

      if (existingStock.length > 0) {
        await connection.query("UPDATE fbf_fba_stock SET quantity = quantity + ? WHERE guid = ? AND companyGuid = ?", [safeQuantity, existingStock[0].guid, user.companyId]);
      } else {
        await connection.query(`
          INSERT INTO fbf_fba_stock (guid, companyGuid, modelGuid, itemId, itemKind, type, warehouseGuid, quantity)
          VALUES (UUID(), ?, ?, NULL, 'serialized', ?, ?, ?)
        `, [user.companyId, safeModelId, type, warehouseGuid || null, safeQuantity]);
      }
    } else {
      const [existingStock] = await connection.query(
        "SELECT guid FROM fbf_fba_stock WHERE itemKind = 'nonSerialized' AND itemId = ? AND type = ? AND companyGuid = ? AND (warehouseGuid = ? OR (warehouseGuid IS NULL AND ? IS NULL)) LIMIT 1 FOR UPDATE",
        [safeItemId, type, user.companyId, warehouseGuid || null, warehouseGuid || null]
      );

      if (existingStock.length > 0) {
        await connection.query("UPDATE fbf_fba_stock SET quantity = quantity + ? WHERE guid = ? AND companyGuid = ?", [safeQuantity, existingStock[0].guid, user.companyId]);
      } else {
        await connection.query(
          "INSERT INTO fbf_fba_stock (guid, companyGuid, modelGuid, itemId, itemKind, type, warehouseGuid, quantity) VALUES (UUID(), ?, NULL, ?, 'nonSerialized', ?, ?, ?)",
          [user.companyId, safeItemId, type, warehouseGuid || null, safeQuantity]
        );
      }
    }

    if (isSerialized) {
      await connection.query(`
        INSERT INTO fbf_fba_transactions (guid, companyGuid, modelGuid, itemId, itemKind, type, warehouseGuid, transactionType, quantity, serialNumbers, createdBy)
        VALUES (UUID(), ?, ?, NULL, 'serialized', ?, ?, 'IN', ?, ?, ?)
      `, [user.companyId, safeModelId, type, warehouseGuid || null, safeQuantity, JSON.stringify(serialNumbers || []), createdBy]);
    } else {
      await connection.query(`
        INSERT INTO fbf_fba_transactions (guid, companyGuid, modelGuid, itemId, itemKind, type, warehouseGuid, transactionType, quantity, serialNumbers, createdBy)
        VALUES (UUID(), ?, NULL, ?, 'nonSerialized', ?, ?, 'IN', ?, ?, ?)
      `, [user.companyId, safeItemId || null, type, warehouseGuid || null, safeQuantity, JSON.stringify(serialNumbers || []), createdBy]);
    }

    if (isSerialized && serialNumbers && serialNumbers.length > 0) {
      // guid is selected here so the movement-log loop below can reuse it
      // directly instead of re-querying it per serial — that redundant
      // per-serial SELECT was fetching data this same query already had.
      const [matchedSerials] = await connection.query(
        "SELECT guid, serialNumber as value FROM inventorystockinserial WHERE serialNumber IN (?) AND itemVariantId = ? AND isDeleted = 0 AND companyGuid = ? FOR UPDATE",
        [serialNumbers, safeModelId, user.companyId]
      );
      if (matchedSerials.length !== serialNumbers.length) {
        throw new Error("Some serials are no longer valid for this model (may have been moved or removed by another user)");
      }

      await connection.query(
        "UPDATE inventorystockinserial SET serialStatus = ?, fbfFbaType = ? WHERE serialNumber IN (?) AND itemVariantId = ? AND companyGuid = ?",
        [type, type, serialNumbers, safeModelId, user.companyId]
      );

      for (const s of matchedSerials) {
        await recordSerialMovement(connection, {
          companyGuid: user.companyId,
          serialNumberGuid: s.guid,
          serialValue: s.value,
          actionType: type,
          status: type,
          notes: `Moved to ${type} stock`,
          createdBy,
        });
      }
    }

    await connection.commit();
    return NextResponse.json({ message: `Successfully added ${safeQuantity} items to ${type}` });
  } catch (err) {
    await connection.rollback();
    if (err instanceof ApiError) throw err;
    return NextResponse.json({ message: err.message }, { status: 500 });
  } finally {
    connection.release();
  }
});
