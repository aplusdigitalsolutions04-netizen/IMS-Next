import crypto from "crypto";

// AES-256-GCM for stored credentials. The key lives in CREDENTIALS_ENCRYPTION_KEY
// (64 hex chars = 32 bytes) in .env.local — never in the database — so a leaked
// DB dump alone can't be decrypted. Losing the key makes every saved password
// permanently unreadable, so it needs its own backup.
//
// Stored format: "v1:<iv hex>:<auth tag hex>:<ciphertext hex>". The version
// prefix leaves room to rotate the algorithm/key later without ambiguity.
function getKey() {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set (needs 64 hex characters) — add it to .env.local and restart the server.");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plain) {
  if (plain === null || plain === undefined || plain === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return `v1:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(stored) {
  if (!stored) return "";
  const [version, ivHex, tagHex, dataHex] = String(stored).split(":");
  if (version !== "v1" || !ivHex || !tagHex || !dataHex) throw new Error("Unrecognised encrypted value format.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}
