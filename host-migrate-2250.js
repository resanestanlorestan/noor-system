// الحاقیهٔ ۲.۲۵.۰ — اجرای Idempotent مایگریشن 0031 روی پایگاه دادهٔ هاست.
// از ریشهٔ noor-system اجرا می‌شود: DATABASE_URL از .env خوانده و درایور pg
// از node_modules traced ران‌تایم استقلال بارگذاری می‌شود. خروجی JSON برای گیت استقرار.
const fs = require("fs");
const path = require("path");
let url = process.env.DATABASE_URL || "";
try {
  const env = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  const m = env.match(/^DATABASE_URL=(.*)$/m);
  if (m) url = m[1].trim().replace(/^["']|["']$/g, "");
} catch (error) { /* .env نبودن = تکیه بر متغیر محیطی */ }
if (!/^postgres(ql)?:\/\//i.test(url || "")) { console.error(JSON.stringify({ ok: false, error: "DATABASE_URL_INVALID" })); process.exit(2); }
let Client;
try { Client = require(path.join(__dirname, ".next/standalone/node_modules/pg")).Client; }
catch { Client = require("pg").Client; }
(async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, "drizzle", "0031-case-step-definitions.sql"), "utf8");
    const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) await client.query(statement);
    const check = await client.query("select to_regclass('public.case_step_definitions') as defs, (select count(*) from case_step_definitions where kind='system' and required=true and active=true) as system_steps, (select count(*) from case_step_definitions where code='review') as review_row, (select max(sort_order) from case_step_definitions) as max_sort");
    const row = check.rows[0];
    const ok = row.defs && Number(row.system_steps) === 5 && Number(row.review_row) === 1 && Number(row.max_sort) >= 50;
    console.log(JSON.stringify({ ok: Boolean(ok), defs: row.defs, system_steps: Number(row.system_steps), review_row: Number(row.review_row), max_sort: Number(row.max_sort) }));
    if (!ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error.message || error).slice(0, 200) }));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})().catch((error) => { console.error(JSON.stringify({ ok: false, error: String(error.message || error).slice(0, 200) })); process.exit(1); });
