import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany } from "@/lib/auth";
import { authorizeFbfFba } from "@/lib/fbfFbaAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Powers the "Sell Out History" tab — the referenceId/amount/date entered on
// the Sell Out form (see FbfModals.jsx's sellData) only ever landed in
// fbf_fba_transactions with no screen reading it back; this is that screen's
// data source. Defaults to transactionType='OUT' (sell-outs) since that's
// the only transaction type with no other visibility anywhere in the app —
// 'IN' (add-stock) and returns are already visible via the stock list itself.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeFbfFba(user, "GET");

  const { searchParams } = new URL(request.url);
  const transactionType = searchParams.get("transactionType") || "OUT";
  const type = searchParams.get("type"); // optional FBF/FBA filter
  const serialNumber = searchParams.get("serialNumber"); // optional — single-serial lookup (global search)

  const conditions = ["t.companyGuid = ?", "t.transactionType = ?"];
  const params = [user.companyId, transactionType];
  if (type) {
    conditions.push("t.type = ?");
    params.push(type);
  }
  if (serialNumber) {
    // fbf_fba_transactions.serialNumbers is stored as a genuine JSON array
    // (see JSON_TABLE usage in return-lookup/route.js), so JSON_CONTAINS
    // compares JSON values rather than raw strings — no collation mismatch
    // like the one fixed in return-lookup/route.js's JSON_TABLE join.
    conditions.push("JSON_CONTAINS(t.serialNumbers, JSON_QUOTE(?))");
    params.push(serialNumber);
  }

  const [rows] = await mysqlPool.query(
    `SELECT
        t.guid, t.type, t.itemKind, t.transactionType, t.quantity, t.amount,
        t.transactionDate, t.referenceId, t.serialNumbers, t.createdBy, t.createdAt,
        w.warehouseName, w.state as warehouseState, w.platform as warehousePlatform,
        COALESCE(miv.variantName, i.itemName) as itemName,
        COALESCE(mb.brandName, b.brandName) as brand
     FROM fbf_fba_transactions t
     LEFT JOIN inventoryitemvariant miv ON t.modelGuid = miv.itemVariantId
     LEFT JOIN inventoryitemmaster mim ON miv.itemId = mim.itemId
     LEFT JOIN inventorybrandmaster mb ON mim.brandId = mb.brandId
     LEFT JOIN inventoryitemmaster i ON t.itemId = i.itemId
     LEFT JOIN inventorybrandmaster b ON i.brandId = b.brandId
     LEFT JOIN fbf_fba_warehouses w ON t.warehouseGuid = w.guid
     WHERE ${conditions.join(" AND ")}
     ORDER BY t.transactionDate DESC, t.createdAt DESC
     ${serialNumber ? "LIMIT 1" : ""}`,
    params
  );

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      serialNumbers: (() => {
        try {
          return JSON.parse(r.serialNumbers || "[]");
        } catch {
          return [];
        }
      })(),
    }))
  );
});
