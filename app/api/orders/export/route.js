import { NextResponse } from "next/server";
import * as xlsx from "xlsx";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, authorizeOrdersRequest, ApiError } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

// Full column set for the Order Processing Excel export — one row per
// dispatched item, every document/status field an order can carry. `key`
// matches what the frontend's column-picker sends back in `columns` for a
// "custom" (subset) download; `label` is the Excel header text.
export const EXPORT_COLUMNS = [
  { key: "orderId", label: "Order ID" },
  { key: "platform", label: "Platform" },
  { key: "status", label: "Status" },
  { key: "orderDate", label: "Order Date" },
  { key: "dispatchDate", label: "Dispatch Date" },
  { key: "customerName", label: "Customer Name" },
  { key: "consigneeName", label: "Consignee Name" },
  { key: "buyerEmail", label: "Buyer Email" },
  { key: "consigneeEmail", label: "Consignee Email" },
  { key: "shippingAddress", label: "Shipping Address" },
  { key: "gstNumber", label: "GST Number" },
  { key: "contactNumber", label: "Contact Number" },
  { key: "bidNumber", label: "Bid Number" },
  { key: "modelName", label: "Model" },
  { key: "company", label: "Brand" },
  { key: "serialNumber", label: "Serial Number" },
  { key: "quantity", label: "Quantity" },
  { key: "sellingPrice", label: "Selling Price" },
  { key: "warranty", label: "Warranty" },
  { key: "invoiceNumber", label: "Invoice Number" },
  { key: "invoiceFilename", label: "Invoice File" },
  { key: "ewayBillNumber", label: "E-Way Bill Number" },
  { key: "ewayBillFilename", label: "E-Way Bill File" },
  { key: "contractFilename", label: "Contract File" },
  { key: "challanFilename", label: "Challan File" },
  { key: "podFilename", label: "POD File" },
  { key: "courierPartner", label: "Courier Partner" },
  { key: "trackingId", label: "Tracking ID" },
  { key: "logisticsStatus", label: "Logistics Status" },
  { key: "lastDeliveryDate", label: "Last Delivery Date" },
  { key: "freightCharges", label: "Freight Charges" },
  { key: "packagingCost", label: "Packaging Cost" },
  { key: "commission", label: "Commission" },
  { key: "installationRequired", label: "Installation Required" },
  { key: "installationStatus", label: "Installation Status" },
];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");

// Columns whose value is a filename that should become a clickable link to
// /uploads/<filename> in the Excel, instead of just plain text the user has
// to go copy into a browser bar by hand.
const LINKED_COLUMNS = new Set(["invoiceFilename", "ewayBillFilename", "contractFilename", "challanFilename", "podFilename"]);

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeOrdersRequest(user, "GET", new URL(request.url).pathname, null);

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const requestedColumns = searchParams.get("columns");

  const columns = requestedColumns
    ? EXPORT_COLUMNS.filter((c) => requestedColumns.split(",").includes(c.key))
    : EXPORT_COLUMNS;
  if (columns.length === 0) throw new ApiError(400, "At least one column is required.");

  let dateFilterSql = "";
  const dateFilterParams = [];
  if (startDate && endDate) {
    dateFilterSql = " AND o.dispatchDate >= ? AND o.dispatchDate <= ?";
    dateFilterParams.push(`${startDate.split("T")[0]} 00:00:00`, `${endDate.split("T")[0]} 23:59:59`);
  }

  const [rows] = await mysqlPool.query(
    `SELECT
       oi.guid as itemGuid, o.orderid as orderId, o.platform, o.status, o.orderDate, o.dispatchDate,
       o.customerName, o.consigneeName, o.buyerEmail, o.consigneeEmail, o.shippingAddress, o.address,
       o.gstNumber, o.contactNumber, o.bidNumber,
       oi.quantity, oi.sellingPrice, oi.warranty, oi.contractFilename,
       o.invoiceNumber, o.invoiceFilename, o.ewayBillNumber, o.ewayBillFilename,
       o.freightCharges, o.packagingCost, o.commission,
       s.serialNumber, itv.variantName as modelName, bm.brandName as company,
       ol.courierPartner, ol.trackingId, ol.logisticsStatus, ol.lastDeliveryDate, ol.podFilename,
       ins.installationRequired, ins.installationStatus
     FROM order_items oi
     JOIN orders o ON oi.orderGuid = o.guid AND o.companyGuid = ?
     LEFT JOIN order_logistics ol ON o.guid = ol.orderGuid AND ol.companyGuid = o.companyGuid
     LEFT JOIN order_installations ins ON o.guid = ins.orderGuid AND ins.companyGuid = o.companyGuid
     LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid = s.guid AND s.companyGuid = o.companyGuid
     LEFT JOIN inventoryitemvariant itv ON s.itemVariantId = itv.itemVariantId AND itv.companyGuid = o.companyGuid
     LEFT JOIN inventoryitemmaster iim ON itv.itemId = iim.itemId AND iim.companyGuid = o.companyGuid
     LEFT JOIN inventorybrandmaster bm ON iim.brandId = bm.brandId AND bm.companyGuid = o.companyGuid
     WHERE o.isDeleted = 0 ${dateFilterSql}
     ORDER BY o.dispatchDate DESC`,
    [user.companyId, ...dateFilterParams]
  );

  // Contract/invoice/e-way-bill filenames live directly on orders/order_items,
  // but "challan" (and any other ad-hoc uploaded doc) is only tracked in the
  // generic orderdocuments table, keyed by the dispatch/order-item guid — so
  // it needs a separate lookup and a merge pass rather than a plain JOIN.
  const itemGuids = rows.map((r) => r.itemGuid);
  const challanByItem = new Map();
  if (itemGuids.length) {
    const [docRows] = await mysqlPool.query(
      "SELECT dispatchGuid, filename FROM orderdocuments WHERE dispatchGuid IN (?) AND docType = 'challan' AND companyGuid = ?",
      [itemGuids, user.companyId]
    );
    docRows.forEach((d) => challanByItem.set(d.dispatchGuid, d.filename));
  }

  const exportRows = rows.map((r) => {
    const full = {
      orderId: r.orderId,
      platform: r.platform,
      status: r.status,
      orderDate: fmtDate(r.orderDate),
      dispatchDate: fmtDate(r.dispatchDate),
      customerName: r.customerName || "",
      consigneeName: r.consigneeName || "",
      buyerEmail: r.buyerEmail || "",
      consigneeEmail: r.consigneeEmail || "",
      shippingAddress: r.shippingAddress || r.address || "",
      gstNumber: r.gstNumber || "",
      contactNumber: r.contactNumber || "",
      bidNumber: r.bidNumber || "",
      modelName: r.modelName || "",
      company: r.company || "",
      serialNumber: r.serialNumber || "",
      quantity: r.quantity ?? "",
      sellingPrice: r.sellingPrice ?? "",
      warranty: r.warranty || "",
      invoiceNumber: r.invoiceNumber || "",
      invoiceFilename: r.invoiceFilename || "",
      ewayBillNumber: r.ewayBillNumber || "",
      ewayBillFilename: r.ewayBillFilename || "",
      contractFilename: r.contractFilename || "",
      challanFilename: challanByItem.get(r.itemGuid) || "",
      podFilename: r.podFilename || "",
      courierPartner: r.courierPartner || "",
      trackingId: r.trackingId || "",
      logisticsStatus: r.logisticsStatus || "",
      lastDeliveryDate: fmtDate(r.lastDeliveryDate),
      freightCharges: r.freightCharges ?? "",
      packagingCost: r.packagingCost ?? "",
      commission: r.commission ?? "",
      installationRequired: r.installationRequired || "",
      installationStatus: r.installationStatus || "",
    };
    const filtered = {};
    columns.forEach((c) => { filtered[c.label] = full[c.key]; });
    return filtered;
  });

  const worksheet = xlsx.utils.json_to_sheet(exportRows.length ? exportRows : [Object.fromEntries(columns.map((c) => [c.label, ""]))]);
  worksheet["!cols"] = columns.map(() => ({ wch: 20 }));

  // json_to_sheet only writes plain text — a filename column needs its cell
  // turned into an actual hyperlink after the fact (SheetJS has no option to
  // do this inline during the json_to_sheet call itself).
  const backendBase = process.env.BACKEND_URI || `http://localhost:${process.env.PORT || 3011}`;
  if (exportRows.length) {
    columns.forEach((col, colIndex) => {
      if (!LINKED_COLUMNS.has(col.key)) return;
      exportRows.forEach((rowData, rowIndex) => {
        const filename = rowData[col.label];
        if (!filename) return;
        const cellRef = xlsx.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
        if (worksheet[cellRef]) {
          worksheet[cellRef].l = { Target: `${backendBase}/uploads/${encodeURIComponent(filename)}`, Tooltip: "Open file" };
        }
      });
    });
  }

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Orders");

  const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=orders_export_${Date.now()}.xlsx`,
    },
  });
});
