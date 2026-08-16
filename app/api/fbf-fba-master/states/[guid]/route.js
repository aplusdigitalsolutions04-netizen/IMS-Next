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

  const [[state]] = await mysqlPool.query("SELECT name FROM fbf_fba_states WHERE guid = ? AND companyGuid = ?", [guid, user.companyId]);
  if (!state) throw new ApiError(404, "State not found");
  const [[{ cnt }]] = await mysqlPool.query("SELECT COUNT(*) as cnt FROM fbf_fba_warehouses WHERE state = ? AND companyGuid = ? AND isDeleted = 0", [state.name, user.companyId]);
  if (cnt > 0) throw new ApiError(400, "Cannot delete: this state is used by one or more warehouses.");
  await mysqlPool.query("DELETE FROM fbf_fba_states WHERE guid = ? AND companyGuid = ?", [guid, user.companyId]);
  return NextResponse.json({ message: "State deleted" });
});
