import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimiter";

// Next.js 16 renamed `middleware.js` to `proxy.js` (the `middleware` file
// convention is deprecated) — Proxy always runs on the Node.js runtime
// (not configurable), which this rate limiter depends on: its in-memory
// bucket store (lib/rateLimiter.js) needs to run in the same process model
// the rest of the app does, not an isolated edge runtime.
export async function proxy(request) {
  const { pathname } = new URL(request.url);

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

  const result = await checkRateLimit(pathname, ip);
  if (!result) return NextResponse.next();

  const headers = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };

  if (result.blocked) {
    const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { message: "Too many requests — please slow down and try again shortly." },
      { status: 429, headers: { ...headers, "Retry-After": String(retryAfterSec) } }
    );
  }

  const response = NextResponse.next();
  Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
