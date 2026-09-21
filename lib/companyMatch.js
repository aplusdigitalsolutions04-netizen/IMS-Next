// Pure string-matching helpers for "does this extracted contract seller
// correspond to a company record?" — shared by both the server-side check in
// app/api/contracts/parse/route.js (matches against every company in the
// system) and the client-side check in components/contracts/ContractUpload.jsx
// (matches against the current user's own available companies). Kept as a
// standalone, dependency-free module (no db/client-only imports) so both
// sides can import it without pulling in the other's runtime.

// Businesses commonly annotate a GSTIN with which branch/office it belongs to
// — e.g. "08ETCPS8746E1Z7 (B)", "06ETCPS8746E1ZB(R)" — when noting multiple
// registrations for Company Master's "Additional GST Numbers". That
// annotation is never part of the actual GSTIN and never appears in a
// contract's AI-extracted sellerGstin, so it must be stripped before
// comparing — otherwise a correctly-entered GSTIN+annotation can never match
// the clean GSTIN pulled from an uploaded contract, wrongly reporting "no
// matching company" for a company that was, in fact, entered correctly.
// The "(B)"/"(R)"/"(G)" annotation (and anything else parenthesized) is
// dropped whole, content included — stripping only punctuation afterward
// would leave the letter itself (e.g. "(B)" → "B") glued onto the GSTIN.
// Then any OTHER leftover non-alphanumeric character is stripped too — a
// stray trailing comma or an unbalanced bracket that's not inside a
// parenthesized pair (legacy rows saved before the Company Master
// "Additional GST" input started splitting/cleaning pasted lists, see
// companyMaster/page.jsx's addExtraGst) would otherwise silently break an
// exact-match comparison the same way an unstripped "(B)" annotation used to.
export const normGstin = (v) => String(v || "").replace(/\([^)]*\)/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
export const normText = (v) => String(v || "").trim().toLowerCase();

// A GSTIN is always exactly 15 characters. Some legacy "Additional GST"
// entries hold two or more GSTINs glued into one string (e.g. a paste that
// landed before addExtraGst's comma-splitting existed) — once punctuation is
// stripped that reads as one long string that's an exact multiple of 15, so
// it's split back into its individual GSTINs rather than left as a single
// value that can never equal any one real GSTIN.
const splitGlued = (g) => {
  if (g.length > 15 && g.length % 15 === 0) {
    const chunks = [];
    for (let i = 0; i < g.length; i += 15) chunks.push(g.slice(i, i + 15));
    return chunks;
  }
  return [g];
};

// A company can hold more than one GSTIN — separate state registrations
// under the same PAN — so `company.gstNumber` (the one used on this
// company's own generated documents) is only ever one of possibly several
// valid GSTINs for it. `company.additionalGstNumbers` holds the rest.
// Returns every GSTIN, normalized, deduped.
export const allGstNumbers = (company) => {
  const list = [company?.gstNumber, ...(Array.isArray(company?.additionalGstNumbers) ? company.additionalGstNumbers : [])]
    .filter(Boolean)
    .map(normGstin)
    .flatMap(splitGlued);
  return [...new Set(list)];
};

// True when `sellerGstin`/`sellerCompany` (as extracted from a contract PDF)
// identify the same company as `company` ({ name, gstNumber, additionalGstNumbers? }).
// GSTIN is the reliable identifier when both sides have one — checked
// against every GSTIN the company holds, not just its primary one; company
// name (written inconsistently across documents) is only a fallback,
// matched as a substring either direction to tolerate suffixes/abbreviations.
export const isSameCompany = (sellerCompany, sellerGstin, company) =>
  (sellerGstin && allGstNumbers(company).includes(normGstin(sellerGstin))) ||
  (sellerCompany && company?.name &&
    (normText(sellerCompany).includes(normText(company.name)) || normText(company.name).includes(normText(sellerCompany))));
