// Vitest global setup: points the suite at a dedicated test database cloned
// from noor_dev (schema + seed) before any module imports @/db.
import { Client } from "pg";

export default async function globalSetup(): Promise<(() => Promise<void>) | void> {
  const base = process.env.NOOR_BASE_URL || "postgresql://noor:noor_dev_2026@127.0.0.1:5432/noor_dev";
  const admin = new Client({ connectionString: base });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS noor_test");
  await admin.query("CREATE DATABASE noor_test TEMPLATE noor_dev");
  await admin.end();
  process.env.DATABASE_URL = "postgresql://noor:noor_dev_2026@127.0.0.1:5432/noor_test";
  process.env.NOOR_DATA_DIR = "/tmp/noor-test-private";
}
