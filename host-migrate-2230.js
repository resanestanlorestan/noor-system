// الحاقیهٔ ۲.۲۳.۰ — اجرای Idempotent مایگریشن 0030 روی پایگاه دادهٔ هاست.
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
    const sql = fs.readFileSync(path.join(__dirname, "drizzle", "0030-form-builder.sql"), "utf8");
    const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) await client.query(statement);
    const check = await client.query("select to_regclass('public.form_definitions') as defs, to_regclass('public.form_definition_versions') as versions, to_regclass('public.form_answers') as answers, (select count(*) from information_schema.columns where table_name='quranic_specialties' and column_name in ('active','description','sort_order')) as specialty_columns, (select count(*) from role_permissions where permission_key='forms.manage') as grants");
    const row = check.rows[0];
    const ok = row.defs && row.versions && row.answers && Number(row.specialty_columns) === 3 && Number(row.grants) >= 1;
    console.log(JSON.stringify({ ok: Boolean(ok), defs: row.defs, versions: row.versions, answers: row.answers, specialty_columns: Number(row.specialty_columns), grants: Number(row.grants) }));
    if (!ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error.message || error).slice(0, 200) }));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})().catch((error) => { console.error(JSON.stringify({ ok: false, error: String(error.message || error).slice(0, 200) })); process.exit(1); });
