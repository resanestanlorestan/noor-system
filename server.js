// server.js — cPanel/Passenger entry point for production deployments.
// Not used by `npm run dev` / `npm start`; only run directly (node server.js)
// or as the Application startup file in cPanel.
// See CPANEL-SETUP.md for the full deployment walkthrough.
//
// الحاقیهٔ ۲.۱۸.۳ — این ورودی حالا باندل استاندارد (.next/standalone/server.js)
// را بار می‌کند (چیدمان بستهٔ اسلیم) و کلیدهای حیاتی .env را روی env تزریقی
// میزبان تحمیل می‌کند (env تزریقی کهنه‌شده هرگز بازنویسی‌شان نمی‌کند).
// اگر standalone در دسترس نبود، به اجرای مستقیم Next برمی‌گردد.
process.env.NODE_ENV = "production";
const fs = require("fs");
const path = require("path");

// --- .env imposition -------------------------------------------------------
// Some hosts and sandboxes inject stale DATABASE_URL / CRON_SECRET /
// APP_ENCRYPTION_KEY values into the environment. Next.js env files never
// override variables already set in the environment, so we impose the
// project's own .env values here (same guard as next.config.ts).
(() => {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
})();

const standaloneEntry = path.join(__dirname, ".next", "standalone", "server.js");
if (fs.existsSync(standaloneEntry)) {
  process.chdir(path.dirname(standaloneEntry));
  require(standaloneEntry);
} else {
  const { createServer } = require("http");
  const next = require("next");

  const port = Number(process.env.PORT) || 3000; // Passenger injects PORT
  const app = next({ dev: false });
  const handle = app.getRequestHandler();

  app.prepare().then(() => {
    createServer((req, res) => handle(req, res)).listen(port, () => {
      console.log("Noor system ready on port " + port);
    });
  });
}
