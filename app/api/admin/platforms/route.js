import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireRoles, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

const COLOR_THEMES = [
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
  "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink",
  "rose", "slate",
];

// Full rows (including inactive ones + isSystem flag) for the admin Platform
// Master page — GET /api/platforms is the active-only, plain-value list
// everything else in the app actually consumes.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can manage selling platforms.");

  const [rows] = await mysqlPool.query("SELECT * FROM selling_platforms ORDER BY sortOrder ASC, name ASC");
  return NextResponse.json({ data: rows });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can manage selling platforms.");

  const { name, colorTheme: requestedColor } = await parseJsonBody(request);
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new ApiError(400, "Platform name is required.");
  if (requestedColor !== undefined && !COLOR_THEMES.includes(requestedColor)) {
    throw new ApiError(400, "Invalid color theme.");
  }

  const [existing] = await mysqlPool.query("SELECT guid FROM selling_platforms WHERE name = ?", [trimmed]);
  if (existing.length) throw new ApiError(400, `"${trimmed}" already exists.`);

  const [[{ maxSort }]] = await mysqlPool.query("SELECT COALESCE(MAX(sortOrder), 0) as maxSort FROM selling_platforms");
  const colorTheme = requestedColor || COLOR_THEMES[maxSort % COLOR_THEMES.length];
  const guid = randomUUID();

  await mysqlPool.query(
    "INSERT INTO selling_platforms (guid, name, colorTheme, sortOrder, isActive, isSystem) VALUES (?, ?, ?, ?, 1, 0)",
    [guid, trimmed, colorTheme, maxSort + 1]
  );

  return NextResponse.json({ message: "Platform added", guid }, { status: 201 });
});
