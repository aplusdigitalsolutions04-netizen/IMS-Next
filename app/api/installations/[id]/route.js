import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeInstallations } from "@/lib/installationsAuth";
import { SELECT_INSTALLATION, INSTALL_REQUIRED_CONDITION } from "@/lib/installationsQuery";
import { mapDispatchRow } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeInstallations(user, "GET");
  const { id } = await params;

  const [rows] = await mysqlPool.query(`
    ${SELECT_INSTALLATION}
    WHERE oi.guid=? AND oi.companyGuid=? AND ${INSTALL_REQUIRED_CONDITION}
  `, [id, user.companyId]);
  if (!rows.length) throw new ApiError(404, "Installation not found");
  return NextResponse.json(mapDispatchRow(rows[0]));
});

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeInstallations(user, "PUT");
  const { id } = await params;

  const { technicianName, technicianContact, installationStatus, installationCharges, installationRemarks, scheduledDate, installationDate } = await parseJsonBody(request);

  const [cur] = await mysqlPool.query("SELECT ins.*, oi.orderGuid FROM order_items oi LEFT JOIN order_installations ins ON oi.orderGuid=ins.orderGuid AND ins.companyGuid=? WHERE oi.guid=? AND oi.companyGuid=?", [user.companyId, id, user.companyId]);
  if (!cur.length) throw new ApiError(404, "Installation not found");
  const c = cur[0];

  let finalInstallDate = installationDate !== undefined ? new Date(installationDate) : c.installationDate;
  if (installationStatus === "Completed" && !finalInstallDate) finalInstallDate = new Date();

  await mysqlPool.query(
    "UPDATE order_installations SET technicianName=?,technicianContact=?,installationStatus=?,installationCharges=?,installationRemarks=?,scheduledDate=?,installationDate=? WHERE orderGuid=? AND companyGuid=?",
    [technicianName ?? c.technicianName, technicianContact ?? c.technicianContact,
      installationStatus ?? c.installationStatus, installationCharges ?? c.installationCharges,
      installationRemarks ?? c.installationRemarks,
      scheduledDate !== undefined ? new Date(scheduledDate) : c.scheduledDate,
      finalInstallDate, c.orderGuid, user.companyId]
  );
  return NextResponse.json({ message: "Installation updated successfully" });
});
