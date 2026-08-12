import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

function buildWhere(searchParams) {
  const onlyErrors = searchParams.get("onlyErrors") === "1";
  const userGuid = searchParams.get("userGuid");
  const method = searchParams.get("method");
  const search = searchParams.get("search");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const where = [];
  const params = [];
  if (onlyErrors) where.push("isError=1");
  if (userGuid) { where.push("userGuid=?"); params.push(userGuid); }
  if (method) { where.push("method=?"); params.push(method); }
  if (search) { where.push("(path LIKE ? OR errorMessage LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
  if (startDate && endDate) { where.push("createdAt BETWEEN ? AND ?"); params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`); }

  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

function toCsv(rows) {
  const headers = ["Time", "Username", "Role", "Method", "Path", "Status Code", "Is Error", "Duration (ms)", "IP Address", "Error Message", "Error Reason (Stack)"];
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(",")];
  for (const r of rows) {
    lines.push([
      new Date(r.createdAt).toISOString(),
      r.username || "Anonymous",
      r.role || "",
      r.method,
      r.path,
      r.statusCode,
      r.isError ? "Yes" : "No",
      r.durationMs,
      r.ipAddress || "",
      r.errorMessage || "",
      r.errorStack || "",
    ].map(escape).join(","));
  }
  return lines.join("\n");
}

// Admin-only — this is the raw API request/error audit trail (every call,
// every user, every failure), so it's kept stricter than the regular
// per-module permission system.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "apiLogs", "Only Admin can view API logs.");

  const { searchParams } = new URL(request.url);
  const { whereSql, params } = buildWhere(searchParams);
  const format = searchParams.get("format");

  if (format === "csv") {
    // Full filtered export (capped, not paginated) — a report someone can
    // hand off or archive, not just what's on screen.
    const [rows] = await mysqlPool.query(
      `SELECT id, username, role, method, path, statusCode, isError, errorMessage, errorStack, durationMs, ipAddress, createdAt
       FROM api_request_logs ${whereSql} ORDER BY id DESC LIMIT 10000`,
      params
    );
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=api-logs-${new Date().toISOString().slice(0, 10)}.csv`,
      },
    });
  }

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(200, Number(searchParams.get("limit")) || 50);
  const offset = (page - 1) * limit;

  const [[{ total }]] = await mysqlPool.query(`SELECT COUNT(*) as total FROM api_request_logs ${whereSql}`, params);
  const [rows] = await mysqlPool.query(
    `SELECT id, userGuid, username, role, companyGuid, method, path, statusCode, isError, errorMessage, errorStack, durationMs, ipAddress, createdAt
     FROM api_request_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [summaryRows] = await mysqlPool.query(
    `SELECT COUNT(*) as totalCalls, SUM(isError) as totalErrors FROM api_request_logs ${whereSql}`,
    params
  );

  return NextResponse.json({
    data: rows,
    total,
    page,
    limit,
    summary: { totalCalls: summaryRows[0]?.totalCalls || 0, totalErrors: summaryRows[0]?.totalErrors || 0 },
  });
});
