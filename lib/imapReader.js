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
      const uids = await client.search({ seen: false });
      for (const uid of uids || []) {
        const msg = await client.fetchOne(uid, { source: true, envelope: true });
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

// Polls every active, IMAP-enabled account. Returns a per-account summary —
// a failure on one account (bad creds, host unreachable) doesn't stop the
// others from being checked.
export async function pollAllInboxes() {
  const [accounts] = await mysqlPool.query(
    "SELECT * FROM email_accounts WHERE isActive = 1 AND imapEnabled = 1 AND imapHost IS NOT NULL AND imapHost != ''"
  );

  const results = [];
  for (const account of accounts) {
    try {
      const saved = await pollAccount(account);
      results.push({ accountName: account.accountName, guid: account.guid, ok: true, newMessages: saved });
    } catch (err) {
      results.push({ accountName: account.accountName, guid: account.guid, ok: false, error: err.message });
    }
  }
  return results;
}
