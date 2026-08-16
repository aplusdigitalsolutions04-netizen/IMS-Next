import { mysqlPool } from "@/lib/db";

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

const MODEL = "gpt-4o-mini";

// Tables are created lazily on first use instead of via a one-off migration
// script — a manual "run this script against the live DB" step is exactly
// what caused the GeM-fields-missing-on-live incident earlier, so every new
// table this app adds from here on self-heals on whatever environment hits
// it first instead of depending on someone remembering a deploy step.
let tablesEnsured = false;
export async function ensureAiTables() {
  if (tablesEnsured) return;
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      id INT PRIMARY KEY AUTO_INCREMENT,
      apiKey VARCHAR(255) NOT NULL,
      updatedBy VARCHAR(150),
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS ai_usage_log (
      id INT PRIMARY KEY AUTO_INCREMENT,
      source VARCHAR(50) NOT NULL,
      model VARCHAR(50),
      promptTokens INT DEFAULT 0,
      completionTokens INT DEFAULT 0,
      totalTokens INT DEFAULT 0,
      username VARCHAR(150),
      companyGuid CHAR(36),
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ai_usage_createdAt (createdAt),
      INDEX idx_ai_usage_source (source)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tablesEnsured = true;
}

// Cached for 30s so every AI-parse request doesn't hit the DB just to read
// the key — same tradeoff as getAuthenticatedUser's user cache elsewhere in
// this codebase. Invalidated immediately on save (see saveOpenAIKey) so a
// key rotation takes effect on the very next request, not up to 30s later.
let keyCache = { value: undefined, expiresAt: 0 };

export async function getOpenAIKeyRow() {
  await ensureAiTables();
  const [[row]] = await mysqlPool.query("SELECT apiKey, updatedBy, updatedAt FROM ai_settings ORDER BY id DESC LIMIT 1");
  return row || null;
}

async function resolveOpenAIKey() {
  if (Date.now() < keyCache.expiresAt) return keyCache.value;
  const row = await getOpenAIKeyRow();
  const value = row?.apiKey || process.env.OPENAI_API_KEY || null;
  keyCache = { value, expiresAt: Date.now() + 30_000 };
  return value;
}

export async function saveOpenAIKey(apiKey, updatedBy) {
  await ensureAiTables();
  const [[existing]] = await mysqlPool.query("SELECT id FROM ai_settings ORDER BY id DESC LIMIT 1");
  if (existing) {
    await mysqlPool.query("UPDATE ai_settings SET apiKey=?, updatedBy=? WHERE id=?", [apiKey, updatedBy, existing.id]);
  } else {
    await mysqlPool.query("INSERT INTO ai_settings (apiKey, updatedBy) VALUES (?, ?)", [apiKey, updatedBy]);
  }
  keyCache = { value: undefined, expiresAt: 0 };
}

export async function checkOpenAIKey() {
  const key = await resolveOpenAIKey();
  return !!key && key !== "REPLACE_WITH_NEW_KEY";
}

// Fire-and-forget, same as lib/apiRequestLog.js's logApiRequest — a usage-log
// insert failing must never break the actual AI parse the user is waiting on.
async function logUsage({ source, model, usage, user }) {
  if (!usage) return;
  try {
    await ensureAiTables();
    await mysqlPool.query(
      `INSERT INTO ai_usage_log (source, model, promptTokens, completionTokens, totalTokens, username, companyGuid)
       VALUES (?,?,?,?,?,?,?)`,
      [source, model, usage.promptTokens || 0, usage.completionTokens || 0, usage.totalTokens || 0, user?.username || null, user?.companyId || null]
    );
  } catch (err) {
    console.error("[aiParse] Failed to record AI usage log:", err.message);
  }
}

// Returns { data, usage } — usage is OpenAI's token count for this single
// request (prompt/completion/total). meta ({ source, user }) identifies which
// page/feature made the call, for the Manage AI Settings usage log.
async function openAiRequest(body, meta = {}) {
  const apiKey = await resolveOpenAIKey();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });
  const parsed = await res.json();
  if (parsed.error) throw new Error(parsed.error.message);
  const content = parsed.choices?.[0]?.message?.content || "{}";
  const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const usage = parsed.usage
    ? {
        promptTokens: parsed.usage.prompt_tokens || 0,
        completionTokens: parsed.usage.completion_tokens || 0,
        totalTokens: parsed.usage.total_tokens || 0,
      }
    : null;

  logUsage({ source: meta.source || "unknown", model: MODEL, usage, user: meta.user });

  try {
    return { data: JSON.parse(cleaned), usage };
  } catch (e) {
    throw new Error("Failed to parse OpenAI response: " + e.message);
  }
}

export function callOpenAI(userText, meta) {
  const body = JSON.stringify({
    model: MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: userText },
    ],
  });
  return openAiRequest(body, meta);
}

export function callOpenAIVision(base64, mimeType, meta) {
  const body = JSON.stringify({
    model: MODEL,
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
  return openAiRequest(body, meta);
}

export function callOpenAIContract(userText, meta) {
  const body = JSON.stringify({
    model: MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: CONTRACT_EXTRACTION_PROMPT },
      { role: "user", content: userText },
    ],
  });
  return openAiRequest(body, meta);
}

export function callOpenAIVisionContract(base64, mimeType, meta) {
  const body = JSON.stringify({
    model: MODEL,
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
  return openAiRequest(body, meta);
}
