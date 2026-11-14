// Points the suite at the pre-cloned noor_test database.
const TEST_URL = "postgresql://noor:noor_dev_2026@127.0.0.1:5432/noor_test";

export default function envSetup(): void {
  console.error("[env-setup] overriding DATABASE_URL (was:", process.env.DATABASE_URL, ")");
  
  process.env.DATABASE_URL = TEST_URL;
  process.env.NOOR_DATA_DIR = "/tmp/noor-test-private";
  process.env.NOOR_SMS_LOCAL = "1";
  console.error("[env-setup] now:", process.env.DATABASE_URL);
}
