import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgresql://noor:noor_dev_2026@127.0.0.1:5432/noor_test",
      NOOR_DATA_DIR: "/tmp/noor-test-private",
      NOOR_SMS_LOCAL: "1",
    },
    hookTimeout: 60000,
    testTimeout: 60000,
    pool: "forks",
    fileParallelism: false,
    sequence: { concurrent: false },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
