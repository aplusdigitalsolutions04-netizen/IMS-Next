// One-off: Manage Roles now has 3 previously-missing view permissions
// (godownTransfer, roles, userActivity) and 6 tabs that used to share one
// bundled permission for view+add+edit+delete now have a real Add/Edit/
// Delete split (roles, companyMaster, platformMaster, users, emailAccounts,
// emailTemplates). Both are backward-incompatible on their own — an existing
// role that could already do these things would otherwise lose that access
// the moment the new, stricter server-side checks ship. This backfills every
// existing role's permissions/editPermissions JSON so nobody's current
// access changes; going forward, admins toggle these independently in
// Manage Roles like everything else.
require("dotenv").config({ path: ".env.local" });
const mysql = require("mysql2/promise");

const FULL_CRUD_KEYS = ["roles", "companyMaster", "platformMaster", "users", "emailAccounts", "emailTemplates"];

async function run() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const [roles] = await c.query("SELECT guid, name, permissions, editPermissions FROM roles WHERE isDeleted=0");
    for (const role of roles) {
      const perms = new Set(parseArr(role.permissions));
      const editPerms = new Set(parseArr(role.editPermissions));
      let changed = false;

      // godownMaster + allow_edit_godown already implied transfer access.
      if (perms.has("godownMaster") && editPerms.has("allow_edit_godown")) {
        if (!perms.has("godownTransfer")) { perms.add("godownTransfer"); changed = true; }
        if (!editPerms.has("allow_transfer_godown")) { editPerms.add("allow_transfer_godown"); changed = true; }
      }

      // "users" permission alone used to gate Roles CRUD and User Activity too.
      if (perms.has("users")) {
        for (const id of ["roles", "userActivity"]) {
          if (!perms.has(id)) { perms.add(id); changed = true; }
        }
      }

      // Every FULL_CRUD_KEYS tab used to be gated by its single base
      // permission alone for every method (view+add+edit+delete combined).
      for (const key of FULL_CRUD_KEYS) {
        if (perms.has(key)) {
          for (const flag of [`allow_add_${key}`, `allow_edit_${key}`, `allow_delete_${key}`]) {
            if (!editPerms.has(flag)) { editPerms.add(flag); changed = true; }
          }
        }
      }

      if (changed) {
        await c.query("UPDATE roles SET permissions=?, editPermissions=? WHERE guid=?", [
          JSON.stringify([...perms]), JSON.stringify([...editPerms]), role.guid,
        ]);
        console.log(`Backfilled role "${role.name}"`);
      }
    }
    console.log("Done.");
  } finally {
    await c.end();
  }
}

function parseArr(val) {
  try {
    const parsed = typeof val === "string" ? JSON.parse(val) : val;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
