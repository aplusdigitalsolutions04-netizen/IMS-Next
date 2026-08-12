// No role names are predefined — every selectable role (other than the
// hardcoded Admin superuser) is whatever an admin created in Manage Roles.
// This sentinel is the only fixed "role" value the client ever sends.
export const ADMIN_ROLE_ID = "admin";

// Admin always passes — every other role's access comes entirely from the
// `permissions` array on the user object, resolved server-side from their
// assigned role (see lib/auth.js requirePermission for the API-side mirror).
export const hasPermission = (user, permissionId) =>
  user?.role === "Admin" || !!user?.permissions?.includes(permissionId);
