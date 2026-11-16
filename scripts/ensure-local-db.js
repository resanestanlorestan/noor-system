#!/usr/bin/env node
// Ensures the local portable postgres has the expected login role and the
// noor_dev / noor_feature databases. psql-free: the newer embedded-postgres
// package ships without native psql, so cluster setup uses node pg directly.
import pg from "pg";

const BASE = "postgresql://noor:noor_dev_2026@127.0.0.1:5432/postgres";
const DATABASES = ["noor_dev", "noor_feature"];

const pool = new pg.Pool({ connectionString: BASE, max: 1 });
try {
  for (const name of DATABASES) {
    const { rows } = await pool.query("select 1 from pg_database where datname = $1", [name]);
    if (!rows.length) {
      await pool.query(`create database ${name} owner noor`);
      console.log("created database:", name);
    } else {
      console.log("exists:", name);
    }
  }
} finally {
  await pool.end().catch(() => {});
}
