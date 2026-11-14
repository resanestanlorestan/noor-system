import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

// A non-PostgreSQL URL (e.g. a SQLite "file:..." value inherited from the host
// environment) would make pg connect without a username and fail at connect
// time with SQLSTATE 28000 ("role <os-user> does not exist"). Fail fast with
// an actionable message instead. next.config.ts already restores the project
// .env value in that situation; this guard covers any other entry point.
if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  throw new Error(
    `DATABASE_URL must be a PostgreSQL connection string (postgres://... or postgresql://...), got: "${databaseUrl.slice(0, 32)}". Check .env and remove any non-PostgreSQL DATABASE_URL inherited from the host environment.`,
  );
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
