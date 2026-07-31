"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Sparkles, Save, Plus, Trash2, UploadCloud, Hash, CheckCircle2 } from "lucide-react";
import Swal from "sweetalert2";
import { contractsService } from "@/lib/services/contractsService";
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
];

const ALL_FIELDS = [...SECTIONS.flatMap((s) => s.fields), ...FIELDS_AFTER_PRODUCTS];
const EMPTY_FORM = ALL_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: "" }), {});

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
  const [pdfContractNumber, setPdfContractNumber] = useState(null);
  const [wizardProduct, setWizardProduct] = useState(null);
  const wizardResolveRef = React.useRef(null);

  let rowIndex = 0;

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
  };

  const handleContractNumberBlur = async () => {
    if (!contractNumber.trim()) {
      setNumberExists(false);
      return;
    }
    setCheckingNumber(true);
    try {
      const exists = await contractsService.checkContractNumberExists(contractNumber);
      setNumberExists(exists);
    } finally {
      setCheckingNumber(false);
    }
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
    if (numberExists) {
      Swal.fire("Already exists", "A contract with this Contract Number already exists.", "error");
      return;
    }
    setExtracting(true);
    try {
      const { extracted: extractedData, pdfFilename: savedFilename } = await contractsService.parseContractFile(file);
      const { products: extractedProducts, contractNumber: extractedContractNumber, ...rest } = extractedData || {};
      setForm({ ...EMPTY_FORM, ...rest, contractNumber: contractNumber.trim() });
      setProducts(Array.isArray(extractedProducts) ? extractedProducts.map((p) => ({ ...EMPTY_PRODUCT, ...p })) : []);
      setPdfFilename(savedFilename);
      setExtractedFlag(true);

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
          setContractNumber(extractedContractNumber);
          setForm((prev) => ({ ...prev, contractNumber: extractedContractNumber }));
          setPdfContractNumber(null);
          setCheckingNumber(true);
          try {
            const exists = await contractsService.checkContractNumberExists(extractedContractNumber);
            setNumberExists(exists);
          } finally {
            setCheckingNumber(false);
          }
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
  // Item Master and, for anything missing, asks whether to add it now via
  // the wizard. Returns the product list with itemVariantId filled in for
  // whatever got linked, so the contract can be updated with the links.
  const runInventoryValidation = async (savedProducts) => {
    const names = savedProducts.map((p) => p.productName).filter(Boolean);
    if (names.length === 0) return savedProducts;
    let results = [];
    try {
      results = await contractsService.checkProductsInInventory(names);
    } catch (err) {
      console.error("Inventory check failed:", err);
      return savedProducts;
    }

    let updated = [...savedProducts];
    for (const r of results) {
      if (r.exists) continue;
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
      Swal.fire("Already exists", "A contract with this Contract Number already exists.", "error");
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
      const saveRes = await contractsService.saveContract({ ...form, products: JSON.stringify(products), pdfFilename });

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
                onChange={(e) => { setContractNumber(e.target.value); setNumberExists(false); setPdfContractNumber(null); }}
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
              <p className="text-xs font-bold text-rose-600 mt-1.5 flex items-center gap-1">This Contract Number already exists</p>
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
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0">2</span>
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide">Extracted Contract Information</h3>
            <span className="text-xs text-slate-400 font-medium">— review &amp; edit before saving</span>
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
