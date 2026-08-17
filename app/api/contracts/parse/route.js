import { NextResponse } from "next/server";
import { getDocumentProxy, extractText } from "unpdf";
import { authenticateRequest, requireAuth, requirePermission, hasAllCompaniesAccess, ApiError } from "@/lib/auth";
import { callOpenAIContract, callOpenAIVisionContract, checkOpenAIKey } from "@/lib/aiParse";
import { saveUploadedFile, getCompanyName } from "@/lib/upload";
import { withErrorHandling } from "@/lib/apiResponse";
import { mysqlPool } from "@/lib/db";
import { isSameCompany } from "@/lib/companyMatch";

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requirePermission(user, "contracts", "You do not have permission to access contracts.");

  if (!(await checkOpenAIKey())) throw new ApiError(503, "OpenAI API key not configured. Add it under Settings → AI Settings.");

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");

  const mimeType = file.type;
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > 15 * 1024 * 1024) throw new ApiError(413, "File too large (max 15 MB)");

  const meta = { source: "contracts-parse", user };
  let extracted;
  let tokenUsage = null;
  try {
    if (mimeType === "application/pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text: rawText } = await extractText(pdf, { mergePages: true });
      const text = (rawText || "").trim();
      if (!text) throw new ApiError(422, "Could not extract text from PDF — it may be a scanned image PDF. Try uploading as JPG/PNG.");
      ({ data: extracted, usage: tokenUsage } = await callOpenAIContract(text, meta));
    } else if (mimeType.startsWith("image/")) {
      const base64 = buffer.toString("base64");
      ({ data: extracted, usage: tokenUsage } = await callOpenAIVisionContract(base64, mimeType, meta));
    } else {
      throw new ApiError(400, "Unsupported file type. Upload a PDF or image (JPG, PNG, WebP).");
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("[ai] contracts/parse error:", err.stack || err.message);
    throw new ApiError(500, err.message || "AI contract parsing failed");
  }

  const companyName = await getCompanyName(user.companyId);
  const saved = await saveUploadedFile(file, { prefix: "contract", folder: "contract", companyName });

  // ContractUpload.jsx's checkSellerCompanyMatch already warns when the
  // extracted seller doesn't match any company the CURRENT user has access
  // to (via its own `availableCompanies` list) — but that can't tell "this
  // company doesn't exist in the system at all" apart from "it exists, you
  // just don't have access to it", since a user's available-companies list
  // is scoped to them. This does the same GSTIN/name match against every
  // active company in the system, and — only when it finds one the user
  // themselves lacks access to — flags it, so the frontend can show "you
  // don't have permission for this company" instead of the generic
  // "unknown seller" message (which would otherwise wrongly invite an
  // Admin to create a company that already exists).
  let companyMatch = null;
  const sellerGstin = extracted?.sellerGstin;
  const sellerCompany = extracted?.sellerCompany;
  if (sellerGstin || sellerCompany) {
    const [allCompanies] = await mysqlPool.query("SELECT guid, name, gstNumber FROM companies WHERE isActive = 1");
    const matched = allCompanies.find((c) => isSameCompany(sellerCompany, sellerGstin, c));
    if (matched) {
      let userHasAccess = hasAllCompaniesAccess(user);
      if (!userHasAccess) {
        const [rows] = await mysqlPool.query(
          "SELECT 1 FROM user_companies WHERE userGuid = ? AND companyGuid = ? LIMIT 1",
          [user.id, matched.guid]
        );
        userHasAccess = rows.length > 0;
      }
      companyMatch = { companyGuid: matched.guid, companyName: matched.name, userHasAccess };
    }
  }

  return NextResponse.json({ extracted, pdfFilename: saved.filename, companyMatch, tokenUsage });
});
