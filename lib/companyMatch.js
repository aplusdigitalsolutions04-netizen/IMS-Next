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
export const normGstin = (v) => String(v || "").replace(/\([^)]*\)/g, "").replace(/\s+/g, "").toUpperCase();
export const normText = (v) => String(v || "").trim().toLowerCase();

// A company can hold more than one GSTIN — separate state registrations
// under the same PAN — so `company.gstNumber` (the one used on this
// company's own generated documents) is only ever one of possibly several
// valid GSTINs for it. `company.additionalGstNumbers` holds the rest.
// Returns every GSTIN, normalized, deduped.
export const allGstNumbers = (company) => {
  const list = [company?.gstNumber, ...(Array.isArray(company?.additionalGstNumbers) ? company.additionalGstNumbers : [])]
    .filter(Boolean)
    .map(normGstin);
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
