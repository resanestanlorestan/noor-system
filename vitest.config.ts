import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Feature tests share ONE PostgreSQL database (noor_feature) and the same
    // seeded users: a parallel file would truncate workflow tables (resetCaseData)
    // while another file is mid-test, producing duplicate-key races on
    // quranic_activists.user_id. Files must run one at a time — deterministic
    // locally and in CI alike.
    fileParallelism: false,
    // یک لنگِ لحظه‌ای زیرساختی نباید کل فایل آزمون را بکشد؛ سقف پیش‌فرض ۵
    // ثانیه‌ای vitest برای آزمون‌های feature روی دیتابیس واقعیِ شلوغ کم است.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
