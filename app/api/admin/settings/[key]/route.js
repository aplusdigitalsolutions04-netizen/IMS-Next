import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireRoles, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can change business settings.");
  const { key } = await params;

  const { value } = await parseJsonBody(request);
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new ApiError(400, "A value is required.");
  }

  const [[setting]] = await mysqlPool.query("SELECT valueType FROM app_settings WHERE settingKey = ?", [key]);
  if (!setting) throw new ApiError(404, "Setting not found.");

  if (setting.valueType === "number" && !Number.isFinite(Number(value))) {
    throw new ApiError(400, "This setting requires a numeric value.");
  }
  if (setting.valueType === "boolean" && !["true", "false"].includes(String(value))) {
    throw new ApiError(400, "This setting requires true or false.");
  }

  await mysqlPool.query(
    "UPDATE app_settings SET settingValue = ?, updatedBy = ? WHERE settingKey = ?",
    [String(value), user.username || user.email || "Admin", key]
  );

  return NextResponse.json({ message: "Setting updated" });
});
