"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Sparkles, Save, Plus, Trash2, UploadCloud, Hash, CheckCircle2 } from "lucide-react";
import Swal from "sweetalert2";
import { contractsService } from "@/lib/services/contractsService";
import { companyService } from "@/lib/services/companyService";
import { useCompany } from "@/lib/client/CompanyContext";
import { getStoredUser } from "@/lib/client/auth";
import { normGstin, normText, isSameCompany } from "@/lib/companyMatch";
import AddProductWizard from "./AddProductWizard";

const SECTIONS = [
  {
    title: "Contract Details",
    fields: [
      { key: "bidNumber", label: "Bid Number" },
      { key: "contractNumber", label: "Contract Number", readOnly: true },
      { key: "generatedDate", label: "Generated Date", type: "date" },
    ],
  },
  {
    title: "Buyer Details",
    fields: [
      { key: "buyerContact", label: "Buyer Contact Number" },
      { key: "buyerEmail", label: "Buyer Email ID" },
      { key: "buyerGstin", label: "Buyer GSTIN" },
      { key: "buyerAddress", label: "Buyer Address" },
      { key: "ministry", label: "Ministry" },
      { key: "department", label: "Department" },
      { key: "organisation", label: "Organisation Name" },
      { key: "officeZone", label: "Office Zone" },
    ],
  },
  {
    title: "Seller Details",
    fields: [
      { key: "sellerCompany", label: "Seller Company Name" },
      { key: "sellerContact", label: "Seller Contact Number" },
      { key: "sellerGstin", label: "Seller GSTIN" },
    ],
  },
];

const FIELDS_AFTER_PRODUCTS = [
  { key: "consigneeDesignation", label: "Consignee Designation" },
  { key: "consigneeEmail", label: "Consignee Email ID" },
  { key: "consigneeContact", label: "Consignee Contact" },
  { key: "consigneeAddress", label: "Consignee Address" },
  { key: "deliveryStartAfter", label: "Delivery Start After", type: "date" },
  { key: "deliveryCompletedBy", label: "Delivery To Be Completed By", type: "date" },
  { key: "deliveryInstructions", label: "Delivery Instructions" },
];

const ALL_FIELDS = [...SECTIONS.flatMap((s) => s.fields), ...FIELDS_AFTER_PRODUCTS];
const EMPTY_FORM = ALL_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: "" }), {});

// Carries an in-progress extraction across the full-page reload that
// switchCompany() triggers, so the user doesn't have to re-upload/re-extract
// the same contract after switching into (or creating) the seller's actual
// company.
const PENDING_CONTRACT_KEY = "pt_pending_contract_upload";

const EMPTY_PRODUCT = {
  productName: "", brand: "", model: "", categoryQuadrant: "", hsnCode: "", quantity: "", unitPrice: "", totalValue: "",
};

const toNum = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

// GeM contracts sometimes come through with a placeholder instead of a real
// HSN code (e.g. "HSN not specified by seller") — that's not usable for
// billing/GST, so block saving until it's manually corrected.
const isInvalidHsn = (val) => {
  const v = String(val || "").trim();
  return !v || /not specified/i.test(v);
};

function SectionHeaderRow({ title }) {
  return (
    <tr>
      <td colSpan={2} className="px-4 py-2 bg-indigo-50/70 border-y border-indigo-100">
        <span className="text-[11px] font-black text-indigo-700 uppercase tracking-wider">{title}</span>
      </td>
    </tr>
  );
}

function FieldRow({ label, value, onChange, type, readOnly, zebra }) {
  return (
    <tr className={`border-b border-slate-100 ${zebra ? "bg-slate-50/60" : "bg-white"}`}>
      <td className="px-4 py-2.5 text-sm font-bold text-slate-600 align-top w-1/4 whitespace-nowrap">{label}</td>
      <td className="px-4 py-2.5">
        <input
          type={type || "text"}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          className={`w-full bg-transparent outline-none text-sm rounded px-1.5 py-1 transition-colors ${
            readOnly ? "text-slate-500 cursor-default" : "text-slate-800 hover:bg-white focus:bg-white focus:ring-2 focus:ring-indigo-100"
          }`}
        />
      </td>
    </tr>
  );
}

export default function ContractUpload() {
  const router = useRouter();
  const { activeCompany, availableCompanies, switchCompany, setAvailableCompanies } = useCompany();
  const currentUser = typeof window !== "undefined" ? getStoredUser() : null;
  const canManageCompanies = currentUser?.role === "Admin"
    || currentUser?.permissions?.includes("companyMaster")
    || !!currentUser?.allow_add_companyMaster;
  const [file, setFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [products, setProducts] = useState([]);
  const [pdfFilename, setPdfFilename] = useState(null);
  const [extracted, setExtractedFlag] = useState(false);
  const [contractNumber, setContractNumber] = useState("");
  const [checkingNumber, setCheckingNumber] = useState(false);
  const [numberExists, setNumberExists] = useState(false);
  const [numberExistsMessage, setNumberExistsMessage] = useState("");
  const [pdfContractNumber, setPdfContractNumber] = useState(null);
  const [tokenUsage, setTokenUsage] = useState(null);
  const [wizardProduct, setWizardProduct] = useState(null);
  const wizardResolveRef = React.useRef(null);

  // Resumes an extraction that was interrupted by a company switch/creation
  // (see checkSellerCompanyMatch below) — only once activeCompany matches the
  // company the upload was meant for, otherwise it waits for the next switch.
  useEffect(() => {
    if (!activeCompany) return;
    try {
      const raw = window.sessionStorage.getItem(PENDING_CONTRACT_KEY);
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (pending?.targetCompanyGuid === activeCompany.guid) {
        setForm(pending.form || EMPTY_FORM);
        setProducts(pending.products || []);
        setPdfFilename(pending.pdfFilename || null);
        setContractNumber(pending.contractNumber || "");
        setExtractedFlag(true);
        setTokenUsage(pending.tokenUsage || null);
        window.sessionStorage.removeItem(PENDING_CONTRACT_KEY);
      }
    } catch (err) {}
  }, [activeCompany]);

  const persistPendingContract = (targetCompanyGuid) => {
    try {
      window.sessionStorage.setItem(PENDING_CONTRACT_KEY, JSON.stringify({
        targetCompanyGuid, form, products, pdfFilename, contractNumber, tokenUsage,
      }));
    } catch (err) {}
  };

  let rowIndex = 0;

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
  };

  const handleContractNumberBlur = async () => {
    if (!contractNumber.trim()) {
      setNumberExists(false);
      setNumberExistsMessage("");
      return;
    }
    setCheckingNumber(true);
    try {
      const result = await contractsService.checkContractNumberExists(contractNumber);
      setNumberExists(!!result.exists);
      setNumberExistsMessage(
        result.reason === "order"
          ? `This Contract Number is already in Order Processing (status: ${result.orderStatus}) — it can't be uploaded again.`
          : result.exists
          ? "This Contract Number already exists"
          : ""
      );
    } finally {
      setCheckingNumber(false);
    }
  };

  // Warns when the contract's extracted seller company/GSTIN doesn't match
  // the company currently active for this session — otherwise the contract
  // silently saves under whichever company the user happens to be logged
  // into, regardless of who it was actually issued to. GSTIN is checked
  // first since it's the reliable identifier; company name (which can be
  // written inconsistently across documents) is only a fallback.
  //
  // Returns true if the caller (handleExtract) should abort and reset the
  // form — either because the user is being sent to a different company
  // (new or existing) to continue there, because they cancelled the upload,
  // or because they have no way to fix the mismatch themselves and must go
  // through an Admin instead. A mismatch can never be waved through under
  // the wrong company — the only way past it is to switch/create the right
  // one. Returns false only when there's no mismatch to begin with.
  const checkSellerCompanyMatch = async (sellerCompany, sellerGstin, companyMatch) => {
    if (!activeCompany || (!sellerCompany && !sellerGstin)) return false;

    // Server-side match against EVERY company in the system (not just this
    // user's own availableCompanies) — only set when the seller matches a
    // real, existing company. If that company isn't the active one and this
    // user has no access to it, that's a clean "you don't have permission"
    // case, distinct from "this seller doesn't match any company at all"
    // (handled further down) — the latter wrongly invited an Admin to
    // create a company that, in this case, already exists.
    if (companyMatch && companyMatch.companyGuid !== activeCompany.guid && !companyMatch.userHasAccess) {
      await Swal.fire({
        title: "No access to this company",
        html:
          `This contract's seller is <b>${sellerCompany || "Unknown"}</b>${sellerGstin ? ` (GSTIN ${sellerGstin})` : ""}, ` +
          `which belongs to <b>"${companyMatch.companyName}"</b> — a company that exists in the system, but you don't have access to it.` +
          `<br/><br/>Please contact your Admin to get access, or ask them to upload this contract instead.`,
        icon: "error",
        confirmButtonText: "OK",
      });
      return true;
    }

    const sameByGstin = sellerGstin && activeCompany.gstNumber && normGstin(sellerGstin) === normGstin(activeCompany.gstNumber);
    const sameByName = sellerCompany && activeCompany.name &&
      (normText(sellerCompany).includes(normText(activeCompany.name)) || normText(activeCompany.name).includes(normText(sellerCompany)));

    const hasComparableData = (sellerGstin && activeCompany.gstNumber) || sellerCompany;
    const matches = (sellerGstin && activeCompany.gstNumber) ? sameByGstin : sameByName;
    if (!hasComparableData || matches) return false;

    const suggested = (availableCompanies || []).find((c) => c.guid !== activeCompany.guid && isSameCompany(sellerCompany, sellerGstin, c));

    // Case 1: this seller matches a company the user already has access to
    // — offer to switch straight there instead of just warning.
    if (suggested) {
      const result = await Swal.fire({
        title: "Seller company mismatch",
        html:
          `This contract's seller is <b>${sellerCompany || "Unknown"}</b>${sellerGstin ? ` (GSTIN ${sellerGstin})` : ""}, ` +
          `which belongs to <b>"${suggested.name}"</b>, not your currently active company <b>${activeCompany.name}</b>.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: `Switch to "${suggested.name}"`,
        cancelButtonText: "Cancel upload",
      });
      if (result.isConfirmed) {
        persistPendingContract(suggested.guid);
        const switched = await switchCompany(suggested.guid);
        // A successful switch reloads the page, so resetting local state is
        // moot either way — but if it silently failed (switchCompany alerts
        // and returns false instead of throwing), the user is still on this
        // same page under the still-wrong company, so keep their already-
        // extracted contract data instead of wiping it for nothing.
        return switched;
      }
      return true; // cancelled — mismatch must be resolved, never continue as-is
    }

    // Case 2: seller doesn't match any company the user has access to at
    // all. Only a Company Master-permitted user can resolve this themselves
    // (by creating the company here); everyone else has to go through an
    // Admin — either way, saving under the wrong (currently active) company
    // is blocked.
    if (canManageCompanies) {
      const result = await Swal.fire({
        title: "Unknown seller company",
        html:
          `This contract's seller is <b>${sellerCompany || "Unknown"}</b>${sellerGstin ? ` (GSTIN ${sellerGstin})` : ""}, ` +
          `which doesn't match any company you have access to, including the currently active <b>${activeCompany.name}</b>.` +
          `<br/><br/>You can create <b>"${sellerCompany || "this company"}"</b> now and switch to it to upload this contract.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Create company & switch",
        cancelButtonText: "Cancel upload",
      });
      if (result.isConfirmed) {
        try {
          const created = await companyService.addCompany({ name: sellerCompany || "New Company", gstNumber: sellerGstin || null });
          // switchCompany caches `availableCompanies` into sessionStorage as
          // the post-reload source of truth — the freshly created company
          // isn't in that list yet (it was only ever fetched at login), so
          // without adding it here, the reload lands on a valid session
          // scoped to the new company but with no matching entry to resolve
          // `activeCompany` from, leaving company name/logo/GST blank
          // everywhere until the next full login.
          setAvailableCompanies((prev) => [...prev, { guid: created.guid, name: sellerCompany || "New Company", gstNumber: sellerGstin || null }]);
          persistPendingContract(created.guid);
          await Swal.fire("Company created", `"${sellerCompany}" has been added. Switching you there now — your extracted contract data will carry over automatically.`, "success");
          const switched = await switchCompany(created.guid);
          // Same reasoning as Case 1 — only treat this as handled (and clear
          // the extracted data) if the switch actually went through.
          return switched;
        } catch (err) {
          Swal.fire("Error", err?.response?.data?.message || "Failed to create the company.", "error");
          // Creation itself failed — nothing changed, so keep the user's
          // already-extracted contract data instead of throwing it away.
          return false;
        }
      }
      return true; // cancelled — mismatch must be resolved, never continue as-is
    }

    await Swal.fire({
      title: "Unknown seller company",
      html:
        `This contract's seller is <b>${sellerCompany || "Unknown"}</b>${sellerGstin ? ` (GSTIN ${sellerGstin})` : ""}, ` +
        `which doesn't match your currently active company <b>${activeCompany.name}</b> or any other company you have access to.` +
        `<br/><br/>Please contact your Admin to add this company before uploading this contract.`,
      icon: "warning",
      confirmButtonText: "OK",
    });
    return true;
  };

  const handleExtract = async () => {
    if (!file) {
      Swal.fire("No file", "Please choose a PDF or image of the contract first.", "warning");
      return;
    }
    if (!contractNumber.trim()) {
      Swal.fire("Contract Number required", "Please enter a unique Contract Number before uploading.", "warning");
      return;
    }
    // Re-check right before spending an AI call — the on-blur check may not
    // have finished yet (e.g. paste + immediate click), so `numberExists`
    // alone isn't reliable here; this is the actual gate for whether
    // extraction is allowed to run at all.
    setCheckingNumber(true);
    const check = await contractsService.checkContractNumberExists(contractNumber);
    setCheckingNumber(false);
    if (check.exists) {
      const message =
        check.reason === "order"
          ? `This Contract Number is already in Order Processing (status: ${check.orderStatus}) — it can't be uploaded again.`
          : "A contract with this Contract Number already exists.";
      setNumberExists(true);
      setNumberExistsMessage(message);
      Swal.fire("Already exists", message, "error");
      return;
    }
    setNumberExists(false);
    setNumberExistsMessage("");

    setExtracting(true);
    try {
      const { extracted: extractedData, pdfFilename: savedFilename, companyMatch, tokenUsage: usage } = await contractsService.parseContractFile(file);
      const { products: extractedProducts, contractNumber: extractedContractNumber, ...rest } = extractedData || {};
      setForm({ ...EMPTY_FORM, ...rest, contractNumber: contractNumber.trim() });
      setProducts(Array.isArray(extractedProducts) ? extractedProducts.map((p) => ({ ...EMPTY_PRODUCT, ...p })) : []);
      setPdfFilename(savedFilename);
      setExtractedFlag(true);
      setTokenUsage(usage || null);

      const shouldAbort = await checkSellerCompanyMatch(rest.sellerCompany, rest.sellerGstin, companyMatch);
      if (shouldAbort) {
        setForm(EMPTY_FORM);
        setProducts([]);
        setPdfFilename(null);
        setExtractedFlag(false);
        setTokenUsage(null);
        return;
      }

      const normalize = (v) => String(v || "").trim().toLowerCase();
      if (extractedContractNumber && normalize(extractedContractNumber) !== normalize(contractNumber)) {
        setPdfContractNumber(extractedContractNumber);
        const confirmResult = await Swal.fire({
          title: "Contract Number mismatch",
          text: `You entered the wrong Contract Number. The actual Contract Number inside this document is "${extractedContractNumber}". Do you want to use it instead?`,
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Yes, use it",
          cancelButtonText: "No, keep mine",
        });
        if (confirmResult.isConfirmed) {
          setCheckingNumber(true);
          const result = await contractsService.checkContractNumberExists(extractedContractNumber);
          setCheckingNumber(false);

          if (result.exists) {
            // The PDF's real contract number (only known now, post-extraction)
            // turns out to already be taken — there's nothing left to review or
            // save, so abort cleanly instead of leaving a dead-end filled form
            // with Save permanently disabled.
            const message =
              result.reason === "order"
                ? `This contract's actual Contract Number ("${extractedContractNumber}") is already in Order Processing (status: ${result.orderStatus}) — it can't be uploaded again.`
                : `This contract's actual Contract Number ("${extractedContractNumber}") already exists.`;
            await Swal.fire("Already exists", message, "error");
            setForm(EMPTY_FORM);
            setProducts([]);
            setPdfFilename(null);
            setExtractedFlag(false);
            setPdfContractNumber(null);
            setContractNumber("");
            setNumberExists(false);
            setNumberExistsMessage("");
            setFile(null);
            return;
          }

          setContractNumber(extractedContractNumber);
          setForm((prev) => ({ ...prev, contractNumber: extractedContractNumber }));
          setPdfContractNumber(null);
          setNumberExists(false);
          setNumberExistsMessage("");
        }
      } else {
        setPdfContractNumber(null);
      }
    } catch (error) {
      console.error("Contract extraction failed:", error);
      Swal.fire("Error", error?.response?.data?.message || "Failed to extract contract data", "error");
    } finally {
      setExtracting(false);
    }
  };

  const handleFieldChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleProductChange = (idx, key, value) => {
    setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, [key]: value } : p)));
  };

  const addProductRow = () => setProducts((prev) => [...prev, { ...EMPTY_PRODUCT }]);
  const removeProductRow = (idx) => setProducts((prev) => prev.filter((_, i) => i !== idx));

  const totalOrderValue = products.reduce((sum, p) => sum + toNum(p.totalValue), 0);

  // Waits for the user to either finish the AddProductWizard (resolves with
  // the new itemVariantId) or dismiss it without linking (resolves null).
  const promptAddProduct = (product) =>
    new Promise((resolve) => {
      wizardResolveRef.current = resolve;
      setWizardProduct(product);
    });

  const handleWizardLinked = (itemVariantId) => {
    wizardResolveRef.current?.(itemVariantId);
    wizardResolveRef.current = null;
    setWizardProduct(null);
  };

  const handleWizardClose = () => {
    wizardResolveRef.current?.(null);
    wizardResolveRef.current = null;
    setWizardProduct(null);
  };

  // Runs right after a contract is saved — checks every product against
  // Item Master (by product name, then by the contract's separate model
  // field) and, for anything missing, asks whether to add it now via the
  // wizard. When the model field alone matches something that already
  // exists, the user is asked whether to reuse that model or create a
  // separate new one — a name mismatch doesn't necessarily mean it's a
  // different product, so this shouldn't be silently decided either way.
  // Returns the product list with itemVariantId filled in for whatever got
  // linked, so the contract can be updated with the links.
  const runInventoryValidation = async (savedProducts) => {
    const productsToCheck = savedProducts
      .filter((p) => p.productName)
      .map((p) => ({ productName: p.productName, model: p.model }));
    if (productsToCheck.length === 0) return savedProducts;
    let results = [];
    try {
      results = await contractsService.checkProductsInInventory(productsToCheck);
    } catch (err) {
      console.error("Inventory check failed:", err);
      return savedProducts;
    }

    let updated = [...savedProducts];
    for (const r of results) {
      if (r.exists && r.matchedBy === "name") continue;

      if (r.exists && r.matchedBy === "model") {
        const choice = await Swal.fire({
          title: "Model already in inventory",
          text: `The model for "${r.productName}" matches an existing item ("${r.matchedName}") in your inventory. Use it, or create a separate new item?`,
          icon: "question",
          showDenyButton: true,
          showCancelButton: true,
          confirmButtonText: "Use Existing Model",
          denyButtonText: "Create New",
          cancelButtonText: "Skip",
        });
        if (choice.isConfirmed) {
          updated = updated.map((p) => (p.productName === r.productName ? { ...p, itemVariantId: r.itemVariantId } : p));
        } else if (choice.isDenied) {
          const product = updated.find((p) => p.productName === r.productName);
          const itemVariantId = await promptAddProduct(product);
          if (itemVariantId) {
            updated = updated.map((p) => (p.productName === r.productName ? { ...p, itemVariantId } : p));
          }
        }
        continue;
      }

      const confirm = await Swal.fire({
        title: "Product not in inventory",
        text: `This product ("${r.productName}") is not available in your inventory. Would you like to add it now?`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Add Product",
        cancelButtonText: "Cancel",
      });
      if (!confirm.isConfirmed) continue;
      const product = updated.find((p) => p.productName === r.productName);
      const itemVariantId = await promptAddProduct(product);
      if (itemVariantId) {
        updated = updated.map((p) => (p.productName === r.productName ? { ...p, itemVariantId } : p));
      }
    }
    return updated;
  };

  const handleSave = async () => {
    if (!pdfFilename) {
      Swal.fire("Extract first", "Please upload and extract a contract before saving.", "warning");
      return;
    }
    if (!form.contractNumber?.trim()) {
      Swal.fire("Contract Number required", "Please enter a unique Contract Number.", "warning");
      return;
    }
    if (numberExists) {
      Swal.fire("Already exists", numberExistsMessage || "A contract with this Contract Number already exists.", "error");
      return;
    }
    const invalidProducts = products.filter((p) => isInvalidHsn(p.hsnCode));
    if (invalidProducts.length > 0) {
      Swal.fire(
        "HSN Code required",
        `Please enter a valid HSN Code for: ${invalidProducts.map((p) => p.productName || "Unnamed product").join(", ")}. "HSN not specified by seller" is not a usable code.`,
        "warning"
      );
      return;
    }
    setSaving(true);
    try {
      const saveRes = await contractsService.saveContract({ ...form, products: JSON.stringify(products), pdfFilename, tokenUsage });

      const linkedProducts = await runInventoryValidation(products);
      if (saveRes?.guid && linkedProducts.some((p, i) => p.itemVariantId && p.itemVariantId !== products[i]?.itemVariantId)) {
        await contractsService.updateContract(saveRes.guid, { products: JSON.stringify(linkedProducts) });
      }

      Swal.fire("Saved", "Contract saved successfully.", "success");
      setForm(EMPTY_FORM);
      setProducts([]);
      setFile(null);
      setPdfFilename(null);
      setExtractedFlag(false);
      setContractNumber("");
      setNumberExists(false);
      router.push("/contracts");
    } catch (error) {
      console.error("Save contract failed:", error);
      const message = error?.response?.data?.message || "Failed to save contract";
      if (message.toLowerCase().includes("already exists")) setNumberExists(true);
      Swal.fire("Error", message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3.5 rounded-2xl shadow-md shadow-indigo-100 text-white">
          <FileText size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Upload Contract</h2>
          <p className="text-slate-500 font-medium text-sm mt-0.5">
            Enter a unique contract number, upload the document, and let AI extract the details.
          </p>
        </div>
      </div>

      {/* Step 1 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0">1</span>
        <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide">Contract Number &amp; File</h3>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,320px)_1fr] gap-6 items-start">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              <Hash size={12} /> Contract Number (unique)
            </label>
            <div className="relative">
              <input
                type="text"
                value={contractNumber}
                onChange={(e) => { setContractNumber(e.target.value); setNumberExists(false); setNumberExistsMessage(""); setPdfContractNumber(null); }}
                onBlur={handleContractNumberBlur}
                placeholder="Enter a unique Contract Number"
                className={`w-full bg-white border rounded-xl px-3 py-2.5 pr-9 text-sm font-medium outline-none focus:ring-2 transition-all ${
                  numberExists ? "border-rose-400 focus:ring-rose-100" : "border-slate-200 focus:ring-indigo-100"
                }`}
              />
              {checkingNumber && <Loader2 className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />}
              {!checkingNumber && contractNumber && !numberExists && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" size={16} />
              )}
            </div>
            {!checkingNumber && numberExists && (
              <p className="text-xs font-bold text-rose-600 mt-1.5 flex items-center gap-1">{numberExistsMessage}</p>
            )}
            {pdfContractNumber && (
              <p className="text-xs font-bold text-rose-600 mt-1.5">
                You entered the wrong Contract Number. The actual Contract Number inside this document is{" "}
                <span className="font-black">{pdfContractNumber}</span>.
              </p>
            )}
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              <UploadCloud size={12} /> Contract File (PDF / Image)
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={handleFileChange}
                className="flex-1 min-w-0 text-sm text-slate-600 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:bg-indigo-600 file:text-white file:font-bold file:text-sm hover:file:bg-indigo-700 cursor-pointer transition-colors"
              />
              <button
                onClick={handleExtract}
                disabled={extracting || !file || numberExists}
                className="shrink-0 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-indigo-100 transition-all w-full sm:w-auto justify-center"
              >
                {extracting ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                {extracting ? "Extracting..." : "Extract with AI"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {extracted && (
        <div className="w-full animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0">2</span>
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide">Extracted Contract Information</h3>
            <span className="text-xs text-slate-400 font-medium">— review &amp; edit before saving</span>
            {tokenUsage && (
              <span
                title={`Prompt: ${tokenUsage.promptTokens} · Completion: ${tokenUsage.completionTokens}`}
                className="ml-auto text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-1"
              >
                AI tokens used: {tokenUsage.totalTokens.toLocaleString("en-IN")}
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-black text-slate-500 uppercase tracking-wider w-1/4">Parameter</th>
                  <th className="px-4 py-3 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Value</th>
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((section) => (
                  <React.Fragment key={section.title}>
                    <SectionHeaderRow title={section.title} />
                    {section.fields.map((f) => {
                      rowIndex += 1;
                      return (
                        <FieldRow
                          key={f.key}
                          label={f.label}
                          type={f.type}
                          readOnly={f.readOnly}
                          zebra={rowIndex % 2 === 0}
                          value={form[f.key]}
                          onChange={(v) => handleFieldChange(f.key, v)}
                        />
                      );
                    })}
                  </React.Fragment>
                ))}

                {/* Products nested table */}
                <SectionHeaderRow title="Products" />
                <tr className="bg-white">
                  <td colSpan={2} className="p-4">
                    <div className="flex items-center justify-end mb-2">
                      <button onClick={addProductRow} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                        <Plus size={14} /> Add Row
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-left border-collapse text-xs table-fixed">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200">
                            <th className="p-1.5 font-black text-slate-500 uppercase w-[16%]">Product Name</th>
                            <th className="p-1.5 font-black text-slate-500 uppercase w-[8%]">Brand</th>
                            <th className="p-1.5 font-black text-slate-500 uppercase w-[14%]">Model</th>
                            <th className="p-1.5 font-black text-slate-500 uppercase w-[14%]">Category &amp; Quadrant</th>
                            <th className="p-1.5 font-black text-slate-500 uppercase w-[12%]">HSN Code</th>
                            <th className="p-1.5 font-black text-slate-500 uppercase w-[9%]">Qty</th>
                            <th className="p-1.5 font-black text-slate-500 uppercase w-[10%]">Unit Price</th>
                            <th className="p-1.5 font-black text-slate-500 uppercase w-[11%]">Total Value</th>
                            <th className="p-1.5 w-[6%]"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {products.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="p-6 text-center text-slate-400 text-sm">No products yet — extract a contract or add a row manually</td>
                            </tr>
                          ) : (
                            products.map((p, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                {["productName", "brand", "model", "categoryQuadrant", "hsnCode"].map((key) => (
                                  <td key={key} className="p-1">
                                    <input
                                      value={p[key] || ""}
                                      onChange={(e) => handleProductChange(idx, key, e.target.value)}
                                      title={key === "hsnCode" && isInvalidHsn(p[key]) ? "Enter a valid HSN Code before saving" : p[key] || ""}
                                      className={`w-full bg-white border rounded-lg px-1.5 py-1 text-xs outline-none focus:ring-2 transition-all ${
                                        key === "hsnCode" && isInvalidHsn(p[key])
                                          ? "border-rose-400 focus:ring-rose-100 bg-rose-50"
                                          : "border-slate-200 focus:ring-indigo-100"
                                      }`}
                                    />
                                  </td>
                                ))}
                                {["quantity", "unitPrice", "totalValue"].map((key) => (
                                  <td key={key} className="p-1">
                                    <input
                                      type="number"
                                      value={p[key] ?? ""}
                                      onChange={(e) => handleProductChange(idx, key, e.target.value)}
                                      className="w-full bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
                                    />
                                  </td>
                                ))}
                                <td className="p-1 text-center">
                                  <button onClick={() => removeProductRow(idx)} className="p-1.5 text-rose-500 hover:text-white hover:bg-rose-500 rounded-lg transition-colors">
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {products.length > 0 && (
                          <tfoot>
                            <tr className="bg-emerald-50 border-t-2 border-emerald-100">
                              <td colSpan={7} className="p-3 text-right font-black text-slate-600 uppercase text-xs tracking-wide">Total Order Value</td>
                              <td className="p-3 font-black text-emerald-700">
                                ₹{totalOrderValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </td>
                </tr>

                <SectionHeaderRow title="Consignee &amp; Delivery" />
                {FIELDS_AFTER_PRODUCTS.map((f, i) => (
                  <FieldRow key={f.key} label={f.label} type={f.type} zebra={i % 2 === 1} value={form[f.key]} onChange={(v) => handleFieldChange(f.key, v)} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 mt-5">
            <button
              onClick={handleSave}
              disabled={saving || !pdfFilename}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-emerald-100 transition-all"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {saving ? "Saving..." : "Save Contract"}
            </button>
          </div>
        </div>
      )}

      {wizardProduct && (
        <AddProductWizard product={wizardProduct} onClose={handleWizardClose} onLinked={handleWizardLinked} />
      )}
    </div>
  );
}
