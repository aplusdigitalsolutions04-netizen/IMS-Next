// Standard rupee round-off: fraction >= .50 goes up, < .50 goes down.
// Math.round already does exactly that for positive amounts; the epsilon
// guards against float noise like 10.4999999999 / 10.5000000001 from sums.
export function roundOff(amount) {
  const n = Number(amount) || 0;
  const rounded = Math.round(n + (n >= 0 ? 1e-9 : -1e-9));
  return { rounded, diff: Math.round((rounded - n) * 100) / 100 };
}
