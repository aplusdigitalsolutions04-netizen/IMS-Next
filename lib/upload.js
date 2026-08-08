import fs from "fs";
import path from "path";

// Mirrors Backend4/middleware/upload.js's multer disk-storage config, but via
// Next.js Route Handlers' `request.formData()` instead of multer middleware.
//
// UPLOAD_DIR, when set, points new reads/writes at a different folder (e.g.
// a fresh one for testing) without touching the old "uploads" folder at
// all — nothing here ever deletes it. The public URL stays "/uploads/..."
// regardless (that's just the Next.js route path in app/uploads/[filename],
// unrelated to which folder is actually read from on disk).
export const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

function sanitizeFilename(name) {
  return String(name || "file").replace(/[^\w.\- ()]/g, "_");
}

// Same filename convention multer used: `${timestamp}-${random}-${safeName}`.
export async function saveUploadedFile(file, { prefix } = {}) {
  if (!file || typeof file.arrayBuffer !== "function") return null;
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const safe = sanitizeFilename(file.name);
  // Preserve the original extension even with a prefix — without it, the
  // saved file has no extension at all, so /uploads/[filename] can't detect
  // its MIME type and serves it as application/octet-stream, which browsers
  // always force-download regardless of Content-Disposition: inline.
  const ext = path.extname(safe);
  const filename = prefix ? `${prefix}-${unique}${ext}` : `${unique}-${safe}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.promises.writeFile(path.join(uploadDir, filename), buffer);
  return { filename, size: buffer.length, mimetype: file.type };
}

// Reads all files from a multipart formData under a given field name (or every
// File entry if fieldName is omitted).
export async function getUploadedFiles(formData, fieldName) {
  const entries = fieldName ? formData.getAll(fieldName) : Array.from(formData.values());
  return entries.filter((e) => e && typeof e.arrayBuffer === "function");
}
