import "@/lib/pdfPolyfills";
import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { callOpenAIContract, callOpenAIVisionContract, checkOpenAIKey } from "@/lib/aiParse";
import { saveUploadedFile } from "@/lib/upload";
import { withErrorHandling } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);

  if (!checkOpenAIKey()) throw new ApiError(503, "OpenAI API key not configured. Add OPENAI_API_KEY to .env");

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "No file uploaded");

  const mimeType = file.type;
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > 15 * 1024 * 1024) throw new ApiError(413, "File too large (max 15 MB)");

  let extracted;
  try {
    if (mimeType === "application/pdf") {
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      await parser.destroy();
      const text = (pdfData.text || "").trim();
      if (!text) throw new ApiError(422, "Could not extract text from PDF — it may be a scanned image PDF. Try uploading as JPG/PNG.");
      extracted = await callOpenAIContract(text);
    } else if (mimeType.startsWith("image/")) {
      const base64 = buffer.toString("base64");
      extracted = await callOpenAIVisionContract(base64, mimeType);
    } else {
      throw new ApiError(400, "Unsupported file type. Upload a PDF or image (JPG, PNG, WebP).");
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("[ai] contracts/parse error:", err.stack || err.message);
    throw new ApiError(500, err.message || "AI contract parsing failed");
  }

  const saved = await saveUploadedFile(file, { prefix: "contract" });

  return NextResponse.json({ extracted, pdfFilename: saved.filename });
});
