import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireRoles, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

const VALID_COLOR_THEMES = new Set([
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
  "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink",
  "rose", "slate",
]);

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can manage selling platforms.");
  const { id } = await params;

  const { name, isActive, colorTheme } = await parseJsonBody(request);

  const [[platform]] = await mysqlPool.query("SELECT * FROM selling_platforms WHERE guid = ?", [id]);
  if (!platform) throw new ApiError(404, "Platform not found.");

  if (name !== undefined) {
    // The original 4 (isSystem) have their name hardcoded into conditional
    // business logic elsewhere (e.g. GeM-specific order fields) — renaming
    // the master-data row wouldn't rename those checks, so it would silently
    // desync the two. Custom platforms added later have no such logic, so
    // renaming them is safe.
    if (platform.isSystem) throw new ApiError(400, `"${platform.name}" is a built-in platform and can't be renamed — deactivate it instead if you don't want it offered.`);
    const trimmed = String(name).trim();
    if (!trimmed) throw new ApiError(400, "Platform name is required.");
    const [dup] = await mysqlPool.query("SELECT guid FROM selling_platforms WHERE name = ? AND guid != ?", [trimmed, id]);
    if (dup.length) throw new ApiError(400, `"${trimmed}" already exists.`);
    await mysqlPool.query("UPDATE selling_platforms SET name = ? WHERE guid = ?", [trimmed, id]);
  }

  if (isActive !== undefined) {
    await mysqlPool.query("UPDATE selling_platforms SET isActive = ? WHERE guid = ?", [isActive ? 1 : 0, id]);
  }

  if (colorTheme !== undefined) {
    if (!VALID_COLOR_THEMES.has(colorTheme)) throw new ApiError(400, "Invalid color theme.");
    await mysqlPool.query("UPDATE selling_platforms SET colorTheme = ? WHERE guid = ?", [colorTheme, id]);
  }

  return NextResponse.json({ message: "Platform updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can manage selling platforms.");
  const { id } = await params;

  const [[platform]] = await mysqlPool.query("SELECT * FROM selling_platforms WHERE guid = ?", [id]);
  if (!platform) throw new ApiError(404, "Platform not found.");
  if (platform.isSystem) throw new ApiError(400, `"${platform.name}" is a built-in platform and can't be deleted — deactivate it instead.`);

  const [[{ orderCount }]] = await mysqlPool.query("SELECT COUNT(*) as orderCount FROM orders WHERE platform = ?", [platform.name]);
  if (orderCount > 0) {
    throw new ApiError(400, `"${platform.name}" is used by ${orderCount} existing order(s) — deactivate it instead of deleting, so that history stays intact.`);
  }

  await mysqlPool.query("DELETE FROM selling_platforms WHERE guid = ?", [id]);
  return NextResponse.json({ message: "Platform deleted" });
});
