import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { ensureAiTables } from "@/lib/aiParse";

const SOURCE_LABELS = {
  "parse-order": "Order AI Parse",
  "parse-file": "Order File AI Parse",
  "contracts-parse": "Contract AI Parse",
};

function buildWhere(searchParams) {
  const source = searchParams.get("source");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const where = [];
  const params = [];
  if (source) { where.push("source=?"); params.push(source); }
  if (startDate && endDate) { where.push("createdAt BETWEEN ? AND ?"); params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`); }

  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

// "Kab, kaha, kitne tokens" — when, where (which page/feature), and how many
// tokens every OpenAI call used. Every call in lib/aiParse.js logs a row here
// (see logUsage) regardless of which of the 3 AI-parse routes triggered it.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "aiSettings", "Only Admin can view AI usage.");
  await ensureAiTables();

  const { searchParams } = new URL(request.url);
  const { whereSql, params } = buildWhere(searchParams);

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(200, Number(searchParams.get("limit")) || 50);
  const offset = (page - 1) * limit;

  const [[{ total }]] = await mysqlPool.query(`SELECT COUNT(*) as total FROM ai_usage_log ${whereSql}`, params);
  const [rows] = await mysqlPool.query(
    `SELECT id, source, model, promptTokens, completionTokens, totalTokens, username, companyGuid, createdAt
     FROM ai_usage_log ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[summary]] = await mysqlPool.query(
    `SELECT COUNT(*) as totalCalls, COALESCE(SUM(promptTokens),0) as totalPromptTokens,
            COALESCE(SUM(completionTokens),0) as totalCompletionTokens, COALESCE(SUM(totalTokens),0) as totalTokens
     FROM ai_usage_log ${whereSql}`,
    params
  );

  const [bySource] = await mysqlPool.query(
    `SELECT source, COUNT(*) as calls, COALESCE(SUM(totalTokens),0) as tokens FROM ai_usage_log ${whereSql} GROUP BY source`,
    params
  );

  return NextResponse.json({
    data: rows.map((r) => ({ ...r, sourceLabel: SOURCE_LABELS[r.source] || r.source })),
    total,
    page,
    limit,
    summary,
    bySource: bySource.map((s) => ({ ...s, sourceLabel: SOURCE_LABELS[s.source] || s.source })),
  });
});
