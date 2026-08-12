import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, authorizeMasterWrite } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);

  const {
    VendorId,
    VendorFirmName,
    VendorContactPerson = "",
    VendorContactNo = "",
    VendorEmail = "",
    VendorGST = "",
    VendorAddress = "",
  } = body;

  const isCreate = !(VendorId && VendorId !== "0" && VendorId !== "");
  authorizeMasterWrite(user, "vendor", { isCreate });

  if (VendorId && VendorId !== "0" && VendorId !== "") {
    await mysqlPool.execute(
      "UPDATE inventoryvendor SET vendorFirmName = ?, vendorContactPerson = ?, vendorContactNo = ?, vendorEmail = ?, vendorGST = ?, vendorAddress = ? WHERE vendorId = ? AND companyGuid = ?",
      [VendorFirmName, VendorContactPerson, VendorContactNo, VendorEmail, VendorGST, VendorAddress, VendorId, user.companyId]
    );
  } else {
    const id = uuidv4();
    await mysqlPool.execute(
      "INSERT INTO inventoryvendor (vendorId, companyGuid, vendorFirmName, vendorContactPerson, vendorContactNo, vendorEmail, vendorGST, vendorAddress, isDeleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
      [id, user.companyId, VendorFirmName, VendorContactPerson, VendorContactNo, VendorEmail, VendorGST, VendorAddress]
    );
  }
  return NextResponse.json({ message: "Success" });
});
