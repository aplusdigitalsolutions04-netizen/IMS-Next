import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureCredentialsTables, ensureCredentialCategorySeeded, CREDENTIAL_CATEGORY_CODE } from "@/lib/credentialsMigration";
import { requireManage } from "@/lib/credentialsHelpers";

async function getMasterId() {
  await ensureCredentialCategorySeeded();
  const [[m]] = await mysqlPool.query("SELECT id FROM dropdown_master WHERE dropdown_code = ?", [CREDENTIAL_CATEGORY_CODE]);
  return m.id;
}

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requirePermission(user, "credentials", "You do not have permission to access credentials.");
  const masterId = await getMasterId();
  const [rows] = await mysqlPool.query(
    "SELECT option_label AS label, option_value AS value FROM dropdown_option WHERE dropdown_id = ? AND is_active = 1 ORDER BY display_order ASC",
    [masterId]
  );
  return NextResponse.json({ data: rows });
});

// Rename: credentials already using the old name are moved to the new one, so
// nothing is left pointing at a category that no longer exists.
export const PUT = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requirePermission(user, "credentials", "You do not have permission to access credentials.");
  requireManage(user);
  const { name, newName } = await parseJsonBody(request);
  const oldValue = String(name || "").trim();
  const next = String(newName || "").trim();
  if (!oldValue || !next) throw new ApiError(400, "Category name is required.");

  const masterId = await getMasterId();
  const [[option]] = await mysqlPool.query(
    "SELECT id FROM dropdown_option WHERE dropdown_id = ? AND option_value = ?", [masterId, oldValue]
  );
  if (!option) throw new ApiError(404, "Category not found.");
  const [dupe] = await mysqlPool.query(
    "SELECT id FROM dropdown_option WHERE dropdown_id = ? AND LOWER(option_label) = LOWER(?) AND id <> ?",
    [masterId, next, option.id]
  );
  if (dupe.length) throw new ApiError(400, `"${next}" already exists.`);

  await ensureCredentialsTables();
  await mysqlPool.query("UPDATE dropdown_option SET option_label = ?, option_value = ? WHERE id = ?", [next, next, option.id]);
  await mysqlPool.query("UPDATE credentials SET category = ? WHERE category = ?", [next, oldValue]);
  return NextResponse.json({ message: "Category renamed", value: next });
});

// Deleting a category that credentials still use would leave them pointing at
// a value that's no longer in the list, so it's blocked (any company's
// credentials count — the category list itself is shared).
export const DELETE = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requirePermission(user, "credentials", "You do not have permission to access credentials.");
  requireManage(user);
  const { name } = await parseJsonBody(request);
  const value = String(name || "").trim();
  if (!value) throw new ApiError(400, "Category name is required.");

  const masterId = await getMasterId();
  const [[option]] = await mysqlPool.query(
    "SELECT id, option_label FROM dropdown_option WHERE dropdown_id = ? AND option_value = ?",
    [masterId, value]
  );
  if (!option) throw new ApiError(404, "Category not found.");

  await ensureCredentialsTables();
  const [[{ used }]] = await mysqlPool.query(
    "SELECT COUNT(*) AS used FROM credentials WHERE category = ? AND isDeleted = 0", [value]
  );
  if (used > 0) {
    throw new ApiError(400, `"${option.option_label}" is used by ${used} credential(s) — change or delete those first.`);
  }

  await mysqlPool.query("DELETE FROM dropdown_option WHERE id = ?", [option.id]);
  return NextResponse.json({ message: "Category deleted" });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requirePermission(user, "credentials", "You do not have permission to access credentials.");
  requireManage(user);
  const { name } = await parseJsonBody(request);
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new ApiError(400, "Category name is required.");

  const masterId = await getMasterId();
  const [existing] = await mysqlPool.query(
    "SELECT guid FROM dropdown_option WHERE dropdown_id = ? AND LOWER(option_label) = LOWER(?)",
    [masterId, trimmed]
  );
  if (existing.length) return NextResponse.json({ message: "Already exists", value: trimmed });
  const [[{ maxSort }]] = await mysqlPool.query(
    "SELECT COALESCE(MAX(display_order), 0) as maxSort FROM dropdown_option WHERE dropdown_id = ?", [masterId]
  );
  await mysqlPool.query(
    "INSERT INTO dropdown_option (guid, dropdown_id, option_label, option_value, display_order, is_active) VALUES (?, ?, ?, ?, ?, 1)",
    [randomUUID(), masterId, trimmed, trimmed, maxSort + 1]
  );
  return NextResponse.json({ message: "Category added", value: trimmed }, { status: 201 });
});
