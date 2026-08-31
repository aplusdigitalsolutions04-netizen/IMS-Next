import { v4 as uuidv4 } from "uuid";

// Ported from Backend4/notificationService.js. In Express this kept a
// Map<userId, Set<res>> of raw response objects; Route Handlers use
// ReadableStream controllers instead, but the registry shape is identical.
const globalForSSE = globalThis;
const sseClients = globalForSSE.__imsSseClients || new Map(); // Map<userId, Set<controller>>
if (!globalForSSE.__imsSseClients) globalForSSE.__imsSseClients = sseClients;

const encoder = new TextEncoder();

export function addSSEClient(userId, controller) {
  const id = String(userId);
  if (!sseClients.has(id)) sseClients.set(id, new Set());
  sseClients.get(id).add(controller);
}

export function removeSSEClient(userId, controller) {
  const id = String(userId);
  const set = sseClients.get(id);
  if (set) {
    set.delete(controller);
    if (set.size === 0) sseClients.delete(id);
  }
}

export function sendSSEToUser(userId, data) {
  const set = sseClients.get(String(userId));
  if (!set) return;
  const payload = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
  for (const controller of set) {
    try {
      controller.enqueue(payload);
    } catch {
      // controller already closed — will be cleaned up by its own `cancel()`
    }
  }
}

export async function createNotification(pool, { targetUserGuid, targetRole, targetEditFlag, title, message, type = "info", priority = "low", link = null, companyGuid = null }) {
  try {
    let usersToNotify = [];

    if (targetUserGuid) usersToNotify.push(targetUserGuid);

    if (targetRole) {
      // Scoped to the company when known, so an Admin in Company A doesn't get
      // notified about Company B's activity. Falls back to every user with
      // that role when companyGuid isn't available to the caller (e.g. a
      // cross-company system job), matching the previous unscoped behavior.
      // Only ever used for "Admin" here — a deliberately-allowed hardcode
      // (Admin is the one role that's never DB-driven).
      const [rows] = companyGuid
        ? await pool.query(
            `SELECT DISTINCT u.userid FROM users u
             LEFT JOIN user_companies uc ON uc.userGuid = u.userid
             WHERE u.role = ? AND (u.allCompaniesAccess = 1 OR uc.companyGuid = ?)`,
            [targetRole, companyGuid]
          )
        : await pool.query("SELECT userid FROM users WHERE role = ?", [targetRole]);
      usersToNotify.push(...rows.map((r) => String(r.userid)));
    }

    if (targetEditFlag) {
      // Role-driven equivalent of targetRole — notifies whoever's assigned
      // role currently grants this edit-flag (e.g. billing-edit), instead of
      // a hardcoded role name. Works for any role (base tier or custom).
      const [rows] = companyGuid
        ? await pool.query(
            `SELECT DISTINCT u.userid FROM users u
             LEFT JOIN roles r ON u.roleId = r.guid AND r.isDeleted = 0
             LEFT JOIN user_companies uc ON uc.userGuid = u.userid
             WHERE (u.role = 'Admin' OR JSON_CONTAINS(r.editPermissions, JSON_QUOTE(?)))
               AND (u.allCompaniesAccess = 1 OR uc.companyGuid = ?)`,
            [targetEditFlag, companyGuid]
          )
        : await pool.query(
            `SELECT DISTINCT u.userid FROM users u
             LEFT JOIN roles r ON u.roleId = r.guid AND r.isDeleted = 0
             WHERE u.role = 'Admin' OR JSON_CONTAINS(r.editPermissions, JSON_QUOTE(?))`,
            [targetEditFlag]
          );
      usersToNotify.push(...rows.map((r) => String(r.userid)));
    }

    usersToNotify = [...new Set(usersToNotify)];
    if (usersToNotify.length === 0) return;

    // Respect each user's own notification on/off preference (Settings > My
    // Profile) — muted users are silently skipped rather than filtered at
    // read time, so their unread count/SSE stream never sees them at all.
    const [enabledRows] = await pool.query(
      "SELECT userid FROM users WHERE userid IN (?) AND notificationsEnabled = 1",
      [usersToNotify]
    );
    usersToNotify = enabledRows.map((r) => String(r.userid));
    if (usersToNotify.length === 0) return;

    const values = usersToNotify.map((uid) => [uuidv4(), companyGuid, uid, title, message, type, priority, link]);

    await pool.query(
      "INSERT INTO notifications (guid, companyGuid, targetUserGuid, title, message, type, priority, link) VALUES ?",
      [values]
    );

    const newNotifs = values.map((v) => ({
      guid: v[0], targetUserGuid: v[1], title: v[2], message: v[3], type: v[4], priority: v[5], link: v[6], isRead: 0, createdAt: new Date().toISOString(),
    }));

    newNotifs.forEach((notif) => {
      sendSSEToUser(notif.targetUserGuid, { type: "NEW_NOTIFICATION", payload: notif });
    });
  } catch (err) {
    console.error("Error creating notification:", err);
  }
}

export async function handleOrderUpdates(pool, current, merged, orderId, companyGuid = null) {
  const finalStatus = merged.status;
  const finalLogisticsStatus = merged.logisticsStatus;
  const trackingId = merged.trackingId;
  const displayOrderId = current.orderid || current._orderId || orderId;

  let creatorGuid = null;
  if (current.dispatchedBy) {
    const [creatorRows] = await pool.query("SELECT userid FROM users WHERE username = ?", [current.dispatchedBy]);
    if (creatorRows.length > 0) creatorGuid = String(creatorRows[0].userid);
  }

  if (current.status !== finalStatus) {
    let displayStatus = finalStatus;
    if (finalStatus === "Billed") displayStatus = "Packing in Process";

    await createNotification(pool, {
      targetRole: "Admin",
      targetUserGuid: creatorGuid,
      title: "Order Status Changed",
      message: `Order ${displayOrderId} changed from ${current.status || "Pending"} to ${displayStatus}`,
      type: "info",
      link: "/orderTracking",
      companyGuid,
    });

    if (finalStatus === "Send for Billing") {
      await createNotification(pool, {
        targetEditFlag: "allow_edit_billing",
        title: "Order Ready for Billing",
        message: `Order ${displayOrderId} is ready for billing.`,
        type: "warning",
        link: "/billing",
        companyGuid,
      });
    }

    if (finalStatus === "Billed" && creatorGuid) {
      await createNotification(pool, {
        targetUserGuid: creatorGuid,
        title: "Billing Completed",
        message: `Billing completed for your order ${displayOrderId}. It has moved to Dispatch.`,
        type: "success",
        link: "/dispatch",
        companyGuid,
      });
    }
  }

  if (current.logisticsStatus !== finalLogisticsStatus || current.trackingId !== trackingId) {
    await createNotification(pool, {
      targetRole: "Admin",
      targetUserGuid: creatorGuid,
      title: "Logistics Updated",
      message: `Logistics/Tracking updated for Order ${displayOrderId}`,
      type: "info",
      link: "/dispatch",
      companyGuid,
    });
  }
}
