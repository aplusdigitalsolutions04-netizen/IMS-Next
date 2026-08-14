import { NextResponse } from "next/server";
import crypto from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, ApiError, requireCompany } from "@/lib/auth";
import { authorizeGodowns, authorizeGodownRead } from "@/lib/godownsAuth";
import { safeStr, toBit, logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeGodownRead(user);

  const [rows] = await mysqlPool.query(
    "SELECT guid, godownName, godownAddress, isDefault, createdAt, updatedAt FROM godowns WHERE isDeleted=0 AND companyGuid=? ORDER BY isDefault DESC, godownName ASC",
    [user.companyId]
  );
  return NextResponse.json(rows);
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeGodowns(user, "POST");

  const { godownName, godownAddress, isDefault } = await parseJsonBody(request);
  const name = safeStr(godownName, "");
  if (!name) throw new ApiError(400, "Godown name is required");
  if (toBit(isDefault)) await mysqlPool.query("UPDATE godowns SET isDefault=0 WHERE isDeleted=0 AND companyGuid=?", [user.companyId]);
  const guid = crypto.randomUUID();
  await mysqlPool.query("INSERT INTO godowns (guid,companyGuid,godownName,godownAddress,isDefault) VALUES (?,?,?,?,?)", [guid, user.companyId, name, safeStr(godownAddress, ""), toBit(isDefault) ? 1 : 0]);
  await logUserActivity(mysqlPool, user, "Add Godown", [{ field: "name", newValue: name }], request.headers.get("x-forwarded-for") || null);
  return NextResponse.json({ message: "Godown added", guid }, { status: 201 });
});
