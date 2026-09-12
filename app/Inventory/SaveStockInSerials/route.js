import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureCarePackColumn } from "@/lib/carePackMigration";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);
  await ensureCarePackColumn();

  const { stockInDetailId, itemVariantId, serialNumbers } = body;

  if (!Array.isArray(serialNumbers) || !serialNumbers.length) {
    throw new ApiError(400, "No serial numbers provided");
  }

  // Each entry is either a plain string (no Care Pack) or {serialNumber,
  // carePack} — supporting both keeps this route backward-compatible with
  // any other caller still sending the old array-of-strings shape.
  const entries = serialNumbers.map((sn) => (typeof sn === "string" ? { serialNumber: sn, carePack: null } : sn));
  const serialValues = entries.map((e) => e.serialNumber);

  const dedupedInput = new Set(serialValues);
  if (dedupedInput.size !== serialValues.length) {
    throw new ApiError(400, "Duplicate serial numbers within the submitted batch");
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    try {
      // Scoped to this company — serial numbers were previously checked
      // globally, so one company using a serial number permanently blocked
      // every other company from ever using that same string, even on
      // completely unrelated hardware.
      const [dupRows] = await connection.query(
        "SELECT serialNumber FROM inventorystockinserial WHERE serialNumber IN (?) AND isDeleted = 0 AND companyGuid = ? FOR UPDATE",
        [serialValues, user.companyId]
      );
      if (dupRows.length > 0) throw new Error(`Serial Number ${dupRows[0].serialNumber} already exists`);

      const values = entries.map((e) => [uuidv4(), stockInDetailId, itemVariantId || null, e.serialNumber, user.companyId, e.carePack || null]);
      await connection.query(
        "INSERT INTO inventorystockinserial (serialId, stockInDetailId, itemVariantId, serialNumber, companyGuid, carePack) VALUES ?",
        [values]
      );
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return NextResponse.json({ message: "One or more serial numbers already exist" }, { status: 400 });
    return NextResponse.json({ message: err.message }, { status: 400 });
  } finally {
    connection.release();
  }
  return NextResponse.json({ message: "Saved Successfully" });
});
