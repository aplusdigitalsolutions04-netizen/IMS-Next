import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeFbfFba } from "@/lib/fbfFbaAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Powers the Return-Stock screen's "type a serial / pick an item, see where
// it currently sits" step — read-only, no state changes. Two shapes:
//  - ?serialNumber=... (serialized): resolves the single FBF/FBA warehouse
//    that specific unit is in, using the warehouseGuid stamped onto the
//    serial by add-stock (see that route's comment on why it's per-serial,
//    not just the aggregate fbf_fba_stock row).
//  - ?itemId=... (non-serialized): no per-unit identity exists, so instead
//    list every (type, warehouse) bucket this item currently has quantity
//    in, for the user to pick from.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeFbfFba(user, "GET");

  const { searchParams } = new URL(request.url);
  const serialNumber = String(searchParams.get("serialNumber") || "").trim();
  const itemId = String(searchParams.get("itemId") || "").trim();

  if (!serialNumber && !itemId) {
    throw new ApiError(400, "Provide either serialNumber or itemId.");
  }

  if (serialNumber) {
    // s.warehouseGuid is the fast path — stamped directly on the serial by
    // add-stock for anything sent to FBF/FBA after that fix landed. For
    // serials sent before the fix (s.warehouseGuid is NULL), fall back to
    // fbf_fba_transactions: every "IN" move already recorded a warehouseGuid
    // alongside the JSON array of serials it covered, so the most recent
    // matching IN transaction for this serial/type tells us the same thing
    // without needing a one-time data backfill.
    //
    // Also matches serialStatus = 'Sold' — a customer return of something
    // sold via FBF/FBA (sell-out sets 'Sold' but never clears fbfFbaType,
    // so that column still says which marketplace bucket it was sold from).
    // These go straight back to main inventory, not back into FBF/FBA stock
    // — see the branch in app/api/fbf-fba/return/route.js keyed off
    // type === 'Sold'.
    const [rows] = await mysqlPool.query(
      `SELECT
          s.guid, s.serialNumber, s.serialStatus as type, s.fbfFbaType as soldFrom, s.itemVariantId as modelGuid,
          COALESCE(s.warehouseGuid, tx.warehouseGuid) as warehouseGuid,
          miv.variantName as modelName,
          w.warehouseName, w.state as warehouseState, w.platform as warehousePlatform
       FROM inventorystockinserial s
       LEFT JOIN inventoryitemvariant miv ON s.itemVariantId = miv.itemVariantId
       LEFT JOIN (
         SELECT jt.serialValue, t.type, t.warehouseGuid,
           ROW_NUMBER() OVER (PARTITION BY jt.serialValue, t.type ORDER BY t.createdAt DESC) as rn
         FROM fbf_fba_transactions t
         JOIN JSON_TABLE(t.serialNumbers, '$[*]' COLUMNS (serialValue VARCHAR(100) PATH '$')) jt
         WHERE t.transactionType = 'IN' AND t.companyGuid = ?
       ) tx ON tx.serialValue = s.serialNumber
            AND tx.type = IF(s.serialStatus = 'Sold', s.fbfFbaType, s.serialStatus)
            AND tx.rn = 1
       LEFT JOIN fbf_fba_warehouses w ON COALESCE(s.warehouseGuid, tx.warehouseGuid) = w.guid
       WHERE s.serialNumber = ? AND s.isDeleted = 0 AND s.companyGuid = ?
         AND s.serialStatus IN ('FBF', 'FBA', 'Sold')
       LIMIT 1`,
      [user.companyId, serialNumber, user.companyId]
    );

    if (rows.length === 0) {
      return NextResponse.json({
        found: false,
        message: `"${serialNumber}" is not currently sitting in FBF/FBA stock and was not sold from there either (already returned, or never sent there).`,
      });
    }

    const row = rows[0];
    const isSold = row.type === "Sold";
    return NextResponse.json({
      found: true,
      serialized: true,
      serialNumber: row.serialNumber,
      modelGuid: row.modelGuid,
      modelName: row.modelName || "Unknown model",
      type: row.type,
      soldFrom: isSold ? row.soldFrom : null,
      // Sold items go straight to main inventory, not back into FBF/FBA
      // stock — see app/api/fbf-fba/return/route.js's type === 'Sold' branch.
      destination: isSold ? "main inventory (customer return)" : "back into FBF/FBA stock",
      warehouseGuid: isSold ? null : row.warehouseGuid,
      warehouseName: isSold
        ? null
        : row.warehouseGuid ? (row.warehouseName || "Unknown warehouse") : "No warehouse recorded",
      warehouseState: isSold ? null : (row.warehouseState || null),
      warehousePlatform: isSold ? null : (row.warehousePlatform || null),
    });
  }

  const [rows] = await mysqlPool.query(
    `SELECT
        s.type, s.warehouseGuid, s.quantity, i.itemName,
        w.warehouseName, w.state as warehouseState, w.platform as warehousePlatform
     FROM fbf_fba_stock s
     LEFT JOIN inventoryitemmaster i ON s.itemId = i.itemId
     LEFT JOIN fbf_fba_warehouses w ON s.warehouseGuid = w.guid
     WHERE s.itemKind = 'nonSerialized' AND s.itemId = ? AND s.companyGuid = ? AND s.quantity > 0`,
    [itemId, user.companyId]
  );

  if (rows.length === 0) {
    return NextResponse.json({ found: false, message: "This item has no FBF/FBA stock to return." });
  }

  return NextResponse.json({
    found: true,
    serialized: false,
    itemName: rows[0].itemName || "Unknown item",
    buckets: rows.map((r) => ({
      type: r.type,
      warehouseGuid: r.warehouseGuid,
      warehouseName: r.warehouseGuid ? (r.warehouseName || "Unknown warehouse") : "No warehouse recorded",
      warehouseState: r.warehouseState || null,
      warehousePlatform: r.warehousePlatform || null,
      quantity: r.quantity,
    })),
  });
});
