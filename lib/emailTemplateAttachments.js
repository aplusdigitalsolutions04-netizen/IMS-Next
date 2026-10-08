import { deleteUploadedFile } from "@/lib/upload";

// email_templates.attachments holds a JSON array of { filename, name, size }: files stored once on the
// template and attached to every mail sent from it.
export function parseTemplateAttachments(raw) {
  if (!raw) return [];
  try {
    const list = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(list)) return [];
    return list
      .filter((a) => a && typeof a.filename === "string" && a.filename.trim())
      .map((a) => ({ filename: a.filename.trim(), name: String(a.name || a.filename), size: Number(a.size) || 0 }));
  } catch {
    return [];
  }
}

// Cleans what the form sends (only the three known keys, no duplicates) and returns the JSON to store.
export function serializeTemplateAttachments(input) {
  const seen = new Set();
  const clean = parseTemplateAttachments(input).filter((a) => !seen.has(a.filename) && seen.add(a.filename));
  return clean.length ? JSON.stringify(clean) : null;
}

// Removes from storage the files that were on the template before but are not any more.
export async function deleteRemovedAttachments(oldRaw, newRaw) {
  const keep = new Set(parseTemplateAttachments(newRaw).map((a) => a.filename));
  for (const a of parseTemplateAttachments(oldRaw)) {
    if (!keep.has(a.filename)) await deleteUploadedFile(a.filename).catch(() => {});
  }
}
