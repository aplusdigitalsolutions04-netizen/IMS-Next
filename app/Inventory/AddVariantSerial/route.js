import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Adds one or more serial numbers directly against an Item Master variant —
// a quick manual add (outside the full Stock In workflow) for when you just
// need to register serials against an existing model/variant, optionally
// tagging them to a godown. Accepts either a single `value` or a `values`
// array for bulk add — all inserted with the same landingPrice/godownGuid.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);
  requireCompany(user);

  const { itemVariantId, value, values, landingPrice, godownGuid } = await parseJsonBody(request);

  const rawValues = Array.isArray(values) && values.length > 0 ? values : [value];
  const serialValues = rawValues
    .map((v) => String(v || "").trim())
    .filter((v) => v.length > 0);

  if (!itemVariantId || serialValues.length === 0) {
    throw new ApiError(400, "itemVariantId and at least one serial number are required.");
  }

  const dedupSet = new Set(serialValues.map((v) => v.toUpperCase()));
  if (dedupSet.size !== serialValues.length) {
    throw new ApiError(400, "Duplicate serial numbers in the submitted batch.");
  }

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();

    const [variantRows] = await conn.query(
      `SELECT v.itemVariantId, IFNULL(i.isTrackable, 0) as isTrackable
       FROM inventoryitemvariant v
       LEFT JOIN inventoryitemmaster i ON v.itemId = i.itemId AND i.companyGuid = v.companyGuid
       WHERE v.itemVariantId = ? AND v.isDeleted = 0 FOR UPDATE`,
      [itemVariantId]
    );
    if (!variantRows.length) throw new ApiError(404, "Variant not found.");
    // Mirrors the UI gate in components/itemMaster/ItemVariant.jsx (which
    // hides the Serial No. button entirely when the item's "Ask Serial No."
    // is off) — enforced here too so a direct API call can't bypass it.
    if (!variantRows[0].isTrackable) {
      throw new ApiError(400, "This item is not set to track serial numbers — enable \"Ask Serial No.\" on the item first.");
    }

    for (const serialValue of serialValues) {
      const [dupRows] = await conn.query("SELECT guid FROM inventorystockinserial WHERE serialNumber = ? AND isDeleted = 0", [serialValue]);
      if (dupRows.length > 0) throw new ApiError(400, `Serial number "${serialValue}" already exists.`);
    }

    const rate = Number(landingPrice) || 0;
    const guids = [];
    for (const serialValue of serialValues) {
      const guid = randomUUID();
      guids.push(guid);
      await conn.query(
        `INSERT INTO inventorystockinserial (serialId, guid, companyGuid, itemVariantId, godownGuid, serialNumber, serialStatus, landingPrice, isUsed, isDeleted, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, 'Available', ?, 0, 0, NOW())`,
        [guid, guid, user.companyId, itemVariantId, godownGuid || null, serialValue, rate]
      );
    }

    const addedCount = serialValues.length;
    await conn.query(
      `INSERT INTO inventoryvariantstock (itemVariantId, availablePCS, avgPurchaseRate, lastPurchaseRate, lastUpdatedOn)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         avgPurchaseRate = ((avgPurchaseRate * availablePCS) + (VALUES(lastPurchaseRate) * ?)) / (availablePCS + ?),
         availablePCS = availablePCS + ?,
         lastPurchaseRate = VALUES(lastPurchaseRate),
         lastUpdatedOn = NOW()`,
      [itemVariantId, addedCount, rate, rate, addedCount, addedCount, addedCount]
    );

    await conn.commit();
    return NextResponse.json({ message: "Success", guid: guids[0], guids, count: addedCount });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});
