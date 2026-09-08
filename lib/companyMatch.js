// Pure string-matching helpers for "does this extracted contract seller
// correspond to a company record?" — shared by both the server-side check in
// app/api/contracts/parse/route.js (matches against every company in the
// system) and the client-side check in components/contracts/ContractUpload.jsx
// (matches against the current user's own available companies). Kept as a
// standalone, dependency-free module (no db/client-only imports) so both
// sides can import it without pulling in the other's runtime.

export const normGstin = (v) => String(v || "").replace(/\s+/g, "").toUpperCase();
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
