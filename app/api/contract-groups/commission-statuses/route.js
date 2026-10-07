import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { authorizeGroups } from "@/lib/contractGroupsHelpers";

const COLORS = ["slate", "emerald", "rose", "amber", "indigo", "sky", "violet", "orange"];
const cleanColor = (c) => (COLORS.includes(c) ? c : "slate");

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const [rows] = await mysqlPool.query("SELECT guid, label, color, isActive FROM contract_group_commission_statuses ORDER BY displayOrder, createdAt");
  return NextResponse.json({ statuses: rows });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const { label, color } = await parseJsonBody(request);
  const clean = String(label || "").trim();
  if (!clean) throw new ApiError(400, "Status name is required.");
  const [[dup]] = await mysqlPool.query("SELECT guid FROM contract_group_commission_statuses WHERE isActive = 1 AND LOWER(label) = ?", [clean.toLowerCase()]);
  if (dup) throw new ApiError(409, "This status already exists.");
  const [[{ n }]] = await mysqlPool.query("SELECT COUNT(*) AS n FROM contract_group_commission_statuses");
  const guid = randomUUID();
  await mysqlPool.query("INSERT INTO contract_group_commission_statuses (guid, label, color, displayOrder) VALUES (?, ?, ?, ?)", [guid, clean, cleanColor(color), n]);
  return NextResponse.json({ message: "Status added", guid }, { status: 201 });
});

export const PUT = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const { guid, label, color } = await parseJsonBody(request);
  if (!guid) throw new ApiError(400, "Status guid is required.");
  const sets = [];
  const values = [];
  if (label !== undefined) {
    const clean = String(label).trim();
    if (!clean) throw new ApiError(400, "Status name is required.");
    sets.push("label = ?"); values.push(clean);
  }
  if (color !== undefined) { sets.push("color = ?"); values.push(cleanColor(color)); }
  if (sets.length > 0) await mysqlPool.query(`UPDATE contract_group_commission_statuses SET ${sets.join(", ")} WHERE guid = ?`, [...values, guid]);
  return NextResponse.json({ message: "Status updated" });
});

// Soft delete: rows that already use it keep showing it.
export const DELETE = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const guid = new URL(request.url).searchParams.get("guid");
  if (!guid) throw new ApiError(400, "Status guid is required.");
  await mysqlPool.query("UPDATE contract_group_commission_statuses SET isActive = 0 WHERE guid = ?", [guid]);
  return NextResponse.json({ message: "Status removed" });
});
