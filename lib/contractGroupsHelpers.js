import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { requireCompany, requirePermission, hasAllCompaniesAccess, ApiError } from "@/lib/auth";
import { normGstin, extractGstins } from "@/lib/companyMatch";
import { ensureContractGroupsTables } from "@/lib/contractGroupsMigration";

// Everything here only READS contracts/orders/inventory. Group rows are
// snapshot copies in contract_group_rows — nothing is ever written back.
//
// Lookups are done as separate IN (...) queries and joined in JS (not SQL
// JOINs): guid columns across contracts/orders/inventory tables don't share
// a collation on every environment ("Illegal mix of collations").

export const MATCH_FIELDS = [
  { key: "buyerAddress", label: "Address" },
  { key: "buyerGstin", label: "GSTIN" },
  { key: "buyerEmail", label: "Email ID" },
  { key: "department", label: "Department" },
  { key: "organisation", label: "Organisation" },
  { key: "ministry", label: "Ministry" },
];
const MATCH_KEYS = new Set(MATCH_FIELDS.map((f) => f.key));
const EMPTY_LIKE = new Set(["", "na", "n/a", "none", "null", "nil", "-", "--"]);

const normText = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const isValidMatchFields = (fields) =>
  Array.isArray(fields) && fields.length > 0 && fields.every((f) => MATCH_KEYS.has(f));

// Normalized comparison value for one matching field; "" means "no usable
// value" (a blank/N/A field never groups anything together).
export function fieldValue(contract, key) {
  const raw = contract?.[key];
  if (key === "buyerGstin") {
    const g = extractGstins(raw);
    return g.length > 0 ? g.sort().join(",") : normGstin(raw).length >= 10 ? normGstin(raw) : "";
  }
  const v = normText(raw);
  return EMPTY_LIKE.has(v) ? "" : v;
}

// "Payment Pending" = goods already delivered, payment still due (it is set
// when logisticsStatus becomes "Delivered"); "Completed" = delivered + paid.
// A returned/RTO/cancelled order is not counted as delivered.
const DELIVERED_ORDER_STATUSES = new Set(["Payment Pending", "Completed", "Delivered", "Partially Returned"]);
const NOT_DELIVERED_ORDER_STATUSES = new Set(["Returned", "RTO", "Order Cancelled"]);
export const isDeliveredOrder = (order, logisticsStatus) => {
  if (!order || NOT_DELIVERED_ORDER_STATUSES.has(order.status)) return false;
  return DELIVERED_ORDER_STATUSES.has(order.status) || logisticsStatus === "Delivered";
};
async function loadLogisticsStatuses(orderGuids) {
  const map = new Map();
  if (orderGuids.length === 0) return map;
  const [rows] = await mysqlPool.query("SELECT orderGuid, logisticsStatus FROM order_logistics WHERE orderGuid IN (?)", [orderGuids]);
  for (const r of rows) map.set(r.orderGuid, r.logisticsStatus);
  return map;
}
export const CANCELLED_SOURCE_STATUSES = ["Cancelled", "Order Cancelled"];

export const authorizeGroups = async (user) => {
  requireCompany(user);
  requirePermission(user, "contractGroups", "You do not have permission to access Contract Groups.");
  await ensureContractGroupsTables();
};

// Groups belong to ONE company — the company the user is working in (the one
// picked in the header). Listing, creating, suggesting and adding all stay
// inside it, so each company's groups only ever hold that company's own
// contracts. (This used to be "every company" for Admin / all-companies users,
// which mixed all firms' contracts into the same groups.) Contracts of the same
// buyer in OTHER companies are shown separately on the group's page and only
// added on request.
export const scopeCompanyGuids = (user) => [user.companyId];

export async function loadCompanyNames() {
  const [rows] = await mysqlPool.query("SELECT guid, name FROM companies WHERE isActive = 1");
  return new Map(rows.map((c) => [c.guid, c.name]));
}

export async function loadGroupOrThrow(id, user) {
  const [[group]] = await mysqlPool.query("SELECT * FROM contract_groups WHERE guid = ? AND isDeleted = 0", [id]);
  // Everyone works inside their own company's groups; people with all-companies access
  // (Admin etc.) may also open another company's group from the list's company selector.
  if (!group || (!hasAllCompaniesAccess(user) && group.companyGuid !== user.companyId)) {
    throw new ApiError(404, "Group not found.");
  }
  return group;
}

export const parseJson = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

const toDateOnly = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
};
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);

// Landing price per unit for each (orderGuid|variantId): average landingPrice
// of the actual serials on that order for that variant; falls back to the
// variant's purchasePrice, then null (the user fills it in manually).
async function loadLandingContext(orderGuids, extraVariantIds) {
  const itemsByOrder = new Map();
  let items = [];
  if (orderGuids.length > 0) {
    [items] = await mysqlPool.query(
      "SELECT guid, orderGuid, itemVariantId, quantity, sellingPrice, serialNumberGuid FROM order_items WHERE orderGuid IN (?)",
      [orderGuids]
    );
  }
  for (const it of items) {
    if (!itemsByOrder.has(it.orderGuid)) itemsByOrder.set(it.orderGuid, []);
    itemsByOrder.get(it.orderGuid).push(it);
  }
  const serialGuids = [...new Set(items.map((i) => i.serialNumberGuid).filter(Boolean))];
  const serialLanding = new Map();
  if (serialGuids.length > 0) {
    const [rows] = await mysqlPool.query("SELECT guid, landingPrice FROM inventorystockinserial WHERE guid IN (?)", [serialGuids]);
    for (const r of rows) serialLanding.set(r.guid, r.landingPrice == null ? null : Number(r.landingPrice));
  }
  const variantIds = [...new Set([...items.map((i) => i.itemVariantId), ...extraVariantIds].filter(Boolean))];
  const variants = new Map();
  if (variantIds.length > 0) {
    const [rows] = await mysqlPool.query("SELECT itemVariantId, variantName, purchasePrice FROM inventoryitemvariant WHERE itemVariantId IN (?)", [variantIds]);
    for (const r of rows) variants.set(r.itemVariantId, { name: r.variantName, purchasePrice: r.purchasePrice == null ? null : Number(r.purchasePrice) });
  }
  // Fallback sources when the order itself has no serial landing price:
  // the average landing price of every serial of that variant in inventory,
  // then the variant's stock purchase rate, then its purchasePrice field.
  const variantSerialAvg = new Map();
  const variantRate = new Map();
  if (variantIds.length > 0) {
    const [avgRows] = await mysqlPool.query(
      "SELECT itemVariantId, AVG(landingPrice) AS a FROM inventorystockinserial WHERE isDeleted = 0 AND landingPrice > 0 AND itemVariantId IN (?) GROUP BY itemVariantId",
      [variantIds]
    );
    for (const r of avgRows) variantSerialAvg.set(r.itemVariantId, Number(r.a));
    const [rateRows] = await mysqlPool.query("SELECT itemVariantId, avgPurchaseRate, lastPurchaseRate FROM inventoryvariantstock WHERE itemVariantId IN (?)", [variantIds]);
    for (const r of rateRows) variantRate.set(r.itemVariantId, Number(r.avgPurchaseRate) || Number(r.lastPurchaseRate) || 0);
  }
  const landingFor = (orderGuid, variantId) => {
    if (!variantId) return null;
    const serials = (itemsByOrder.get(orderGuid) || [])
      .filter((i) => i.itemVariantId === variantId && i.serialNumberGuid)
      .map((i) => serialLanding.get(i.serialNumberGuid))
      .filter((x) => x != null && x > 0);
    const fromSerials = avg(serials);
    if (fromSerials != null) return fromSerials;
    if (variantSerialAvg.get(variantId) > 0) return variantSerialAvg.get(variantId);
    if (variantRate.get(variantId) > 0) return variantRate.get(variantId);
    const pp = variants.get(variantId)?.purchasePrice;
    return pp != null && pp > 0 ? pp : null;
  };
  return { itemsByOrder, variants, landingFor };
}

const baseRow = () => ({ gstPct: 18, commLabel: "QT-10% OV" });

// ---- Model-name matching -------------------------------------------------
// A contract's model text and the inventory's variant name rarely match
// word-for-word ("HP LASER 1008A printer with 1 year Warranty" vs "HP 1008a").
// So products that were never linked to Item Master are matched on their MODEL
// CODE tokens (letters+digits like 1008a / 208dw): every code token of the
// inventory variant must appear in the contract's text, and the variant's
// first word (brand) must appear too.
const codeTokens = (text) =>
  [...new Set(String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && /\d/.test(t) && /[a-z]/.test(t)))];
const tokenHit = (v, t) => t === v || (v.length >= 4 && t.includes(v)) || (t.length >= 4 && v.includes(t));

async function loadVariantNameIndex() {
  const [rows] = await mysqlPool.query("SELECT itemVariantId, variantName FROM inventoryitemvariant WHERE isDeleted = 0");
  return rows
    .map((r) => ({ id: r.itemVariantId, tokens: codeTokens(r.variantName), first: String(r.variantName || "").trim().toLowerCase().split(/[^a-z0-9]+/)[0] || "" }))
    .filter((v) => v.tokens.length > 0 && v.first);
}

// Returns the best-matching variant ids (ties kept, most specific first).
function matchVariantCandidates(product, index) {
  const text = `${product.brand || ""} ${product.model || ""} ${product.productName || ""}`.toLowerCase();
  const contractTokens = codeTokens(text);
  if (contractTokens.length === 0) return [];
  const hits = index.filter((v) => text.includes(v.first) && v.tokens.every((vt) => contractTokens.some((ct) => tokenHit(vt, ct))));
  if (hits.length === 0) return [];
  const best = Math.max(...hits.map((v) => v.tokens.length));
  return hits.filter((v) => v.tokens.length === best).map((v) => v.id);
}

// One row per contract product. Delivered qty is prefilled from the linked
// order's status (Delivered/Completed => full qty, otherwise 0) and is
// editable afterwards. Inventory item for each product, in order:
//   1. the contract product's own itemVariantId link
//   2. the linked order's item at the same position (when counts match)
//   3. model-code name match against Item Master (see above)
export async function buildContractRows(contracts, companyNames) {
  if (contracts.length === 0) return [];
  const numbers = [...new Set(contracts.map((c) => c.contractNumber).filter(Boolean))];
  const orderByKey = new Map();
  if (numbers.length > 0) {
    const [orders] = await mysqlPool.query("SELECT guid, orderid, companyGuid, status FROM orders WHERE orderid IN (?) AND isDeleted = 0", [numbers]);
    for (const o of orders) orderByKey.set(`${o.companyGuid}|${o.orderid}`, o);
  }
  const orderGuids = [...orderByKey.values()].map((o) => o.guid);
  const productVariantIds = contracts.flatMap((c) => parseJson(c.products, []).map((p) => p.itemVariantId).filter(Boolean));
  let ctx = await loadLandingContext(orderGuids, productVariantIds);
  const logisticsByOrder = await loadLogisticsStatuses(orderGuids);

  // Resolve every product's inventory variant (candidates, to pick among later).
  let nameIndex = null;
  const candidates = new Map();
  for (const c of contracts) {
    const products = parseJson(c.products, []);
    const order = orderByKey.get(`${c.companyGuid}|${c.contractNumber}`) || null;
    const orderItems = order ? ctx.itemsByOrder.get(order.guid) || [] : [];
    products.forEach((p, i) => {
      let ids = [];
      if (p.itemVariantId) ids = [p.itemVariantId];
      else if (orderItems.length === products.length && orderItems[i]?.itemVariantId) ids = [orderItems[i].itemVariantId];
      candidates.set(`${c.guid}|${i}`, ids);
    });
    for (let i = 0; i < products.length; i++) {
      if (candidates.get(`${c.guid}|${i}`).length === 0) {
        if (!nameIndex) nameIndex = await loadVariantNameIndex();
        candidates.set(`${c.guid}|${i}`, matchVariantCandidates(products[i], nameIndex));
      }
    }
  }
  const extras = [...new Set([...candidates.values()].flat())].filter((id) => !ctx.variants.has(id));
  if (extras.length > 0) ctx = await loadLandingContext(orderGuids, [...productVariantIds, ...extras]);

  const rows = [];
  for (const c of contracts) {
    const products = parseJson(c.products, []);
    const order = orderByKey.get(`${c.companyGuid}|${c.contractNumber}`) || null;
    const sourceStatus = c.status === "Cancelled" ? "Cancelled" : order?.status || null;
    // Among tied name matches, prefer one that actually has a landing price.
    const variantIdFor = (i) => {
      const ids = candidates.get(`${c.guid}|${i}`) || [];
      return ids.find((id) => ctx.landingFor(order?.guid, id) != null) || ids[0] || null;
    };
    // A contract's productName is GeM's category-style title; the proper
    // model is the inventory variant's name, then the contract's model field.
    const itemNameFor = (p, i) => ctx.variants.get(variantIdFor(i))?.name || String(p.model || "").trim() || p.productName || "";
    const list = products.length > 0 ? products : [{ productName: "", quantity: 0, totalValue: 0 }];
    list.forEach((p, i) => {
      const qty = num(p.quantity);
      rows.push({
        ...baseRow(),
        sourceType: "contract", sourceGuid: c.guid, productKey: String(i), sourceCompanyGuid: c.companyGuid,
        rowDate: toDateOnly(c.generatedDate), firm: companyNames.get(c.companyGuid) || "",
        contractNumber: c.contractNumber || "", item: itemNameFor(p, i), orderQty: qty,
        landingPrice: ctx.landingFor(order?.guid, variantIdFor(i)), qtyDelivered: isDeliveredOrder(order, order && logisticsByOrder.get(order.guid)) ? qty : 0,
        orderAmount: num(p.totalValue) || num(p.unitPrice) * qty, sourceStatus,
      });
    });
  }
  return rows;
}

// Orders that did NOT come from a contract (e.g. direct New Dispatch orders
// for a Client Master client): one row per order item.
export async function buildOrderRows(orders, companyNames) {
  if (orders.length === 0) return [];
  const ctx = await loadLandingContext(orders.map((o) => o.guid), []);
  const logisticsByOrder = await loadLogisticsStatuses(orders.map((o) => o.guid));
  const rows = [];
  for (const o of orders) {
    for (const it of ctx.itemsByOrder.get(o.guid) || []) {
      const qty = num(it.quantity) || 1;
      rows.push({
        ...baseRow(),
        sourceType: "order", sourceGuid: o.guid, productKey: String(it.guid), sourceCompanyGuid: o.companyGuid,
        rowDate: toDateOnly(o.orderDate), firm: companyNames.get(o.companyGuid) || "",
        contractNumber: o.orderid || "", item: ctx.variants.get(it.itemVariantId)?.name || "", orderQty: qty,
        landingPrice: ctx.landingFor(o.guid, it.itemVariantId), qtyDelivered: isDeliveredOrder(o, logisticsByOrder.get(o.guid)) ? qty : 0,
        orderAmount: num(it.sellingPrice) * qty, sourceStatus: o.status || null,
      });
    }
  }
  return rows;
}

export async function insertRows(groupGuid, rows) {
  if (rows.length === 0) return 0;
  const [[{ maxOrder }]] = await mysqlPool.query("SELECT COALESCE(MAX(sortOrder), 0) AS maxOrder FROM contract_group_rows WHERE groupGuid = ?", [groupGuid]);
  let order = Number(maxOrder);
  let added = 0;
  for (const r of rows) {
    order += 1;
    const [res] = await mysqlPool.query(
      `INSERT IGNORE INTO contract_group_rows
         (guid, groupGuid, sourceType, sourceGuid, productKey, sourceCompanyGuid, rowDate, firm, contractNumber, item,
          orderQty, landingPrice, qtyDelivered, orderAmount, gstPct, commLabel, sourceStatus, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), groupGuid, r.sourceType, r.sourceGuid, r.productKey, r.sourceCompanyGuid, r.rowDate, r.firm, r.contractNumber, r.item,
        r.orderQty, r.landingPrice, r.qtyDelivered, r.orderAmount, r.gstPct, r.commLabel, r.sourceStatus, order]
    );
    added += res.affectedRows || 0;
  }
  return added;
}

export const CONTRACT_COLS = "guid, companyGuid, contractNumber, generatedDate, buyerAddress, buyerGstin, buyerEmail, department, organisation, ministry, products, status";

// Contracts (within scope) not already in ANY group.
export async function loadUngroupedContracts(scope) {
  const where = scope ? "AND companyGuid IN (?)" : "";
  const [contracts] = await mysqlPool.query(
    `SELECT ${CONTRACT_COLS} FROM contracts WHERE isDeleted = 0 ${where} ORDER BY generatedDate DESC, createdAt DESC`,
    scope ? [scope] : []
  );
  const [grouped] = await mysqlPool.query(
    `SELECT DISTINCT r.sourceGuid FROM contract_group_rows r WHERE r.sourceType = 'contract'
       AND r.groupGuid IN (SELECT guid FROM contract_groups WHERE isDeleted = 0)`
  );
  const groupedSet = new Set(grouped.map((g) => g.sourceGuid));
  return contracts.filter((c) => !groupedSet.has(c.guid));
}

// Orders that used this Client Master client. Orders only store COPIES of the
// client's details (GSTIN, name, address), not a client id, so this matches by
// GSTIN first, then by exact name on customer/consignee.
export async function findOrdersForClient(client, scope, excludeOrderGuids, excludeContractNumbers) {
  const gst = normGstin(client.gstNumber);
  const name = String(client.name || "").trim().toLowerCase();
  const conds = [];
  const params = [];
  if (gst.length >= 10) { conds.push("gstNumber LIKE ?", "gstin LIKE ?"); params.push(`%${gst}%`, `%${gst}%`); }
  if (name) { conds.push("LOWER(TRIM(customerName)) = ?", "LOWER(TRIM(consigneeName)) = ?"); params.push(name, name); }
  if (conds.length === 0) return [];
  const scopeSql = scope ? "AND companyGuid IN (?)" : "";
  const [orders] = await mysqlPool.query(
    `SELECT guid, orderid, orderDate, companyGuid, status, customerName, consigneeName, gstNumber, gstin
       FROM orders WHERE isDeleted = 0 AND status <> 'Draft' ${scopeSql} AND (${conds.join(" OR ")})
       ORDER BY orderDate DESC`,
    scope ? [scope, ...params] : params
  );
  const skipOrders = new Set(excludeOrderGuids);
  const skipNumbers = new Set(excludeContractNumbers);
  return orders
    .filter((o) => !skipOrders.has(o.guid) && !skipNumbers.has(o.orderid))
    .map((o) => ({
      ...o,
      matchedBy: gst.length >= 10 && (normGstin(o.gstNumber).includes(gst) || normGstin(o.gstin).includes(gst)) ? "gstin" : "name",
    }));
}
