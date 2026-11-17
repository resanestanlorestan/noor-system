// چرخش رازها روی هاست — الحاقیهٔ ۲.۱۸.۰ (ممیزی امنیتی ۲.۱۷.۱)
// مقدارهای تازه از متغیرهای محیطی می‌آیند و هرگز چاپ نمی‌شوند.
const fs = require("fs");
const { Client } = require("pg");
const ENV_PATH = "/home/epqoisdl/noor-system/.env";
const NEWPW = process.env.NEWPW;
const NEWS = process.env.NEWS;
if (!/^[a-f0-9]{32}$/.test(NEWPW || "") || !/^[a-f0-9]{48}$/.test(NEWS || "")) {
  console.error("ROTATE-FAILED: missing/invalid env values");
  process.exit(1);
}
(async () => {
  let env = fs.readFileSync(ENV_PATH, "utf8");
  const m = env.match(/^DATABASE_URL=(.*)$/m);
  if (!m) throw new Error("DATABASE_URL not found in .env");
  const url = m[1].trim().replace(/^["']|["']$/g, "");
  const u = new URL(url);
  const user = decodeURIComponent(u.username);
  const changed = [];
  // ۱) چرخش رمز نقش پایگاه داده — هر نقش مجاز است رمز خودش را عوض کند
  const c = new Client({
    host: u.hostname, port: Number(u.port || 5432), database: u.pathname.slice(1),
    user, password: decodeURIComponent(u.password),
  });
  await c.connect();
  await c.query(`ALTER ROLE ${user} WITH PASSWORD '${NEWPW}'`);
  await c.end();
  changed.push("pg-role-password");
  // ۲) به‌روزرسانی DATABASE_URL در .env با رمز تازه
  u.password = NEWPW;
  env = env.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${u.toString()}`);
  // ۳) چرخش CRON_SECRET
  env = env.replace(/^CRON_SECRET=.*$/m, `CRON_SECRET=${NEWS}`);
  fs.writeFileSync(ENV_PATH, env, { mode: 0o600 });
  changed.push("env:DATABASE_URL", "env:CRON_SECRET");
  console.log("ROTATED:", changed.join(","));
})().catch((e) => { console.error("ROTATE-FAILED:", e.message); process.exit(1); });
