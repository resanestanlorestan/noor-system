#!/usr/bin/env node
// One-off demo data preparation for the reminder feature (dev database):
//  - gives demo staff accounts mobile numbers
//  - backdates one pending case so the /reminders page has a live example
// Safe to re-run: updates are idempotent.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
for (const line of existsSync(envPath) ? readFileSync(envPath, "utf8").split(/\r?\n/) : []) {
  const m = line.match(/^\s*(?:export\s)?([A-Z_]+)\s*=\s*(.+?)\s*$/);
  if (m && !line.trim().startsWith("#") && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const phones = {
  "admin@noor.local": "09121110001",
  "reviewer@noor.local": "09121110002",
  "specialist@noor.local": "09121110003",
  "province@noor.local": "09121110004",
  "county@noor.local": "09121110005",
};
try {
  for (const [email, phone] of Object.entries(phones)) {
    const r = await pool.query("update app_users set phone = $2 where email = $1 and phone is null", [email, phone]);
    if (r.rowCount) console.log(`phone ${phone} → ${email}`);
  }
  // Backdate the oldest pending case (20 days) so the reminders page demos live.
  const pending = await pool.query(
    "select a.id, q.first_name || ' ' || q.last_name as name from applications a join quranic_activists q on q.id = a.activist_id where a.status = 'pending' order by a.updated_at asc limit 1"
  );
  if (pending.rows.length) {
    const upd = await pool.query(
      "update applications set updated_at = now() - interval '20 days', created_at = least(created_at, now() - interval '20 days') where id = $1",
      [pending.rows[0].id]
    );
    if (upd.rowCount) console.log(`backdated case ${pending.rows[0].name}: 20 days`);
  } else console.log("no pending case found");
  const check = await pool.query(
    "select count(*)::int as overdue from applications where status in ('pending','specialist_review') and updated_at < now() - interval '14 days'"
  );
  console.log(`overdue cases now: ${check.rows[0].overdue}`);
} finally { await pool.end(); }
