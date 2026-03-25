import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js middleware for API route protection.
 *
 * For a local-first app running on localhost, the primary threat is
 * cross-origin requests from malicious websites (CSRF). We validate
 * the Origin header to ensure only requests from localhost are allowed.
 */
export function middleware(request: NextRequest) {
  // CSRF protection: if an Origin header is present, it must be localhost or 127.0.0.1
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const url = new URL(origin);
      const hostname = url.hostname;
      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        return new NextResponse(
          JSON.stringify({ error: "Forbidden", message: "Cross-origin requests are not allowed." }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    } catch {
      return new NextResponse(
        JSON.stringify({ error: "Forbidden", message: "Invalid Origin header." }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
