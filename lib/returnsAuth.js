import { requireAuth, isSuperUser, ApiError } from "@/lib/auth";

// Bespoke (not authorizeReadWrite) because each method has a distinct denial
// message. Read: "returns" permission, OR "damage"/"orders" — the Damaged
// tab (components/damaged/Damaged.jsx) and Order Processing's own Returned
// tab/financials (components/orderTracking/OrderTracking.jsx) both consume
// this same data via lib/client/AppDataContext.jsx's shared `returns` array,
// so a role that can see either of those pages needs read access here too,
// even without full "returns" management rights. Write: same "returns" view
// permission is now enough (Returns isn't one of the Order Processing/
// Billing/Dispatch tabs that keep a separate edit-flag requirement) —
// allow_edit_returns is still honored as a fallback for a role that has it
// but not the base permission. Delete: Admin-only by default, but
// allow_delete_returns (a Manage Roles checkbox — see
// components/users/constants.js) can delegate it to a specific role instead
// of it being permanently impossible for any non-Admin.
export function authorizeReturns(user, method) {
  requireAuth(user);
  const m = method.toUpperCase();
  if (isSuperUser(user.role)) return;
  if (["GET", "HEAD", "OPTIONS"].includes(m)) {
    const canRead = user.permissions?.includes("returns") || user.permissions?.includes("damage") || user.permissions?.includes("orders");
    if (!canRead) throw new ApiError(403, "You do not have access to returns.");
    return;
  }
  if (m === "DELETE") {
    if (user.allow_delete_returns) return;
    throw new ApiError(403, "Only Admin can delete return records.");
  }
  if (!user.permissions?.includes("returns") && !user.allow_edit_returns) throw new ApiError(403, "You do not have permission to manage returns.");
}
