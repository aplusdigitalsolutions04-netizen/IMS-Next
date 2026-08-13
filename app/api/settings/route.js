import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

// Read-only for any authenticated user — these are business rules (e.g. the
// E-Way Bill value threshold) that every page needs to apply consistently,
// not admin-only secrets. Only the admin/settings/[key] PUT route can change
// them. Returned as a plain {key: typedValue} map so callers don't need to
// know about settingValue/valueType — just `settings.eway_bill_threshold`.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);

  const [rows] = await mysqlPool.query("SELECT settingKey, settingValue, valueType FROM app_settings");
  const settings = {};
  for (const r of rows) {
    if (r.valueType === "number") settings[r.settingKey] = Number(r.settingValue);
    else if (r.valueType === "boolean") settings[r.settingKey] = r.settingValue === "true";
    else settings[r.settingKey] = r.settingValue;
  }
  return NextResponse.json({ data: settings });
});
