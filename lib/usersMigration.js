import { mysqlPool } from "./db";

// `users.role` was originally a fixed ENUM('Admin','Supervisor','Accountant',
// 'User','Operator','SuperAdmin') from before Manage Roles let an Admin
// create arbitrary custom role names (see lib/auth.js's resolveRole — it
// deliberately stores whatever free-text name a roles row has, no
// predefined list). Assigning a user to any custom role whose name isn't
// one of those six legacy values tries to write an out-of-range ENUM value:
// under a non-strict SQL mode (common on shared hosting) MySQL doesn't
// error, it silently stores an empty string instead — which is why that
// user's Role badge renders as a bare dot with no name. Converting the
// column to a plain VARCHAR removes the fixed list entirely so any role
// name written here is stored as-is.
let ensured = false;
export async function ensureUsersRoleColumnIsVarchar() {
  if (ensured) return;
  await mysqlPool.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(100) NOT NULL DEFAULT 'User'");
  ensured = true;
}
