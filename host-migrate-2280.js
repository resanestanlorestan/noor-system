// الحاقیهٔ ۲.۲۸.۰ — اجرای Idempotent مایگریشن 0033 (جدول override پویای فیلد
// جزئیات تخصص‌های قرآنی) روی پایگاه دادهٔ هاست. از ریشهٔ noor-system اجرا
// می‌شود: DATABASE_URL از .env خوانده و درایور pg از node_modules traced
// ران‌تایم استقلال بارگذاری می‌شود. خروجی JSON برای گیت استقرار.
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
    const sql = fs.readFileSync(path.join(__dirname, "drizzle", "0033-specialty-detail-overrides.sql"), "utf8");
    const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) await client.query(statement);
    const check = await client.query("select to_regclass('public.specialty_detail_overrides') as tbl, (select count(*) from pg_indexes where tablename='specialty_detail_overrides' and indexname='specialty_detail_overrides_code_uq') as uniq_idx, (select count(*) from information_schema.columns where table_name='specialty_detail_overrides') as cols");
    const row = check.rows[0];
    // جدول باید با ۹ ستون و ایندکس یکتای code موجود باشد؛ جدول از ابتدا خالی است
    // (ردیف غایب = پیش‌فرض ثابت کد) — شمارش ردیف گیت نیست.
    const ok = row.tbl && Number(row.uniq_idx) === 1 && Number(row.cols) === 9;
    console.log(JSON.stringify({ ok: Boolean(ok), table: row.tbl, uniq_idx: Number(row.uniq_idx), cols: Number(row.cols) }));
    if (!ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error.message || error).slice(0, 200) }));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})().catch((error) => { console.error(JSON.stringify({ ok: false, error: String(error.message || error).slice(0, 200) })); process.exit(1); });
