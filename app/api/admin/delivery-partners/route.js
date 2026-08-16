import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, requirePermission, authorizeMasterWrite, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Delivery partners ride the existing generic dropdown_master/dropdown_option
// tables under the "DELIVERY_PARTNER" code — the same code MasterDropdown
// already reads from in Dispatch.jsx's "Courier Partner" field. Unlike
// selling_platforms (global), dropdown_master is scoped per companyGuid, so
// each company gets (and, on first use, lazily gets created) its own row.
const CODE = "DELIVERY_PARTNER";

async function getOrCreateMasterId(companyGuid) {
  const [[existing]] = await mysqlPool.query(
    "SELECT id FROM dropdown_master WHERE dropdown_code = ? AND companyGuid = ?",
    [CODE, companyGuid]
  );
  if (existing) return existing.id;

  const guid = randomUUID();
  const [result] = await mysqlPool.query(
    "INSERT INTO dropdown_master (companyGuid, guid, dropdown_code, dropdown_name, fieldType, is_active) VALUES (?, ?, ?, ?, 'DROPDOWN', 1)",
    [companyGuid, guid, CODE, "Delivery Partner"]
  );
  return result.insertId;
}

// Full rows (including inactive) for the admin Delivery Partners tab —
// GET /api/dropdown/DELIVERY_PARTNER is the active-only list every dispatch
// form's Courier Partner dropdown actually consumes.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "deliveryPartnerMaster", "Only Admin can manage delivery partners.");

  const [[master]] = await mysqlPool.query(
    "SELECT id FROM dropdown_master WHERE dropdown_code = ? AND companyGuid = ?",
    [CODE, user.companyId]
  );
  if (!master) return NextResponse.json({ data: [] });

  const [rows] = await mysqlPool.query(
    "SELECT guid, option_label AS name, option_value AS value, is_active AS isActive, display_order AS sortOrder FROM dropdown_option WHERE dropdown_id = ? ORDER BY display_order ASC, option_label ASC",
    [master.id]
  );
  return NextResponse.json({ data: rows });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeMasterWrite(user, "deliveryPartnerMaster", { isCreate: true, denyMessage: "You do not have permission to add delivery partners." });

  const { name } = await parseJsonBody(request);
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new ApiError(400, "Delivery partner name is required.");

  const masterId = await getOrCreateMasterId(user.companyId);

  const [existing] = await mysqlPool.query(
    "SELECT guid FROM dropdown_option WHERE dropdown_id = ? AND LOWER(option_label) = LOWER(?)",
    [masterId, trimmed]
  );
  if (existing.length) throw new ApiError(400, `"${trimmed}" already exists.`);

  const [[{ maxSort }]] = await mysqlPool.query(
    "SELECT COALESCE(MAX(display_order), 0) as maxSort FROM dropdown_option WHERE dropdown_id = ?",
    [masterId]
  );
  const guid = randomUUID();

  await mysqlPool.query(
    "INSERT INTO dropdown_option (guid, dropdown_id, option_label, option_value, display_order, is_active) VALUES (?, ?, ?, ?, ?, 1)",
    [guid, masterId, trimmed, trimmed, maxSort + 1]
  );

  return NextResponse.json({ message: "Delivery partner added", guid }, { status: 201 });
});
