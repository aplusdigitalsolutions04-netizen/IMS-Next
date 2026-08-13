const EXTRACTION_PROMPT = `You are an order-data extractor for an Indian inventory system.
Extract the following fields from the provided order text/document and return ONLY a valid JSON object.
If a field is not found, return null for that field.

Fields to extract:
- platform: one of "GeM", "Amazon", "Flipkart", "Other" (guess from context)
- orderId: Order ID / customer name / GeM order number (the main identifier)
- gemOrderType: one of "Direct Order", "Bid", "PBP" (default "Direct Order")
- gemBidNo: Bid number / contract number / GeM order number
- gemOrderDate: Order date in YYYY-MM-DD format
- gemLastDate: Last delivery date / supply date in YYYY-MM-DD format
- gemAddress: Consignee / delivery / shipping address (full multi-line is fine)
- gemBuyerAddress: Buyer address if different from shipping
- consigneeName: Consignee / delivery person / organization name
- gemGst: GST number of buyer/consignee
- gemContact: Contact / phone number
- gemAltContact: Alternate contact number
- gemBuyerEmail: Buyer email
- gemConsigneeEmail: Consignee email
- paymentAuthorityEmail: Payment authority email
- invoiceNo: Invoice number
- invoiceDate: Invoice date in YYYY-MM-DD format
- invoiceGst: Seller GST number
- ewayBillNumber: E-Way Bill number (usually a 12-digit number, may be labeled "E-Way Bill No." or "EWB No.")
- warranty: Warranty period e.g. "1 Year", "3 Years"
- modelName: Product model name / part number
- companyName: Manufacturer / brand name (e.g. HP, Dell, Canon)
- sellingPrice: Unit price as a number (no currency symbol)
- quantity: Quantity as a number

Return ONLY JSON, no markdown, no explanation.`;

const CONTRACT_EXTRACTION_PROMPT = `You are a contract-data extractor for an Indian government procurement (GeM) contract document.
Extract the following fields from the provided contract text/document and return ONLY a valid JSON object.
If a field is not found, return null for that field. Dates must be in YYYY-MM-DD format.

Fields to extract:
- bidNumber: Bid Number
- contractNumber: Contract Number / GeM Contract No.
- generatedDate: Contract Generated Date
- buyerContact: Buyer's contact / phone number
- products: An ARRAY of product line-item objects (one per product/row in the contract's product table), each with:
  - productName: Full product name / description
  - brand: Brand name
  - model: Model name / number
  - categoryQuadrant: Category & Quadrant (e.g. "A4 and Legal Size Multifunction Printer (MFP) (Q2)")
  - hsnCode: HSN code (or "HSN not specified by seller" if absent)
  - quantity: Ordered quantity as a number
  - unitPrice: Unit price as a number (no currency symbol)
  - totalValue: Total value for this line as a number (quantity * unitPrice if not explicitly stated)
  Return [] if no products are found.
- buyerEmail: Buyer's email address
- buyerGstin: Buyer's GSTIN
- buyerAddress: Buyer's full address
- deliveryStartAfter: Delivery Start After date
- deliveryCompletedBy: Delivery To Be Completed By date
- deliveryInstructions: Delivery Instructions / special instructions to the seller for delivery (free text, if present)
- ministry: Ministry name
- department: Department name
- organisation: Organisation name
- officeZone: Office Zone
- sellerCompany: Seller / Consignor company name
- sellerContact: Seller's contact / phone number
- sellerGstin: Seller's GSTIN
- consigneeDesignation: Consignee's designation
- consigneeEmail: Consignee's email address
- consigneeContact: Consignee's contact / phone number
- consigneeAddress: Consignee's full address

Return ONLY JSON, no markdown, no explanation.`;

async function openAiRequest(body) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body,
  });
  const parsed = await res.json();
  if (parsed.error) throw new Error(parsed.error.message);
  const content = parsed.choices?.[0]?.message?.content || "{}";
  const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error("Failed to parse OpenAI response: " + e.message);
  }
}

export function callOpenAI(userText) {
  const body = JSON.stringify({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: userText },
    ],
  });
  return openAiRequest(body);
}

export function callOpenAIVision(base64, mimeType) {
  const body = JSON.stringify({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: EXTRACTION_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
        ],
      },
    ],
  });
  return openAiRequest(body);
}

export function callOpenAIContract(userText) {
  const body = JSON.stringify({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: CONTRACT_EXTRACTION_PROMPT },
      { role: "user", content: userText },
    ],
  });
  return openAiRequest(body);
}

export function callOpenAIVisionContract(base64, mimeType) {
  const body = JSON.stringify({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: CONTRACT_EXTRACTION_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
        ],
      },
    ],
  });
  return openAiRequest(body);
}

export function checkOpenAIKey() {
  return process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "REPLACE_WITH_NEW_KEY";
}
