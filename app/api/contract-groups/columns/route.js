import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { authorizeGroups } from "@/lib/contractGroupsHelpers";

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const { label, type = "text", options } = await parseJsonBody(request);
  const cleanLabel = String(label || "").trim();
  if (!cleanLabel) throw new ApiError(400, "Column name is required.");
  if (!["text", "number", "date", "dropdown"].includes(type)) throw new ApiError(400, "Invalid column type.");
  const opts = type === "dropdown" ? (Array.isArray(options) ? options.map((o) => String(o).trim()).filter(Boolean) : []) : [];
  if (type === "dropdown" && opts.length === 0) throw new ApiError(400, "Add at least one dropdown option.");
  const [[{ n }]] = await mysqlPool.query("SELECT COUNT(*) AS n FROM contract_group_columns WHERE isActive = 1");
  const guid = randomUUID();
  await mysqlPool.query("INSERT INTO contract_group_columns (guid, label, type, options, displayOrder) VALUES (?, ?, ?, ?, ?)", [guid, cleanLabel, type, opts.length ? JSON.stringify(opts) : null, n]);
  return NextResponse.json({ message: "Column added", guid }, { status: 201 });
});

export const DELETE = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  await authorizeGroups(user);
  const guid = new URL(request.url).searchParams.get("guid");
  if (!guid) throw new ApiError(400, "Column guid is required.");
  await mysqlPool.query("UPDATE contract_group_columns SET isActive = 0 WHERE guid = ?", [guid]);
  return NextResponse.json({ message: "Column removed" });
});
