// Test environment: fixed encryption key so crypto helpers are deterministic
// across runs. Set before importing anything that reads the env.
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || "4f1bd9c73a5e2b8c6d90e7f4a1c3b5d8e9f0a2c4b6d8e0f2a4c6b8d0e2f4a6c8";
// Messaging templates import the db module, which validates this at import
// time. Tests never open a connection; the pool is lazy. Only fall back when
// the inherited value is not a usable PostgreSQL connection string (some
// sandbox hosts inject a foreign "file:..." DATABASE_URL into the process env).
if (!/^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL ?? "")) {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
}
