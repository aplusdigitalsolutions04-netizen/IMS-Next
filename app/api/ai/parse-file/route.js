import "@/lib/pdfPolyfills";
import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { callOpenAI, callOpenAIVision, checkOpenAIKey } from "@/lib/aiParse";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);

  if (!checkOpenAIKey()) throw new ApiError(503, "OpenAI API key not configured. Add OPENAI_API_KEY to .env");
  const { fileBase64, mimeType } = await parseJsonBody(request);
  if (!fileBase64 || !mimeType) throw new ApiError(400, "fileBase64 and mimeType are required");

  let result;
  try {
    if (mimeType === "application/pdf") {
      const buffer = Buffer.from(fileBase64, "base64");
      if (buffer.length > 15 * 1024 * 1024) throw new ApiError(413, "File too large (max 15 MB)");
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      await parser.destroy();
      const text = (pdfData.text || "").trim();
      if (!text) throw new ApiError(422, "Could not extract text from PDF — it may be a scanned image PDF. Try uploading as JPG/PNG.");
      result = await callOpenAI(text);
    } else if (mimeType.startsWith("image/")) {
      result = await callOpenAIVision(fileBase64, mimeType);
    } else {
      throw new ApiError(400, "Unsupported file type. Upload a PDF or image (JPG, PNG, WebP).");
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("[ai] parse-file error:", err.stack || err.message);
    throw new ApiError(500, err.message || "AI file parsing failed");
  }

  return NextResponse.json(result);
});
