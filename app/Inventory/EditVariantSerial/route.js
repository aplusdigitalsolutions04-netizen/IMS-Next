import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requireEditPermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureCarePackColumn, ensureCarePackPriceColumn } from "@/lib/carePackMigration";

// Edits an already-added serial from Item Master's Serial Numbers popup (the
// counterpart to AddVariantSerial/DeleteVariantSerial) — lets the serial
// value, landing price, godown, vendor, and Care Pack be corrected after the
// fact instead of only being deletable-and-re-added. Same edit-flag as Add —
// this is the same "manage serials from Item Master" capability, just on an
// existing row instead of a new one.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requireEditPermission(user, "allow_add_serial");
  await ensureCarePackColumn();
  await ensureCarePackPriceColumn();

  const { serialGuid, value, landingPrice, godownGuid, vendorId, carePack, carePackPrice } = await parseJsonBody(request);
  if (!serialGuid) throw new ApiError(400, "serialGuid is required.");

  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) throw new ApiError(400, "Serial number is required.");

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT guid FROM inventorystockinserial WHERE guid = ? AND companyGuid = ? AND isDeleted = 0 FOR UPDATE",
      [serialGuid, user.companyId]
    );
    if (!rows.length) throw new ApiError(404, "Serial not found.");

    const [dupRows] = await conn.query(
      "SELECT guid FROM inventorystockinserial WHERE serialNumber = ? AND guid != ? AND isDeleted = 0 AND companyGuid = ?",
      [trimmedValue, serialGuid, user.companyId]
    );
    if (dupRows.length > 0) throw new ApiError(400, `Serial number "${trimmedValue}" already exists.`);

    const cpPrice = carePackPrice !== undefined && carePackPrice !== null && carePackPrice !== "" ? Number(carePackPrice) : null;
    await conn.query(
      `UPDATE inventorystockinserial
       SET serialNumber = ?, landingPrice = ?, godownGuid = ?, vendorId = ?, carePack = ?, carePackPrice = ?
       WHERE guid = ? AND companyGuid = ?`,
      [trimmedValue, Number(landingPrice) || 0, godownGuid || null, vendorId || null, carePack || null, cpPrice, serialGuid, user.companyId]
    );

    await conn.commit();
    return NextResponse.json({ message: "Success" });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});
