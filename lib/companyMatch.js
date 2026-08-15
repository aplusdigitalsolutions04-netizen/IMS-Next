// Pure string-matching helpers for "does this extracted contract seller
// correspond to a company record?" — shared by both the server-side check in
// app/api/contracts/parse/route.js (matches against every company in the
// system) and the client-side check in components/contracts/ContractUpload.jsx
// (matches against the current user's own available companies). Kept as a
// standalone, dependency-free module (no db/client-only imports) so both
// sides can import it without pulling in the other's runtime.

export const normGstin = (v) => String(v || "").replace(/\s+/g, "").toUpperCase();
export const normText = (v) => String(v || "").trim().toLowerCase();

// True when `sellerGstin`/`sellerCompany` (as extracted from a contract PDF)
// identify the same company as `company` ({ name, gstNumber }). GSTIN is the
// reliable identifier when both sides have one; company name (written
// inconsistently across documents) is only a fallback, matched as a
// substring either direction to tolerate suffixes/abbreviations.
export const isSameCompany = (sellerCompany, sellerGstin, company) =>
  (sellerGstin && company?.gstNumber && normGstin(sellerGstin) === normGstin(company.gstNumber)) ||
  (sellerCompany && company?.name &&
    (normText(sellerCompany).includes(normText(company.name)) || normText(company.name).includes(normText(sellerCompany))));
