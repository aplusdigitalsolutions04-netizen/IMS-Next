import { NextResponse } from "next/server";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { callOpenAI, checkOpenAIKey } from "@/lib/aiParse";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);

  if (!(await checkOpenAIKey())) throw new ApiError(503, "OpenAI API key not configured. Add it under Settings → AI Settings.");
  const { text } = await parseJsonBody(request);
  if (!text?.trim()) throw new ApiError(400, "No text provided");

  try {
    const { data } = await callOpenAI(text.trim(), { source: "parse-order", user });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[ai] parse-order error:", err.message);
    throw new ApiError(500, err.message || "AI parsing failed");
  }
});
