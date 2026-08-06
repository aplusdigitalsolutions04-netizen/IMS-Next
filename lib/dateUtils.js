// Was reimplemented twice with different names (StockIn.jsx's `toYmd`,
// Billing.jsx's `toLocalDateStr`) — same logic, local timezone (not UTC, so
// no day-shift), zero-padded. Consolidated here so both import the same function.
export function toLocalDateStr(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
