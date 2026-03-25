let sessionToken: string | null = null;

/**
 * Generate a hex token using the Web Crypto API (Edge Runtime compatible).
 */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Returns the current session token, generating one if it does not yet exist.
 * The token persists in memory for the lifetime of the server process.
 */
export function getSessionToken(): string {
  if (!sessionToken) {
    sessionToken = generateToken();
  }
  return sessionToken;
}

/**
 * Validates an incoming request against the session token.
 * Checks (in order):
 *   1. Authorization: Bearer <token> header
 *   2. x-clawjs-token header (legacy, kept for backward compatibility)
 *   3. __ot_token cookie
 */
export function validateRequest(req: Request): boolean {
  const token = getSessionToken();

  // Check Authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1] === token) {
      return true;
    }
  }

  // Check custom header
  const customHeader = req.headers.get("x-clawjs-token");
  if (customHeader === token) {
    return true;
  }

  // Check cookie
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      const [name, ...valueParts] = cookie.split("=");
      if (name.trim() === "__ot_token" && valueParts.join("=") === token) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Returns a 401 JSON response for unauthorized requests.
 */
export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized", message: "A valid session token is required." }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    },
  );
}

/**
 * Clones the given response and adds a Set-Cookie header
 * that stores the session token as an HttpOnly, SameSite=Strict cookie.
 */
export function setTokenCookie(response: Response): Response {
  const token = getSessionToken();
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
  newResponse.headers.append(
    "Set-Cookie",
    `__ot_token=${token}; HttpOnly; SameSite=Strict; Path=/`,
  );
  return newResponse;
}
