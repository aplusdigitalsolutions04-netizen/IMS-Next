import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, requirePermission, authorizeMasterWrite, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Care Pack durations ride the same generic dropdown_master/dropdown_option
// tables Delivery Partner uses (see app/api/admin/delivery-partners/route.js
// for the full explanation) — scoped per companyGuid, lazily created on
// first use, pre-seeded with the standard 1-5 Year options so the dropdown
// isn't empty before an Admin ever visits this master.
const CODE = "CARE_PACK";
const DEFAULT_OPTIONS = ["1 Year", "2 Year", "3 Year", "4 Year", "5 Year"];

async function getOrCreateMasterId(companyGuid) {
  const [[existing]] = await mysqlPool.query(
    "SELECT id FROM dropdown_master WHERE dropdown_code = ? AND companyGuid = ?",
    [CODE, companyGuid]
  );
  if (existing) return existing.id;

  const guid = randomUUID();
  const [result] = await mysqlPool.query(
    "INSERT INTO dropdown_master (companyGuid, guid, dropdown_code, dropdown_name, fieldType, is_active) VALUES (?, ?, ?, ?, 'DROPDOWN', 1)",
    [companyGuid, guid, CODE, "Care Pack"]
  );
  const masterId = result.insertId;

  await mysqlPool.query(
    `INSERT INTO dropdown_option (guid, dropdown_id, option_label, option_value, display_order, is_active) VALUES ${DEFAULT_OPTIONS.map(() => "(?, ?, ?, ?, ?, 1)").join(",")}`,
    DEFAULT_OPTIONS.flatMap((label, i) => [randomUUID(), masterId, label, label, i + 1])
  );

  return masterId;
}

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "carePackMaster", "Only Admin can manage Care Pack options.");

  const masterId = await getOrCreateMasterId(user.companyId);

  const [rows] = await mysqlPool.query(
    "SELECT guid, option_label AS name, option_value AS value, is_active AS isActive, display_order AS sortOrder FROM dropdown_option WHERE dropdown_id = ? ORDER BY display_order ASC, option_label ASC",
    [masterId]
  );
  return NextResponse.json({ data: rows });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeMasterWrite(user, "carePackMaster", { isCreate: true, denyMessage: "You do not have permission to add Care Pack options." });

  const { name } = await parseJsonBody(request);
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new ApiError(400, "Care Pack name is required.");

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

  return NextResponse.json({ message: "Care Pack option added", guid }, { status: 201 });
});
