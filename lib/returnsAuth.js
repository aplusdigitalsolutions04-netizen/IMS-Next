import { requireAuth, isSuperUser, ApiError } from "@/lib/auth";

// Bespoke (not authorizeReadWrite) because each method has a distinct denial
// message. Read: "returns" permission. Write: same "returns" view permission
// is now enough (Returns isn't one of the Order Processing/Billing/Dispatch
// tabs that keep a separate edit-flag requirement) — allow_edit_returns is
// still honored as a fallback for a role that has it but not the base
// permission. Delete: Admin-only, unchanged.
export function authorizeReturns(user, method) {
  requireAuth(user);
  const m = method.toUpperCase();
  if (isSuperUser(user.role)) return;
  if (["GET", "HEAD", "OPTIONS"].includes(m)) {
    if (!user.permissions?.includes("returns")) throw new ApiError(403, "You do not have access to returns.");
    return;
  }
  if (m === "DELETE") {
    throw new ApiError(403, "Only Admin can delete return records.");
  }
  if (!user.permissions?.includes("returns") && !user.allow_edit_returns) throw new ApiError(403, "You do not have permission to manage returns.");
}
