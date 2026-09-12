import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, authorizeMasterWrite, authorizeMasterDelete, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

const CODE = "CARE_PACK";

// Care Pack is a single global list (dropdown_code is UNIQUE — see
// app/api/admin/care-pack/route.js), so every company's Admin manages the
// same shared rows; this join just confirms the guid actually belongs to
// the CARE_PACK dropdown rather than some other dropdown_code entirely.
async function findOwnedOption(guid) {
  const [[row]] = await mysqlPool.query(
    `SELECT o.id, o.option_label, o.option_value FROM dropdown_option o
     JOIN dropdown_master m ON o.dropdown_id = m.id
     WHERE o.guid = ? AND m.dropdown_code = ?`,
    [guid, CODE]
  );
  return row || null;
}

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeMasterWrite(user, "carePackMaster", { isCreate: false, denyMessage: "You do not have permission to edit Care Pack options." });
  const { guid } = await params;

  const { name, isActive } = await parseJsonBody(request);
  const option = await findOwnedOption(guid);
  if (!option) throw new ApiError(404, "Care Pack option not found.");

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) throw new ApiError(400, "Care Pack name is required.");
    await mysqlPool.query(
      "UPDATE dropdown_option SET option_label = ?, option_value = ? WHERE id = ?",
      [trimmed, trimmed, option.id]
    );
  }

  if (isActive !== undefined) {
    await mysqlPool.query("UPDATE dropdown_option SET is_active = ? WHERE id = ?", [isActive ? 1 : 0, option.id]);
  }

  return NextResponse.json({ message: "Care Pack option updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeMasterDelete(user, "carePackMaster", "You do not have permission to delete Care Pack options.");
  const { guid } = await params;

  const option = await findOwnedOption(guid);
  if (!option) throw new ApiError(404, "Care Pack option not found.");

  const [[{ usageCount }]] = await mysqlPool.query(
    "SELECT COUNT(*) as usageCount FROM inventorystockinserial WHERE carePack = ?",
    [option.option_value]
  );
  if (usageCount > 0) {
    throw new ApiError(400, `"${option.option_label}" is used by ${usageCount} existing serial(s) — deactivate it instead of deleting, so that history stays intact.`);
  }

  await mysqlPool.query("DELETE FROM dropdown_option WHERE id = ?", [option.id]);
  return NextResponse.json({ message: "Care Pack option deleted" });
});
