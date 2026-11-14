import fs from "node:fs";
import type { NextConfig } from "next";

// --- DATABASE_URL guard -------------------------------------------------------
// Some hosts and sandboxes inject a placeholder DATABASE_URL (e.g. the SQLite
// "file:..." URL of a sibling template project) into the process environment
// before the app starts. Next.js env files never override variables that are
// already set in the environment, so the project's own .env silently loses —
// and pg then parses the foreign value, finds no username, and connects as the
// OS user (FATAL: role "<os-user>" does not exist, SQLSTATE 28000).
// Whenever the inherited DATABASE_URL is not a PostgreSQL connection string,
// restore the project .env value so local/dev starts are deterministic.
function isPostgresUrl(value: string | undefined): boolean {
  return /^postgres(ql)?:\/\//i.test(value ?? "");
}

if (!isPostgresUrl(process.env.DATABASE_URL)) {
  for (const candidate of ["./.env", process.cwd() + "/.env"]) {
    try {
      const raw = fs.readFileSync(candidate, "utf8");
      const match = raw.match(/^DATABASE_URL=(.*)$/m);
      const value = match?.[1]?.trim();
      if (isPostgresUrl(value)) {
        process.env.DATABASE_URL = value;
        break;
      }
    } catch {
      // .env not found at this candidate path — try the next one.
    }
  }
}

// Content-Security-Policy is served by src/middleware.ts with a per-request
// nonce (see that file); other security headers stay here.
// DEMO_EMBED=1 (sandbox preview only) omits X-Frame-Options so the preview
// panel iframe can render the app; framing is then governed by the CSP
// frame-ancestors directive in the middleware. Default stays strict (DENY).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  ...(process.env.DEMO_EMBED === "1" ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Standalone output: a slim self-contained bundle (.next/standalone with a
  // traced node_modules) for hosts with tight disk quotas (e.g. 500MB cPanel
  // plans where a full node_modules install does not fit).
  output: "standalone",
  // The platform preview proxy (and some CDNs/Apache setups) 301-redirects
  // "/dashboard" to "/dashboard/" while Next redirects slashed paths back
  // (308) — producing an infinite /dashboard <-> /dashboard/ loop that
  // browsers report as "The page isn't redirecting properly". Serving both
  // forms directly (no redirect) terminates any such external redirect chain.
  skipTrailingSlashRedirect: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
      // The sandbox/cPanel reverse-proxy chain rewrites Host and
      // X-Forwarded-Host to its own internal hostname, which trips Next's
      // Server-Actions CSRF check ("Invalid Server Actions request",
      // digest 3021563172) for legitimate visitors. Allow the preview
      // platform's subdomains (and local ports) as trusted origins.
      allowedOrigins: [
        "**.space-z.ai",
        "localhost:3000",
        "localhost:3100",
        // Production cPanel deployment (Server-Actions CSRF trusted origins)
        "pouyafarhadi.ir",
        "www.pouyafarhadi.ir",
      ],
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
