import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeMasterWrite, authorizeMasterDelete, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensurePlatformItemTypeColumn } from "@/lib/platformsMigration";

const VALID_COLOR_THEMES = new Set([
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
  "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink",
  "rose", "slate",
]);

const VALID_ITEM_TYPE_MODES = new Set(["serialized", "nonSerialized", "both"]);

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "platformMaster", { isCreate: false, denyMessage: "You do not have permission to edit selling platforms." });
  const { id } = await params;
  await ensurePlatformItemTypeColumn();

  const { name, isActive, colorTheme, itemTypeMode } = await parseJsonBody(request);

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
    const [dup] = await mysqlPool.query("SELECT guid FROM selling_platforms WHERE LOWER(name) = LOWER(?) AND guid != ?", [trimmed, id]);
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

  if (itemTypeMode !== undefined) {
    if (!VALID_ITEM_TYPE_MODES.has(itemTypeMode)) throw new ApiError(400, "Invalid item type mode.");
    await mysqlPool.query("UPDATE selling_platforms SET itemTypeMode = ? WHERE guid = ?", [itemTypeMode, id]);
  }

  return NextResponse.json({ message: "Platform updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeMasterDelete(user, "platformMaster", "You do not have permission to delete selling platforms.");
  const { id } = await params;

  const [[platform]] = await mysqlPool.query("SELECT * FROM selling_platforms WHERE guid = ?", [id]);
  if (!platform) throw new ApiError(404, "Platform not found.");
  // Built-in platform names are hardcoded into GeM-specific business logic
  // elsewhere (see the PUT handler's rename block above for the same
  // reasoning), so deleting one is gated behind the same allow_delete_
  // platformMaster flag that already governs deleting custom platforms —
  // Admin always has it (authorizeMasterDelete's isSuperUser bypass sets it
  // unconditionally in sanitizeUser), and any other role only gets it if
  // explicitly granted via Manage Roles. The orderCount check right below
  // still applies regardless, so a platform actively in use by real orders
  // can't be deleted out from under them even with this flag.
  if (platform.isSystem && !user.allow_delete_platformMaster) {
    throw new ApiError(400, `"${platform.name}" is a built-in platform and can't be deleted — deactivate it instead.`);
  }

  const [[{ orderCount }]] = await mysqlPool.query("SELECT COUNT(*) as orderCount FROM orders WHERE platform = ?", [platform.name]);
  if (orderCount > 0) {
    throw new ApiError(400, `"${platform.name}" is used by ${orderCount} existing order(s) — deactivate it instead of deleting, so that history stays intact.`);
  }

  await mysqlPool.query("DELETE FROM selling_platforms WHERE guid = ?", [id]);
  return NextResponse.json({ message: "Platform deleted" });
});
