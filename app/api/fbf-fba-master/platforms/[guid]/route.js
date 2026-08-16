import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeFbfFbaMaster } from "@/lib/fbfFbaMasterAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeFbfFbaMaster(user, "DELETE");
  requireCompany(user);
  const { guid } = await params;

  const [[platform]] = await mysqlPool.query("SELECT name FROM fbf_fba_platforms WHERE guid = ? AND companyGuid = ?", [guid, user.companyId]);
  if (!platform) throw new ApiError(404, "Platform not found");
  const [[{ cnt }]] = await mysqlPool.query("SELECT COUNT(*) as cnt FROM fbf_fba_warehouses WHERE platform = ? AND companyGuid = ? AND isDeleted = 0", [platform.name, user.companyId]);
  if (cnt > 0) throw new ApiError(400, "Cannot delete: this platform is used by one or more warehouses.");
  await mysqlPool.query("DELETE FROM fbf_fba_platforms WHERE guid = ? AND companyGuid = ?", [guid, user.companyId]);
  return NextResponse.json({ message: "Platform deleted" });
});
