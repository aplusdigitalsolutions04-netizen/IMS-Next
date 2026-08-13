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
// delete godowns) access, and vice versa.
export function authorizeGodownTransfer(user, method) {
  requireAuth(user);
  const m = method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(m)) {
    requirePermission(user, "godownTransfer", "You do not have permission to view godown transfers.");
    return;
  }
  if (isSuperUser(normalizeRole(user.role))) return;
  if (user.allow_transfer_godown) return;
  throw new ApiError(403, "You do not have permission to transfer stock between godowns.");
}
