import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, authorizeMasterWrite, authorizeMasterDelete, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

const CODE = "DELIVERY_PARTNER";

// Every row is looked up through this company-scoped join rather than a bare
// dropdown_option.guid match, so one company can never toggle/rename/delete
// another company's delivery partner just by guessing its guid.
async function findOwnedOption(guid, companyGuid) {
  const [[row]] = await mysqlPool.query(
    `SELECT o.id, o.option_label, o.option_value FROM dropdown_option o
     JOIN dropdown_master m ON o.dropdown_id = m.id
     WHERE o.guid = ? AND m.dropdown_code = ? AND m.companyGuid = ?`,
    [guid, CODE, companyGuid]
  );
  return row || null;
}

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeMasterWrite(user, "deliveryPartnerMaster", { isCreate: false, denyMessage: "You do not have permission to edit delivery partners." });
  const { guid } = await params;

  const { name, isActive } = await parseJsonBody(request);
  const option = await findOwnedOption(guid, user.companyId);
  if (!option) throw new ApiError(404, "Delivery partner not found.");

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) throw new ApiError(400, "Delivery partner name is required.");
    await mysqlPool.query(
      "UPDATE dropdown_option SET option_label = ?, option_value = ? WHERE id = ?",
      [trimmed, trimmed, option.id]
    );
  }

  if (isActive !== undefined) {
    await mysqlPool.query("UPDATE dropdown_option SET is_active = ? WHERE id = ?", [isActive ? 1 : 0, option.id]);
  }

  return NextResponse.json({ message: "Delivery partner updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeMasterDelete(user, "deliveryPartnerMaster", "You do not have permission to delete delivery partners.");
  const { guid } = await params;

  const option = await findOwnedOption(guid, user.companyId);
  if (!option) throw new ApiError(404, "Delivery partner not found.");

  const [[{ usageCount }]] = await mysqlPool.query(
    "SELECT COUNT(*) as usageCount FROM order_logistics WHERE courierPartner = ?",
    [option.option_value]
  );
  if (usageCount > 0) {
    throw new ApiError(400, `"${option.option_label}" is used by ${usageCount} existing shipment(s) — deactivate it instead of deleting, so that history stays intact.`);
  }

  await mysqlPool.query("DELETE FROM dropdown_option WHERE id = ?", [option.id]);
  return NextResponse.json({ message: "Delivery partner deleted" });
});
