// Creates the dedicated feature-test database and applies all migrations.
// Usage: node scripts/setup-feature-db.js
const { Client } = require("pg");
const fs = require("node:fs");
const path = require("node:path");

const ADMIN = "postgresql://noor:noor_dev_2026@127.0.0.1:5432/postgres";
const DB = "noor_feature";

async function main() {
  const admin = new Client({ connectionString: ADMIN });
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = $1", [DB]);
  if (exists.rows.length) {
    // Recreate from scratch so the feature suite always starts from a clean schema+data state.
    await admin.query(`
      select pg_terminate_backend(pid) from pg_stat_activity
      where datname = $1 and pid <> pg_backend_pid()`, [DB]);
    await admin.query(`drop database if exists "${DB}"`);
    console.log(`dropped existing ${DB}`);
  }
  await admin.query(`create database "${DB}"`);
  await admin.end();
  console.log(`created ${DB}`);

  const db = new Client({ connectionString: `postgresql://noor:noor_dev_2026@127.0.0.1:5432/${DB}` });
  await db.connect();
  const dir = path.join(__dirname, "..", "drizzle");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) await db.query(statement);
    console.log(`applied ${file} (${statements.length} statements)`);
  }
  await db.end();
  console.log("feature database ready");
}

main().catch((error) => { console.error(error); process.exit(1); });
