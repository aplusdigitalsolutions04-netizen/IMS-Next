import { mysqlPool } from "@/lib/db";
import { parseJsonArray } from "@/lib/helpers";
import { ensurePerformanceIndexes } from "@/lib/dbIndexes";

// Dashboard sections got their own "show this on the Dashboard" permissions
// (Manage Roles → Dashboard Widgets). So nothing disappears for existing roles,
// the first time each stage runs every role is given the dash_* permissions
// matching what it could ALREADY see; after that they're managed normally in
// Manage Roles / Custom access. Roles created later start flagged as already
// migrated (column default is flipped to 1), so an Admin unticking one is
// never silently undone.

// Stage 1 — the three widgets (My Tasks / Mail Inbox / Contract Groups).
const WIDGET_FOR = { tasks: "dash_myTasks", emailInbox: "dash_mail", contractGroups: "dash_contractGroups" };

// Stage 2 — the original cards and charts. Same rules the Dashboard page used
// before: ops cards need any ops-side permission, finance cards need "reports".
const OPS_PERMISSION_IDS = ["orders", "dispatch", "stat_stock_in", "returns", "damage", "stat_current_stock"];
const SECTION_RULES = {
  always: ["dash_orders"],
  ops: ["dash_dispatch", "dash_returns", "dash_stockIn", "dash_damaged", "dash_stockHealth", "dash_godownStock", "dash_topCategory"],
  opsOrFinance: ["dash_stockAvailable"],
  finance: ["dash_duePayments", "dash_pendingBill", "dash_totalOrder", "dash_sales"],
};

let started = null;
export function ensureDashboardWidgetPermissions() {
  if (!started) {
    started = run().catch((err) => { started = null; throw err; });
    ensurePerformanceIndexes().catch(() => {});
  }
  return started;
}

// Adds a "migrated" flag column; returns false if it already existed (stage done earlier).
async function addFlagColumn(name) {
  try {
    await mysqlPool.query(`ALTER TABLE roles ADD COLUMN ${name} TINYINT(1) NOT NULL DEFAULT 0`);
    return true;
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME") return false;
    throw err;
  }
}

async function finishStage(name) {
  await mysqlPool.query(`UPDATE roles SET ${name} = 1`);
  await mysqlPool.query(`ALTER TABLE roles ALTER COLUMN ${name} SET DEFAULT 1`);
}

async function run() {
  if (await addFlagColumn("dashWidgetsMigrated")) {
    const [roles] = await mysqlPool.query("SELECT guid, permissions FROM roles");
    for (const r of roles) {
      const perms = parseJsonArray(r.permissions);
      const add = Object.entries(WIDGET_FOR).filter(([base, widget]) => perms.includes(base) && !perms.includes(widget)).map(([, widget]) => widget);
      if (add.length > 0) await mysqlPool.query("UPDATE roles SET permissions = ? WHERE guid = ?", [JSON.stringify([...perms, ...add]), r.guid]);
    }
    await finishStage("dashWidgetsMigrated");
  }

  if (await addFlagColumn("dashSectionsMigrated")) {
    const [roles] = await mysqlPool.query("SELECT guid, permissions FROM roles");
    for (const r of roles) {
      const perms = parseJsonArray(r.permissions);
      const hasOps = OPS_PERMISSION_IDS.some((p) => perms.includes(p));
      const hasFinance = perms.includes("reports");
      const wanted = [
        ...SECTION_RULES.always,
        ...(hasOps ? SECTION_RULES.ops : []),
        ...(hasOps || hasFinance ? SECTION_RULES.opsOrFinance : []),
        ...(hasFinance ? SECTION_RULES.finance : []),
      ].filter((p) => !perms.includes(p));
      if (wanted.length > 0) await mysqlPool.query("UPDATE roles SET permissions = ? WHERE guid = ?", [JSON.stringify([...perms, ...wanted]), r.guid]);
    }
    await finishStage("dashSectionsMigrated");
  }
}
