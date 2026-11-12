#!/usr/bin/env node
// Applies drizzle/*.sql migrations in filename order without psql or drizzle-kit.
// Progress is tracked in the "noor_migrations" table, so it is safe to re-run.
// Usage:  node scripts/apply-migrations.mjs
// DATABASE_URL is read from the environment or from the project .env file.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();
  const envPath = path.join(root, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.+?)\s*$/);
      if (m && !line.trim().startsWith("#")) {
        return m[1].replace(/^["']|["']$/g, "").trim();
      }
    }
  }
  throw new Error("DATABASE_URL neither set in the environment nor present in .env");
}

const databaseUrl = findDatabaseUrl();
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(databaseUrl);
if (!isLocal && !/[?&]sslmode=/.test(databaseUrl)) {
  console.log("note: external database without sslmode — append sslmode=require");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
try {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS noor_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`
  );
  const { rows } = await pool.query("SELECT name FROM noor_migrations");
  const applied = new Set(rows.map((r) => r.name));

  const dir = path.join(root, "drizzle");
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
    : [];
  if (files.length === 0) {
    console.log("no migration files found in ./drizzle — nothing to do");
    process.exit(0);
  }

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Whole-file execution via the simple query protocol (multi-statement safe).
      await client.query(sql);
      await client.query("INSERT INTO noor_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log("applied:", file);
      ran += 1;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`migration ${file} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }
  console.log(
    ran === 0 ? "database already up to date." : `done: ${ran} migration(s) applied.`
  );
} finally {
  await pool.end().catch(() => {});
}
