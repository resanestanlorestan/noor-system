/** بررسی ردیف‌های باقیماندهٔ کد ملی 4060135275 در دیتابیس (فقط خواندنی) */
import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const queries = {
  activists: `
    SELECT a.id, a.user_id, a.deleted_at, a.deleted_by, a.first_name, a.last_name,
           a.father_name, a.national_id_last4, a.phone, a.created_at
    FROM activists a WHERE a.national_id_last4 = '5275'`,
  applications: `
    SELECT app.id, app.activist_id, app.deleted_at, app.status, app.created_by, app.source, app.created_at
    FROM applications app
    JOIN activists a ON a.id = app.activist_id
    WHERE a.national_id_last4 = '5275'`,
  users: `
    SELECT u.id, u.username, u.deleted_at, u.role
    FROM users u
    JOIN activists a ON a.user_id = u.id
    WHERE a.national_id_last4 = '5275'`,
  duplicatesOfHash: `
    SELECT national_id_hash, count(*) AS cnt,
           count(*) FILTER (WHERE deleted_at IS NULL) AS active_cnt
    FROM activists WHERE national_id_last4 = '5275'
    GROUP BY national_id_hash`,
};

try {
  for (const [name, sql] of Object.entries(queries)) {
    const res = await pool.query(sql);
    console.log(`\n===== ${name} (${res.rowCount} rows) =====`);
    console.log(JSON.stringify(res.rows, null, 2));
  }
} finally {
  await pool.end();
}
