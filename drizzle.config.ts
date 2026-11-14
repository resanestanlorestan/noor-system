import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Reads DATABASE_URL from .env (or the environment) so real credentials
// never need to be committed to Git.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set; copy .env.example to .env and configure it.");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url: process.env.DATABASE_URL },
});
