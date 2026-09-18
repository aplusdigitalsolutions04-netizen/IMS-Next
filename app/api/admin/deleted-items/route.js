import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, requirePermission } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { ensureDeletedByColumns } from "@/lib/deletedItemsMigration";

// Backs the Admin "Deleted Items" screen (components/admin/DeletedItems.jsx)
// — one tab per entity type, each reading straight from that table's own
// isDeleted=1 rows rather than the activity log (useractivitylogs), since
// most delete routes never wrote to that log at all before this feature —
// see the deletedBy/deletedAt columns added in lib/deletedItemsMigration.js
// and populated at each delete call site.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "deletedItems", "Only Admin can view deleted items.");
  await ensureDeletedByColumns();

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "orders";
  const search = (searchParams.get("search") || "").trim();
  const like = `%${search}%`;

  if (type === "orders") {
    const where = search
      ? "AND (o.orderid LIKE ? OR o.customerName LIKE ?)"
      : "";
    const params = search ? [user.companyId, like, like] : [user.companyId];
    const [rows] = await mysqlPool.query(
      `SELECT o.guid, o.orderid as orderId, o.customerName, o.platform, o.status,
         o.cancellationReason as deleteRemarks, o.cancelledBy as deletedBy, o.cancelledAt as deletedAt
       FROM orders o
       WHERE o.isDeleted = 1 AND o.companyGuid = ? ${where}
       ORDER BY o.cancelledAt DESC LIMIT 200`,
      params
    );
    return NextResponse.json({ data: rows });
  }

  if (type === "contracts") {
    const where = search ? "AND (c.contractNumber LIKE ? OR c.bidNumber LIKE ? OR c.organisation LIKE ?)" : "";
    const params = search ? [user.companyId, like, like, like] : [user.companyId];
    const [rows] = await mysqlPool.query(
      `SELECT c.guid, c.contractNumber, c.bidNumber, c.organisation,
         c.deletedBy, c.deletedAt, c.deleteRemarks
       FROM contracts c
       WHERE c.isDeleted = 1 AND c.companyGuid = ? ${where}
       ORDER BY c.deletedAt DESC LIMIT 200`,
      params
    );
    return NextResponse.json({ data: rows });
  }

  if (type === "items") {
    const itemWhere = search ? "AND i.itemName LIKE ?" : "";
    const itemParams = search ? [user.companyId, like] : [user.companyId];
    const [items] = await mysqlPool.query(
      `SELECT i.itemId as id, i.itemName as name, 'Item' as entityType,
         i.deletedBy, i.deletedAt, i.deleteRemarks
       FROM inventoryitemmaster i
       WHERE i.isDeleted = 1 AND i.companyGuid = ? ${itemWhere}
       ORDER BY i.deletedAt DESC LIMIT 200`,
      itemParams
    );

    const variantWhere = search ? "AND (i.itemName LIKE ? OR v.variantName LIKE ?)" : "";
    const variantParams = search ? [user.companyId, like, like] : [user.companyId];
    const [variants] = await mysqlPool.query(
      `SELECT v.itemVariantId as id, CONCAT(i.itemName, ' — ', v.variantName) as name, 'Variant' as entityType,
         v.deletedBy, v.deletedAt, v.deleteRemarks
       FROM inventoryitemvariant v
       JOIN inventoryitemmaster i ON v.itemId = i.itemId
       WHERE v.isDeleted = 1 AND v.companyGuid = ? ${variantWhere}
       ORDER BY v.deletedAt DESC LIMIT 200`,
      variantParams
    );

    const merged = [...items, ...variants].sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
    return NextResponse.json({ data: merged });
  }

  if (type === "serials") {
    const where = search ? "AND s.serialNumber LIKE ?" : "";
    const params = search ? [user.companyId, like] : [user.companyId];
    const [rows] = await mysqlPool.query(
      `SELECT s.guid, s.serialNumber, i.itemName, v.variantName,
         s.deletedBy, s.deletedAt, s.deleteRemarks
       FROM inventorystockinserial s
       LEFT JOIN inventoryitemvariant v ON s.itemVariantId = v.itemVariantId
       LEFT JOIN inventoryitemmaster i ON v.itemId = i.itemId
       WHERE s.isDeleted = 1 AND s.companyGuid = ? ${where}
       ORDER BY s.deletedAt DESC LIMIT 200`,
      params
    );
    return NextResponse.json({ data: rows });
  }

  return NextResponse.json({ data: [] });
});
