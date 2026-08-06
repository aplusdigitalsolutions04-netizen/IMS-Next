// Pure, stateless helpers for reading/normalizing/merging return records —
// extracted out of components/returns/Returns.jsx (previously ~336 lines of
// module-level code with zero React state or prop dependency, sitting at
// the top of a 1800+ line component file). Moved as-is; no logic changed.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
const UPLOADS_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");

export const extractReturnsArray = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.data?.returns)) return payload.data.returns;
  if (Array.isArray(payload?.returns)) return payload.returns;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.docs)) return payload.docs;
  if (Array.isArray(payload?.data?.docs)) return payload.data.docs;
  return [];
};

export const getReturnSerial = (item) =>
  item?.serialValue ||
  item?.serialNumber ||
  item?.serial?.value ||
  item?.serial?.serialNumber ||
  item?.serialGuid?.value ||
  item?.serialGuid?.serialNumber ||
  item?.serialId?.value ||
  item?.serialId?.serialNumber ||
  "N/A";

export const getReturnModelName = (item) =>
  item?.modelName ||
  item?.model?.name ||
  item?.modelGuid?.name ||
  item?.serialGuid?.modelGuid?.name ||
  item?.serialId?.modelGuid?.name ||
  "N/A";

export const getReturnFirmName = (item) =>
  item?.firmName ||
  item?.platform ||
  item?.platformName ||
  item?.dispatchGuid?.firmName ||
  item?.dispatch?.firmName ||
  item?.orderId?.firmName ||
  item?.order?.firmName ||
  item?.serialGuid?.linkedOrder?.platform ||
  item?.serialGuid?.linkedOrder?.firmName ||
  "N/A";

export const getReturnCustomerName = (item) =>
  item?.customerName ||
  item?.customer ||
  item?.dispatchGuid?.customerName ||
  item?.dispatch?.customerName ||
  item?.orderId?.customerName ||
  item?.order?.customerName ||
  item?.order?.customer ||
  item?.serialGuid?.linkedOrder?.customerName ||
  "N/A";

export const getReturnOrderId = (item) => {
  const rawValue =
    item?.orderId?.id ||
    item?.orderId?.guid ||
    item?.orderId?.orderNumber ||
    item?.order?.orderid ||
    item?.order?.orderId ||
    item?.order?.id ||
    item?.order?.guid ||
    item?.dispatchGuid?.id ||
    item?.dispatchGuid?.guid ||
    item?.dispatch?.id ||
    item?.dispatch?.guid ||
    item?.dispatch?.orderid ||
    item?.dispatch?.orderId ||
    item?.serialGuid?.linkedOrder?.id ||
    item?.serialGuid?.linkedOrder?.guid ||
    item?.serialGuid?.linkedOrder?.orderId ||
    item?.serialGuid?.linkedOrder?.orderNumber ||
    item?.customerName ||
    item?.customer ||
    null;

  return rawValue ? String(rawValue).trim() : null;
};

export const getReturnReason = (item) =>
  item?.reason ||
  item?.returnReason ||
  item?.remarks ||
  item?.comment ||
  item?.comments ||
  item?.reasonText ||
  item?.note ||
  "N/A";

export const getReturnStatus = (item) =>
  item?.status ||
  item?.orderStatus ||
  item?.dispatch?.status ||
  item?.order?.status ||
  item?.order?.orderStatus ||
  item?.logisticsStatus ||
  "N/A";

export const getReturnLogisticsStatus = (item) =>
  item?.logisticsStatus ||
  item?.order?.logisticsStatus ||
  item?.dispatch?.logisticsStatus ||
  "N/A";

export const getReturnTrackingId = (item) =>
  item?.trackingId ||
  item?.trackingID ||
  item?.order?.trackingId ||
  item?.order?.trackingID ||
  item?.dispatch?.trackingId ||
  item?.dispatch?.trackingID ||
  "N/A";

export const getReturnDispatchDate = (item) =>
  item?.dispatchDate ||
  item?.order?.dispatchDate ||
  item?.order?.orderDate ||
  item?.dispatch?.dispatchDate ||
  item?.dispatch?.orderDate ||
  null;

export const getReturnInvoiceNumber = (item) =>
  item?.invoiceNumber ||
  item?.invoiceNo ||
  item?.order?.invoiceNumber ||
  item?.order?.invoiceNo ||
  item?.dispatch?.invoiceNumber ||
  "N/A";

export const getReturnShippingAddress = (item) =>
  item?.shippingAddress ||
  item?.address ||
  item?.order?.shippingAddress ||
  item?.order?.address ||
  item?.dispatch?.shippingAddress ||
  item?.dispatch?.address ||
  "N/A";

export const getReturnTimestamp = (item) => item?.returnDate || item?.createdAt || null;

export const getReturnDispatchId = (item) => {
  const rawValue =
    item?.dispatchGuid ||
    item?.dispatchGuid?.id ||
    item?.dispatchGuid?.guid ||
    item?.dispatch?._id ||
    item?.dispatch?.id ||
    item?.dispatch?.guid ||
    item?.dispatchId ||
    item?.orderId?.id ||
    item?.orderId?.guid ||
    item?.order?.id ||
    item?.order?.guid ||
    item?.serialGuid?.linkedOrder?.id ||
    item?.serialGuid?.linkedOrder?.guid ||
    item?.serialGuid?.dispatchId ||
    null;

  return rawValue ? String(rawValue).trim() : null;
};

export const getUploadFileUrl = (filename) => {
  const safeFilename = String(filename || "").trim();
  if (!safeFilename) return null;
  return `${UPLOADS_BASE_URL}/uploads/${encodeURIComponent(safeFilename)}`;
};

export const sortReturns = (items) =>
  [...items].sort(
    (a, b) =>
      new Date(b.returnDate || b.createdAt || 0) -
      new Date(a.returnDate || a.createdAt || 0)
  );

export const normalizeReturns = (payload) => {
  const grouped = {};

  extractReturnsArray(payload).forEach((item, index) => {
    if (!item) return;

    const extractedSerial = getReturnSerial(item);
    const extractedModelName = getReturnModelName(item);
    const extractedFirmName = getReturnFirmName(item);
    const extractedCustomerName = getReturnCustomerName(item);
    const extractedOrderId = getReturnOrderId(item);
    const extractedReason = getReturnReason(item);
    const timestamp = getReturnTimestamp(item);
    const groupKey = extractedSerial !== "N/A" ? extractedSerial : item.guid || item.guid || index;

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        ...item,
        displaySerial: extractedSerial,
        modelName: extractedModelName,
        firmName: extractedFirmName,
        customerName: extractedCustomerName,
        orderId: extractedOrderId,
        reason: extractedReason,
        returnCount: 1,
        allReturnDates: timestamp ? [timestamp] : []
      };
      return;
    }

    grouped[groupKey].returnCount += 1;
    if (timestamp) {
      grouped[groupKey].allReturnDates.push(timestamp);
    }

    const existingDate = new Date(getReturnTimestamp(grouped[groupKey]) || 0);
    const newDate = new Date(timestamp || 0);

    if (newDate >= existingDate) {
      grouped[groupKey] = {
        ...grouped[groupKey],
        ...item,
        displaySerial: extractedSerial !== "N/A" ? extractedSerial : grouped[groupKey].displaySerial,
        modelName: extractedModelName !== "N/A" ? extractedModelName : grouped[groupKey].modelName,
        firmName: extractedFirmName !== "N/A" ? extractedFirmName : grouped[groupKey].firmName,
        customerName: extractedCustomerName !== "N/A" ? extractedCustomerName : grouped[groupKey].customerName,
        orderId: extractedOrderId || grouped[groupKey].orderId,
        reason: extractedReason || grouped[groupKey].reason,
        refundStatus: item.refundStatus || grouped[groupKey].refundStatus,
        refundAmount: item.refundAmount !== undefined ? item.refundAmount : grouped[groupKey].refundAmount,
        returnDate: item.returnDate || grouped[groupKey].returnDate,
        createdAt: item.createdAt || grouped[groupKey].createdAt
      };
    }
  });

  Object.values(grouped).forEach((item) => {
    item.allReturnDates = [...(item.allReturnDates || [])].sort(
      (a, b) => new Date(b) - new Date(a)
    );
  });

  return sortReturns(Object.values(grouped));
};

export const mergeReturnIntoList = (currentList, newItem) => {
  if (!newItem) return currentList;

  const serialKey = (newItem.displaySerial || newItem.serialValue || newItem.serialNumber || "")
    .toString()
    .trim()
    .toUpperCase();

  if (!serialKey) {
    return sortReturns([newItem, ...currentList]);
  }

  const existingIndex = currentList.findIndex((item) => {
    const itemSerial = (item.displaySerial || item.serialValue || item.serialNumber || "")
      .toString()
      .trim()
      .toUpperCase();
    return itemSerial === serialKey;
  });

  if (existingIndex === -1) {
    return sortReturns([
      {
        ...newItem,
        orderId: getReturnOrderId(newItem),
        reason: getReturnReason(newItem),
        returnCount: Number(newItem.returnCount) || 1,
        allReturnDates: getReturnTimestamp(newItem) ? [getReturnTimestamp(newItem)] : []
      },
      ...currentList
    ]);
  }

  const existingItem = currentList[existingIndex];
  const nextTimestamp = getReturnTimestamp(newItem);
  const nextList = [...currentList];
  nextList.splice(existingIndex, 1);

  return sortReturns([
    {
      ...existingItem,
      ...newItem,
      displaySerial: newItem.displaySerial || existingItem.displaySerial,
      modelName: newItem.modelName || existingItem.modelName,
      firmName: newItem.firmName || existingItem.firmName,
      customerName: newItem.customerName || existingItem.customerName,
      orderId: getReturnOrderId(newItem) || existingItem.orderId,
      reason: getReturnReason(newItem) || existingItem.reason,
      condition: newItem.condition || existingItem.condition,
      refundStatus: newItem.refundStatus || existingItem.refundStatus,
      refundAmount: newItem.refundAmount !== undefined ? newItem.refundAmount : existingItem.refundAmount,
      returnDate: newItem.returnDate || existingItem.returnDate,
      createdAt: newItem.createdAt || existingItem.createdAt,
      returnCount: Number(existingItem.returnCount || 1) + 1,
      allReturnDates: [
        ...(nextTimestamp ? [nextTimestamp] : []),
        ...(existingItem.allReturnDates || [])
      ].sort((a, b) => new Date(b) - new Date(a))
    },
    ...nextList
  ]);
};

export const createOptimisticReturn = ({
  result,
  serialValue,
  serialDetails,
  selectedCondition,
  returnReason,
  refundStatus,
  refundAmount,
  currentUser
}) => {
  const timestamp = new Date().toISOString();

  return {
    id: result?.id || `temp-${Date.now()}`,
    serialGuid: serialDetails?.id || serialDetails?.serialGuid || null,
    dispatchGuid: result?.dispatchGuid || serialDetails?.linkedOrder?.id || null,
    serialValue: result?.serialValue || serialValue,
    displaySerial: result?.serialValue || serialValue,
    condition: result?.condition || selectedCondition,
    reason: returnReason.trim(),
    refundStatus: result?.refundStatus || refundStatus,
    refundAmount: result?.refundAmount !== undefined ? result.refundAmount : refundAmount,
    returnDate: timestamp,
    createdAt: timestamp,
    returnedBy: currentUser?.username || "Admin",
    modelName: serialDetails?.modelName || "N/A",
    firmName: serialDetails?.linkedOrder?.firmName || "N/A",
    customerName: serialDetails?.linkedOrder?.customerName || "N/A",
    invoiceNumber: result?.invoiceNumber || serialDetails?.linkedOrder?.invoiceNumber || null,
    returnCount: 1,
    allReturnDates: [timestamp]
  };
};
