import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);
  requireCompany(user);

  const { SpecificationId, CategoryId, SpecName, FieldType, DisplayOrder } = body;
  const name = (SpecName || "").trim();
  const fieldType = FieldType === "TEXTAREA" ? "TEXTAREA" : "DROPDOWN";
  const displayOrder = Number(DisplayOrder) || 0;

  if (!name) throw new ApiError(400, "Specification name is required.");
  if (!CategoryId) throw new ApiError(400, "CategoryId is required.");

  if (SpecificationId && SpecificationId !== "0" && SpecificationId !== "") {
    await mysqlPool.execute(
      `UPDATE dropdown_master
       SET dropdown_name = ?, fieldType = ?, displayOrder = ?
       WHERE id = ? AND categoryId = ? AND companyGuid = ?`,
      [name, fieldType, displayOrder, SpecificationId, CategoryId, user.companyId]
    );
    return NextResponse.json({ message: "Success", specificationId: SpecificationId });
  }

  const [result] = await mysqlPool.execute(
    `INSERT INTO dropdown_master (guid, companyGuid, categoryId, dropdown_code, dropdown_name, fieldType, displayOrder, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [uuidv4(), user.companyId, CategoryId, `CATSPEC_${uuidv4()}`, name, fieldType, displayOrder]
  );
  return NextResponse.json({ message: "Success", specificationId: result.insertId });
});
