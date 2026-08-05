import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { authorizeGodowns } from "@/lib/godownsAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeGodowns(user, "GET");

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page")) || 1;
  const limit = Math.min(parseInt(searchParams.get("limit")) || 20, 100);
  const offset = (page - 1) * limit;

  const [countRows] = await mysqlPool.query("SELECT COUNT(*) as total FROM stocktransferhistory WHERE companyGuid = ?", [user.companyId]);
  const [rows] = await mysqlPool.query("SELECT * FROM stocktransferhistory WHERE companyGuid = ? ORDER BY transferDate DESC LIMIT ? OFFSET ?", [user.companyId, limit, offset]);
  return NextResponse.json({ data: rows, total: countRows[0].total, page, limit });
});
