import path from "path";
import { mysqlPool } from "@/lib/db";
import { readUploadedFileBuffer } from "@/lib/upload";
import { parseTemplateAttachments } from "@/lib/emailTemplateAttachments";

// The documents of an order that the Email tab attaches automatically — the
// same files the order's Documents tab shows (invoice, e-way bill, POD, GeM
// contract, challan and any custom "additional" document). The Gate Pass is
// NOT one of them: it is generated on demand, not a stored document, and is
// deliberately never attached from here.
//
// Orders and their documents are looked up separately and merged here (no
// cross-table guid JOINs — collation mismatches between tables).
const LABELS = {
  invoice: "Invoice",
  ewayBill: "E-Way Bill",
  pod: "POD",
  gemContract: "Contract",
  challan: "Challan",
};

const isGatepass = (value) => /gate\s*-?\s*pass/i.test(String(value || ""));

export async function getOrderEmailDocuments(orderGuid, companyGuid) {
  const [[order]] = await mysqlPool.query(
    "SELECT guid, invoiceFilename, ewayBillFilename FROM orders WHERE guid = ? AND companyGuid = ? AND isDeleted = 0",
    [orderGuid, companyGuid]
  );
  if (!order) return [];

  const [items] = await mysqlPool.query("SELECT guid, contractFilename FROM order_items WHERE orderGuid = ? AND companyGuid = ?", [orderGuid, companyGuid]);
  const [[logistics]] = await mysqlPool.query("SELECT podFilename FROM order_logistics WHERE orderGuid = ? AND companyGuid = ? LIMIT 1", [orderGuid, companyGuid]).catch(() => [[null]]);
  const itemGuids = items.map((i) => i.guid);
  const [docRows] = itemGuids.length
    ? await mysqlPool.query("SELECT docType, filename FROM orderdocuments WHERE companyGuid = ? AND dispatchGuid IN (?) ORDER BY createdAt DESC", [companyGuid, itemGuids])
    : [[]];

  const docs = [];
  const seen = new Set();
  // Uploading the same PDF again (or once per item of a multi-item order) stores it under a new
  // "<timestamp>-<random>-<original name>" file name each time, so de-duplicating by stored name
  // listed — and mailed — the same document several times. Key on type + original name instead.
  const originalName = (name) => (name.match(/^\d{10,}-\d+-(.+)$/)?.[1] || name).toLowerCase();
  const add = (docType, filename) => {
    const name = String(filename || "").trim();
    if (!name || isGatepass(docType) || isGatepass(name)) return;
    const key = `${String(docType || "").toLowerCase()}|${originalName(name)}`;
    if (seen.has(name) || seen.has(key)) return;
    seen.add(name);
    seen.add(key);
    docs.push({ docType, label: LABELS[docType] || String(docType || "Document"), filename: name });
  };

  // The order's current invoice / e-way bill / POD first, then everything
  // else uploaded for it (newest first, so a re-upload wins over its older copies).
  add("invoice", order.invoiceFilename);
  add("ewayBill", order.ewayBillFilename);
  add("pod", logistics?.podFilename);
  for (const it of items) add("gemContract", it.contractFilename);
  for (const d of docRows) add(d.docType, d.filename);

  // Readable, unique names for the attachment list ("Invoice.pdf", "Invoice 2.pdf" ...).
  const used = {};
  for (const d of docs) {
    used[d.label] = (used[d.label] || 0) + 1;
    d.displayName = `${d.label}${used[d.label] > 1 ? ` ${used[d.label]}` : ""}${path.extname(d.filename)}`;
  }
  return docs;
}

// Turns the attachments the compose window sends into nodemailer attachments.
// `{ ref: true, filename }` entries point at a stored order document (so the
// browser never has to download and re-upload it); they are honoured only if
// the file really is one of this order's documents. Everything else is a
// normal base64 file the user added by hand.
export async function resolveEmailAttachments(attachments, { orderGuid, companyGuid }) {
  const list = Array.isArray(attachments) ? attachments : [];
  const refs = list.filter((a) => a && a.ref && !a.template);
  let allowed = null;
  if (refs.length) {
    if (!orderGuid) throw new Error("Cannot attach order documents without an order.");
    allowed = new Map((await getOrderEmailDocuments(orderGuid, companyGuid)).map((d) => [d.filename, d]));
  }

  const out = [];
  for (const a of list) {
    if (!a) continue;
    if (!a.ref) { out.push(a); continue; }
    if (a.template) {
      // A file stored on an email template — honoured only if a template of this company (or a shared one) really carries it.
      const fname = String(a.filename || "");
      if (!fname) continue;
      const [tpls] = await mysqlPool.query(
        "SELECT attachments FROM email_templates WHERE (companyGuid = ? OR companyGuid IS NULL) AND attachments LIKE ?",
        [companyGuid, `%${fname.replace(/[%_\\]/g, "")}%`]
      );
      if (!tpls.some((t) => parseTemplateAttachments(t.attachments).some((x) => x.filename === fname))) continue;
      const tbuf = await readUploadedFileBuffer(fname);
      if (tbuf) out.push({ filename: String(a.name || fname), content: tbuf });
      continue;
    }
    const doc = allowed.get(String(a.filename || ""));
    if (!doc) continue; // not this order's document — never attach arbitrary files
    const buffer = await readUploadedFileBuffer(doc.filename);
    if (!buffer) continue; // file missing from storage — skip rather than fail the whole send
    // Stored names look like "1778…-93944338-GEMC-….pdf"; send a readable one.
    out.push({ filename: doc.displayName, content: buffer });
  }
  return out;
}
