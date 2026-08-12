import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, ApiError, authorizeMasterWrite } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);

  const { OptionId, SpecificationId, Label, DisplayOrder } = body;
  const label = (Label || "").trim();
  const displayOrder = Number(DisplayOrder) || 0;
  if (!label) throw new ApiError(400, "Option value is required.");
  if (!SpecificationId) throw new ApiError(400, "SpecificationId is required.");

  const isCreate = !(OptionId && OptionId !== "0" && OptionId !== "");
  authorizeMasterWrite(user, "category", { isCreate });

  const [[spec]] = await mysqlPool.query(
    "SELECT id FROM dropdown_master WHERE id = ? AND companyGuid = ?",
    [SpecificationId, user.companyId]
  );
  if (!spec) throw new ApiError(404, "Specification not found.");

  if (OptionId && OptionId !== "0" && OptionId !== "") {
    await mysqlPool.execute(
      "UPDATE dropdown_option SET option_label = ?, option_value = ?, display_order = ? WHERE id = ? AND dropdown_id = ?",
      [label, label, displayOrder, OptionId, SpecificationId]
    );
    return NextResponse.json({ message: "Success", optionId: OptionId });
  }

  const [result] = await mysqlPool.execute(
    "INSERT INTO dropdown_option (guid, dropdown_id, option_label, option_value, display_order, is_active) VALUES (?, ?, ?, ?, ?, 1)",
    [uuidv4(), SpecificationId, label, label, displayOrder]
  );
  return NextResponse.json({ message: "Success", optionId: result.insertId });
});
