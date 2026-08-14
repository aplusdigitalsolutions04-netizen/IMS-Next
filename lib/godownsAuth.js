import { authorizeReadWrite, requireAuth, requirePermission, isSuperUser, ApiError } from "@/lib/auth";
import { normalizeRole } from "@/lib/helpers";

export const authorizeGodowns = (user, method) =>
  authorizeReadWrite(user, method, {
    permission: "godownMaster",
    editColumnName: "allow_edit_godown",
    adminOnlyDelete: true,
    denyMessage: "You do not have permission to manage godowns.",
  });

// Godown Transfer is its own feature/permission — a role can be granted
// stock-transfer rights without also getting full Godown Master (add/edit/
// delete godowns) access, and vice versa. View access to this tab is now
// enough to perform a transfer too (allow_transfer_godown still honored as
// a fallback for a role that has it but not the base permission).
export function authorizeGodownTransfer(user, method) {
  requireAuth(user);
  const m = method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(m)) {
    requirePermission(user, "godownTransfer", "You do not have permission to view godown transfers.");
    return;
  }
  if (isSuperUser(normalizeRole(user.role))) return;
  if (user.permissions?.includes("godownTransfer") || user.allow_transfer_godown) return;
  throw new ApiError(403, "You do not have permission to transfer stock between godowns.");
}

// Plain "list the godowns" is shared read data — both Godown Master's own
// screen and the Godown Transfer picker's source/destination dropdowns need
// it, so either permission alone is enough (this endpoint reveals nothing
// beyond godown names, which Master already shows).
export function authorizeGodownRead(user) {
  requireAuth(user);
  if (isSuperUser(normalizeRole(user.role))) return;
  if (user.permissions?.includes("godownMaster") || user.permissions?.includes("godownTransfer")) return;
  throw new ApiError(403, "You do not have permission to view godowns.");
}
