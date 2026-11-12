import { NextResponse, type NextRequest } from "next/server";

// Strict CSP: scripts are nonce-based ('strict-dynamic'), so 'unsafe-inline'
// is no longer needed for script-src. Next.js reads the CSP header set on the
// request and automatically adds the nonce to its bootstrap scripts.
//
// DEMO_EMBED=1 (sandbox preview only) relaxes framing so the platform's
// preview panel can show the app inside an iframe. Never enable it in
// production — keep clickjacking protection strict on real hosts.
const allowEmbed = process.env.DEMO_EMBED === "1";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${allowEmbed ? "*" : "'none'"}`,
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  // Skip static assets and health checks; dynamic pages get the nonce-based CSP.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|fonts|docs|api/health|.*\\.(?:png|jpg|jpeg|svg|ico|css|js|mjs|woff2?|ttf)$).*)"],
};
