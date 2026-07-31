import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, ApiError } from "@/lib/auth";
import { authorizeGodowns } from "@/lib/godownsAuth";
import { safeStr, toBit, logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeGodowns(user, "PUT");
  const { id } = await params;

  const { godownName, godownAddress, isDefault } = await parseJsonBody(request);
  const name = safeStr(godownName, "");
  if (!name) throw new ApiError(400, "Godown name is required");
  if (toBit(isDefault)) await mysqlPool.query("UPDATE godowns SET isDefault=0 WHERE guid<>? AND isDeleted=0", [id]);
  await mysqlPool.query("UPDATE godowns SET godownName=?,godownAddress=?,isDefault=? WHERE guid=? AND isDeleted=0", [name, safeStr(godownAddress, ""), toBit(isDefault) ? 1 : 0, id]);
  await logUserActivity(mysqlPool, user, "Update Godown", [{ field: "name", newValue: name }], request.headers.get("x-forwarded-for") || null);
  return NextResponse.json({ message: "Godown updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeGodowns(user, "DELETE");
  const { id } = await params;

  const [[godown]] = await mysqlPool.query("SELECT godownName FROM godowns WHERE guid=?", [id]);
  await mysqlPool.query("UPDATE inventorystockinserial SET godownGuid=NULL WHERE godownGuid=?", [id]);
  await mysqlPool.query("UPDATE godowns SET isDeleted=1 WHERE guid=?", [id]);
  await logUserActivity(mysqlPool, user, "Delete Godown", [{ field: "name", oldValue: godown?.godownName || id, newValue: "Deleted" }], request.headers.get("x-forwarded-for") || null);
  return NextResponse.json({ message: "Godown deleted" });
});
