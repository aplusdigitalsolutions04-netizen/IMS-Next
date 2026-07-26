import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeReadWrite, requireCompany } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeReadWrite(user, "GET", { permission: "dashboard", denyMessage: "You do not have access to search." });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const type = searchParams.get("type");
  if (!q || q.trim().length < 2) return NextResponse.json([]);
  const term = `%${q.trim()}%`;
  const cid = user.companyId;
  let results = [];

  if (!type || type === "all" || type === "models") {
    const [r] = await mysqlPool.query(
      "SELECT 'model' as type, v.itemVariantId as id, v.variantName as title, b.brandName as subtitle, c.categoryName as extra" +
      " FROM inventoryitemvariant v LEFT JOIN inventoryitemmaster i ON v.itemId=i.itemId LEFT JOIN inventorybrandmaster b ON i.brandId=b.brandId LEFT JOIN inventorycategorymaster c ON i.categoryId=c.categoryId" +
      " WHERE (v.variantName LIKE ? OR b.brandName LIKE ? OR c.categoryName LIKE ?) AND v.isDeleted=0 AND v.companyGuid=?" +
      " ORDER BY title",
      [term, term, term, cid]
    );
    results = results.concat(r);
  }
  if (!type || type === "all" || type === "serials") {
    const [r] = await mysqlPool.query(
      "SELECT 'serial' as type, s.guid, s.serialNumber as title, itv.variantName as subtitle, s.serialStatus as extra FROM inventorystockinserial s" +
      " LEFT JOIN inventoryitemvariant itv ON s.itemVariantId=itv.itemVariantId AND itv.isDeleted=0" +
      " WHERE s.serialNumber LIKE ? AND s.isDeleted=0 AND s.companyGuid=? ORDER BY s.serialNumber",
      [term, cid]
    );
    results = results.concat(r);
  }
  if (!type || type === "all" || type === "dispatches") {
    const [r] = await mysqlPool.query(
      "SELECT 'dispatch' as type, oi.guid, o.platform as title, o.orderid as subtitle, o.status as extra FROM order_items oi JOIN orders o ON oi.orderGuid=o.guid WHERE (o.platform LIKE ? OR o.orderid LIKE ? OR o.address LIKE ? OR o.shippingAddress LIKE ?) AND o.isDeleted=0 AND o.companyGuid=? ORDER BY o.dispatchDate DESC",
      [term, term, term, term, cid]
    );
    results = results.concat(r);
  }
  if (!type || type === "all" || type === "returns") {
    const [r] = await mysqlPool.query(
      "SELECT 'return' as type, r.guid, s.serialNumber as title, r.condition as subtitle, r.returnDate as extra FROM returns r JOIN inventorystockinserial s ON r.serialNumberGuid=s.guid WHERE s.serialNumber LIKE ? AND r.isDeleted=0 AND r.companyGuid=? ORDER BY r.returnDate DESC",
      [term, cid]
    );
    results = results.concat(r);
  }

  return NextResponse.json(results.slice(0, 50));
});
