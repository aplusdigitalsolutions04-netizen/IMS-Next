import { NextResponse } from "next/server";
import { authenticateRequest, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { getOpenAIKeyRow, saveOpenAIKey } from "@/lib/aiParse";

// The raw key is never sent back to the browser once saved — only a masked
// preview (last 4 chars) plus where it's coming from, so the UI can show
// "configured" without the key round-tripping through the client after the
// first save.
const mask = (key) => (key ? `${"•".repeat(Math.max(key.length - 4, 4))}${key.slice(-4)}` : null);

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "aiSettings", "Only Admin can manage AI settings.");

  const row = await getOpenAIKeyRow();
  const envKey = process.env.OPENAI_API_KEY;
  const hasDbKey = !!row?.apiKey;
  const hasEnvKey = !!envKey && envKey !== "REPLACE_WITH_NEW_KEY";

  return NextResponse.json({
    configured: hasDbKey || hasEnvKey,
    source: hasDbKey ? "database" : hasEnvKey ? "env" : null,
    maskedKey: mask(hasDbKey ? row.apiKey : envKey),
    updatedBy: row?.updatedBy || null,
    updatedAt: row?.updatedAt || null,
  });
});

export const PUT = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "aiSettings", "Only Admin can manage AI settings.");

  const { apiKey } = await parseJsonBody(request);
  const trimmed = String(apiKey || "").trim();
  if (!trimmed) throw new ApiError(400, "API key is required.");

  await saveOpenAIKey(trimmed, user.username || user.fullName || "Unknown");
  return NextResponse.json({ message: "OpenAI API key saved" });
});
