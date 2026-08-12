import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);
  requireCompany(user);

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");
  if (!categoryId) throw new ApiError(400, "categoryId is required.");

  const [specs] = await mysqlPool.query(
    `SELECT id AS specificationId, dropdown_name AS specName, fieldType, displayOrder
     FROM dropdown_master
     WHERE categoryId = ? AND companyGuid = ? AND is_active = 1
     ORDER BY displayOrder ASC, dropdown_name ASC`,
    [categoryId, user.companyId]
  );

  const dropdownSpecIds = specs.filter((s) => s.fieldType === "DROPDOWN").map((s) => s.specificationId);
  let optionsBySpec = {};
  if (dropdownSpecIds.length) {
    const [options] = await mysqlPool.query(
      `SELECT id AS optionId, dropdown_id AS specificationId, option_label AS label, option_value AS value, display_order AS displayOrder
       FROM dropdown_option
       WHERE dropdown_id IN (?) AND is_active = 1
       ORDER BY display_order ASC, option_label ASC`,
      [dropdownSpecIds]
    );
    optionsBySpec = options.reduce((acc, o) => {
      (acc[o.specificationId] ||= []).push(o);
      return acc;
    }, {});
  }

  const data = specs.map((s) => ({
    ...s,
    options: s.fieldType === "DROPDOWN" ? optionsBySpec[s.specificationId] || [] : [],
  }));

  return NextResponse.json({ message: "Success", data });
});
