import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, requirePermission, authorizeMasterWrite, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureCarePackDropdownSeeded } from "@/lib/carePackMigration";

// Care Pack durations ride the same generic dropdown_master/dropdown_option
// tables Delivery Partner uses (see app/api/admin/delivery-partners/route.js)
// — but unlike Delivery Partner, this one is intentionally GLOBAL, not
// per-company: dropdown_code carries a UNIQUE constraint (one row per code,
// full stop). Seeding (ensureCarePackDropdownSeeded) is shared with
// app/api/dropdown/[code]/route.js — see lib/carePackMigration.js for why
// both need to ensure it, not just this admin route.
const CODE = "CARE_PACK";

async function getMasterId() {
  await ensureCarePackDropdownSeeded();
  const [[master]] = await mysqlPool.query(
    "SELECT id FROM dropdown_master WHERE dropdown_code = ?",
    [CODE]
  );
  return master.id;
}

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "carePackMaster", "Only Admin can manage Care Pack options.");

  const masterId = await getMasterId();

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

  const masterId = await getMasterId();

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
