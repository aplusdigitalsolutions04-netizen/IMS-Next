import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany } from "@/lib/auth";
import { authorizeInstallations } from "@/lib/installationsAuth";
import { SELECT_INSTALLATION, INSTALL_REQUIRED_CONDITION } from "@/lib/installationsQuery";
import { mapDispatchRow } from "@/lib/helpers";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeInstallations(user, "GET");

  const [rows] = await mysqlPool.query(`
    ${SELECT_INSTALLATION}
    WHERE ${INSTALL_REQUIRED_CONDITION} AND o.isDeleted=0 AND oi.companyGuid=?
    ORDER BY CASE WHEN ins.installationStatus='Pending' THEN 1 WHEN ins.installationStatus='Scheduled' THEN 2 WHEN ins.installationStatus='In Progress' THEN 3 WHEN ins.installationStatus='Completed' THEN 4 ELSE 5 END, o.dispatchDate DESC
  `, [user.companyId]);
  return NextResponse.json(rows.map(mapDispatchRow));
});
