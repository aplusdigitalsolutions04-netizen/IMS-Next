import { randomUUID } from "crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { mysqlPool } from "./db";

// Fetches unseen messages from one account's inbox via IMAP, stores them in
// email_messages (deduped by Message-ID), and flags them \Seen on the server
// so the next poll only picks up genuinely new mail — no separate cursor
// bookkeeping needed beyond that.
async function pollAccount(account) {
  const client = new ImapFlow({
    host: account.imapHost,
    port: Number(account.imapPort) || 993,
    secure: !!account.imapSecure,
    auth: { user: account.smtpUser, pass: account.smtpPass },
    logger: false,
  });

  let saved = 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      for (const uid of uids || []) {
        const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
        if (!msg?.source) continue;
        const parsed = await simpleParser(msg.source);
        const messageId = parsed.messageId || `no-id-${account.guid}-${uid}`;

        const [existing] = await mysqlPool.query(
          "SELECT guid FROM email_messages WHERE emailAccountGuid = ? AND messageId = ?",
          [account.guid, messageId]
        );
        if (existing.length === 0) {
          await mysqlPool.query(
            `INSERT INTO email_messages
               (guid, emailAccountGuid, companyGuid, purpose, messageId, fromAddress, fromName, subject, bodyText, bodyHtml, receivedAt, isRead)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
              randomUUID(), account.guid, account.companyGuid, account.purpose, messageId,
              parsed.from?.value?.[0]?.address || null, parsed.from?.value?.[0]?.name || null,
              parsed.subject || "(no subject)", parsed.text || null, parsed.html || null,
              parsed.date || new Date(),
            ]
          );
          saved += 1;

          // This reply's In-Reply-To/References headers point back at the
          // Message-ID of whatever we originally sent — match against that
          // to cancel the pending reminder for it.
          const repliedToIds = [
            parsed.inReplyTo,
            ...(Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []),
          ].filter(Boolean);
          if (repliedToIds.length > 0) {
            await mysqlPool.query(
              `UPDATE email_sent_log SET repliedAt = NOW() WHERE repliedAt IS NULL AND messageId IN (?)`,
              [repliedToIds]
            );
          }
        }
        await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  await mysqlPool.query("UPDATE email_accounts SET lastPolledAt = NOW() WHERE guid = ?", [account.guid]);
  return saved;
}

// The Inbox page (see EmailInbox.jsx) polls on a client-side timer — every
// open tab, for every user who has the page open, independently. With no
// server-side worker there's no natural place to coordinate that, so a
// shared mailbox with two tabs open (or two team members both on the Inbox
// page) fires concurrent IMAP logins to the same account. Most IMAP
// providers (Hostinger included) cap concurrent connections per mailbox and
// rate-limit rapid re-auth — past that, connections start failing, which is
// what shows up as "it worked once, then keeps disconnecting." Throttling
// per-account here (not per ownerId — a shared account can be polled by
// different owners at once too) collapses all of that into one real IMAP
// connection per account per window, cached on globalThis to survive
// Next.js dev hot-reload the same way the auth caches in lib/auth.js do.
const globalForCache = globalThis;
const _pollState = globalForCache.__imsImapPollState || new Map();
if (!globalForCache.__imsImapPollState) globalForCache.__imsImapPollState = _pollState;
const POLL_THROTTLE_MS = 20_000;

async function pollAccountThrottled(account) {
  const state = _pollState.get(account.guid) || { inFlight: null, lastAt: 0, lastResult: null };
  _pollState.set(account.guid, state);

  if (state.inFlight) return state.inFlight;
  if (state.lastResult && Date.now() - state.lastAt < POLL_THROTTLE_MS) return state.lastResult;

  state.inFlight = (async () => {
    let result;
    try {
      const saved = await pollAccount(account);
      result = { ok: true, newMessages: saved };
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    state.lastResult = result;
    state.lastAt = Date.now();
    state.inFlight = null;
    return result;
  })();

  return state.inFlight;
}

// Polls every active, IMAP-enabled account. Returns a per-account summary —
// a failure on one account (bad creds, host unreachable) doesn't stop the
// others from being checked.
// `ownerId` scopes this to one user's own accounts (everyone but Admin) —
// polling (and its "Checked N account(s)" summary) shouldn't surface how
// many accounts *other* people added, matching the same visibility
// /api/email-accounts already enforces.
export async function pollAllInboxes(ownerId = null) {
  const clause = ownerId ? "AND (createdBy = ? OR JSON_CONTAINS(sharedWith, JSON_QUOTE(?)))" : "";
  const params = ownerId ? [ownerId, String(ownerId)] : [];
  const [accounts] = await mysqlPool.query(
    `SELECT * FROM email_accounts WHERE isActive = 1 AND imapEnabled = 1 AND imapHost IS NOT NULL AND imapHost != '' ${clause}`,
    params
  );

  const results = [];
  for (const account of accounts) {
    const result = await pollAccountThrottled(account);
    results.push({ accountName: account.accountName, guid: account.guid, ...result });
  }
  return results;
}
