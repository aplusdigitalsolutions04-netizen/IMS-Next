import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);

  const { stockInDetailId, itemVariantId, serialNumbers } = body;

  const dedupedInput = new Set(serialNumbers);
  if (dedupedInput.size !== serialNumbers.length) {
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
        [serialNumbers, user.companyId]
      );
      if (dupRows.length > 0) throw new Error(`Serial Number ${dupRows[0].serialNumber} already exists`);

      const values = serialNumbers.map((sn) => [uuidv4(), stockInDetailId, itemVariantId || null, sn, user.companyId]);
      await connection.query(
        "INSERT INTO inventorystockinserial (serialId, stockInDetailId, itemVariantId, serialNumber, companyGuid) VALUES ?",
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
