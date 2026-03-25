import { getSessionToken, setTokenCookie } from "@/lib/api-auth";

/**
 * GET /api/auth/token
 *
 * Returns the session token for the current server process.
 * This endpoint is unauthenticated by design. It is intended to be called
 * only from the same machine (localhost) so the browser can obtain the
 * token and store it as a cookie for subsequent API requests.
 */
export async function GET() {
  const token = getSessionToken();
  const response = new Response(
    JSON.stringify({ token }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
  return setTokenCookie(response);
}
