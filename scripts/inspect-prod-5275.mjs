/** اتصال فقط‌خواندنی به دیتابیس تولیدی با DATABASE_URL خوانده‌شده از /tmp/env-prod.txt.
 *  رشتهٔ اتصال هرگز چاپ نمی‌شود؛ فقط نتایج SELECT. */
import fs from "node:fs";
import { Pool } from "pg";

const envText = fs.readFileSync("/tmp/env-prod.txt", "utf8");
const m = envText.match(/^DATABASE_URL=(.*)$/m);
if (!m) {
  console.log("NO_DATABASE_URL_IN_ENV");
  process.exit(1);
}
const url = m[1].trim().replace(/^["']|["']$/g, "");

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 8000 });
try {
  const res = await pool.query(`
    SELECT a.id, a.user_id AS uid, a.deleted_at AS act_del, a.deleted_by AS del_by,
           a.first_name, a.last_name, a.father_name, a.phone
    FROM activists a WHERE a.national_id_last4 = '5275'`);
  console.log("===== activists (last4=5275):", res.rowCount);
  console.log(JSON.stringify(res.rows, null, 2));

  const apps = await pool.query(`
    SELECT app.id, app.activist_id, app.deleted_at AS app_del, app.status, app.source,
           app.created_by AS creator, app.created_at
    FROM applications app JOIN activists a ON a.id = app.activist_id
    WHERE a.national_id_last4 = '5275'`);
  console.log("===== applications:", apps.rowCount);
  console.log(JSON.stringify(apps.rows, null, 2));

  const idx = await pool.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'activists' AND indexname LIKE '%national%'`);
  console.log("===== indexes:");
  for (const r of idx.rows) console.log(r.indexname, "=>", r.indexdef);

  const total = await pool.query("SELECT count(*)::int AS n FROM activists");
  console.log("===== activists_total:", total.rows[0].n);
} catch (err) {
  console.log("CONNECT_OR_QUERY_FAILED:", err.code || "", err.message?.slice(0, 160));
} finally {
  await pool.end();
}
