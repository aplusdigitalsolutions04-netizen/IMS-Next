import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { ensureCarePackDropdownSeeded } from "@/lib/carePackMigration";

export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  const { code } = await params;

  // CARE_PACK is seeded lazily (default 1-5 Year options) the first time
  // ANYONE reads it — not only when an Admin happens to open Care Pack
  // Master first. Without this, a fresh install where no Admin had visited
  // that settings page yet showed the Care Pack picker in New Dispatch/
  // Stock-In/Item Variant Master as silently empty instead of pre-seeded.
  if (code === "CARE_PACK") {
    await ensureCarePackDropdownSeeded();
  }

  const query = `
    SELECT o.option_label AS label, o.option_value AS value
    FROM dropdown_option o
    JOIN dropdown_master m ON o.dropdown_id = m.id
    WHERE m.dropdown_code = ?
      AND m.is_active = 1
      AND o.is_active = 1
    ORDER BY o.display_order ASC
  `;
  const [rows] = await mysqlPool.query(query, [code]);

  let combined = rows;
  if (code === "COMPANY") {
    try {
      const [brandRows] = await mysqlPool.query(
        "SELECT brandName AS label, brandName AS value FROM inventorybrandmaster WHERE isDeleted = 0 AND showInModels = 1 ORDER BY brandName ASC"
      );
      const seen = new Set(rows.map((r) => r.value.trim().toLowerCase()));
      const extra = brandRows.filter((b) => !seen.has(b.value.trim().toLowerCase()));
      combined = [...rows, ...extra];
    } catch (brandErr) {
      console.error("Brand Master merge into COMPANY dropdown failed (falling back to base list):", brandErr.message);
    }
  }

  return NextResponse.json({ success: true, data: combined });
});
