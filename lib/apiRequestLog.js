import { mysqlPool } from "@/lib/db";

// api_request_logs gets a row for every API call (~14k/day here — 800k rows /
// 230 MB after two months) and nothing ever trimmed it. Successful calls are
// kept 45 days, errors 120 days. Runs at most once every 6 hours per process,
// in small batches so it never holds a long lock on the table.
const KEEP_OK_DAYS = Number(process.env.API_LOG_KEEP_DAYS || 45);
const KEEP_ERROR_DAYS = Number(process.env.API_LOG_KEEP_ERROR_DAYS || 120);
const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;
let lastPurge = 0;

async function purgeOldLogs() {
  if (Date.now() - lastPurge < PURGE_EVERY_MS) return;
  lastPurge = Date.now();
  try {
    for (let i = 0; i < 40; i++) {
      const [res] = await mysqlPool.query(
        "DELETE FROM api_request_logs WHERE (isError = 0 AND createdAt < NOW() - INTERVAL ? DAY) OR createdAt < NOW() - INTERVAL ? DAY LIMIT 5000",
        [KEEP_OK_DAYS, KEEP_ERROR_DAYS]
      );
      if (res.affectedRows < 5000) break;
    }
  } catch (err) {
    console.error("[apiRequestLog] Purge failed:", err.message);
  }
}

// Fire-and-forget insert — logging must never break the actual API response,
// so every failure here is swallowed (just console.error'd) rather than
// re-thrown.
export async function logApiRequest({ user, method, path, statusCode, isError, errorMessage, errorStack, durationMs, ipAddress }) {
  try {
    await mysqlPool.query(
      `INSERT INTO api_request_logs (userGuid, username, role, companyGuid, method, path, statusCode, isError, errorMessage, errorStack, durationMs, ipAddress)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        user?.userid || user?.id || null,
        user?.username || null,
        user?.role || null,
        user?.companyId || null,
        method,
        path,
        statusCode,
        isError ? 1 : 0,
        errorMessage ? String(errorMessage).slice(0, 2000) : null,
        errorStack ? String(errorStack).slice(0, 5000) : null,
        durationMs,
        ipAddress || null,
      ]
    );
  } catch (err) {
    console.error("[apiRequestLog] Failed to record API log:", err.message);
  }
  purgeOldLogs();
}
