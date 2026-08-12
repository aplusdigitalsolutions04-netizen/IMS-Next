import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, ApiError, authorizeMasterWrite } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);

  const {
    VendorId, VendorName, VendorFirmName, VendorGstin, VendorMobile, VendorAlternateMobile,
    VendorEmail, VendorAddress, VendorState, VendorPincode, VendorBankName, VendorBankAccountName,
    VendorBankAccountNumber, VendorBankIfsc, DealingCategoryIds, VendorDealingItems,
  } = body;

  const catsStr = Array.isArray(DealingCategoryIds) ? DealingCategoryIds.join(",") : DealingCategoryIds;

  const isCreate = !(VendorId && VendorId !== "0" && VendorId !== "");
  authorizeMasterWrite(user, "vendor", { isCreate });

  try {
    if (VendorId && VendorId !== "0" && VendorId !== "") {
      await mysqlPool.execute(
        `UPDATE inventoryvendor SET
          vendorName = ?, vendorFirmName = ?, vendorGSTIN = ?, vendorMobile = ?,
          vendorAlternateMobile = ?, vendorEmail = ?, vendorAddress = ?, vendorState = ?,
          vendorPincode = ?, vendorBankName = ?, vendorBankAccountName = ?,
          vendorBankAccountNumber = ?, vendorBankIFSC = ?,
          vendorDealingCategories = ?, vendorDealingItems = ?
        WHERE vendorId = ? AND companyGuid = ?`,
        [
          VendorName || "", VendorFirmName || "", VendorGstin || "", VendorMobile || "",
          VendorAlternateMobile || "", VendorEmail || "", VendorAddress || "", VendorState || "",
          VendorPincode || "", VendorBankName || "", VendorBankAccountName || "",
          VendorBankAccountNumber || "", VendorBankIfsc || "",
          catsStr || "", VendorDealingItems || "", VendorId, user.companyId,
        ]
      );
    } else {
      const id = uuidv4();
      await mysqlPool.execute(
        `INSERT INTO inventoryvendor (
          vendorId, companyGuid, vendorName, vendorFirmName, vendorGSTIN, vendorMobile,
          vendorAlternateMobile, vendorEmail, vendorAddress, vendorState,
          vendorPincode, vendorBankName, vendorBankAccountName,
          vendorBankAccountNumber, vendorBankIFSC,
          vendorDealingCategories, vendorDealingItems, isDeleted
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 0)`,
        [
          id, user.companyId, VendorName || "", VendorFirmName || "", VendorGstin || "", VendorMobile || "",
          VendorAlternateMobile || "", VendorEmail || "", VendorAddress || "", VendorState || "",
          VendorPincode || "", VendorBankName || "", VendorBankAccountName || "",
          VendorBankAccountNumber || "", VendorBankIfsc || "",
          catsStr || "", VendorDealingItems || "",
        ]
      );
    }
  } catch (err) {
    console.error("Error saving vendor details:", err);
    throw new ApiError(500, err.message);
  }
  return NextResponse.json({ message: "Success" });
});
