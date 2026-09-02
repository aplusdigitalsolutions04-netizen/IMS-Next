import { mysqlPool } from "./db";

// Lazily add createdBy to email_accounts the first time it's needed, same
// self-migrating pattern as lib/aiParse.js / lib/mailer.js's
// ensureSentLogColumn — avoids a separate manual migration step per
// environment. Tracks who added each webmail so access to its actual mail
// (Inbox/Sent) can be limited to them (and Admin), while everyone else just
// sees the account exists in the picker.
let migrated = false;
export async function ensureEmailAccountsOwnerColumn() {
  if (migrated) return;
  try {
    await mysqlPool.query("ALTER TABLE email_accounts ADD COLUMN createdBy VARCHAR(64) NULL");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
  migrated = true;
}

// Per-account signature (rich HTML, added via the Compose modal's
// RichTextEditor) — inserted at send time with one click instead of
// retyping a sign-off on every email.
let signatureMigrated = false;
export async function ensureEmailAccountsSignatureColumn() {
  if (signatureMigrated) return;
  try {
    await mysqlPool.query("ALTER TABLE email_accounts ADD COLUMN signature MEDIUMTEXT NULL");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
  signatureMigrated = true;
}
