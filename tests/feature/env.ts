// Must be the first import of every feature test file: it pins the database
// URL before "@/db" evaluates its connection pool. Unit tests are unaffected.
process.env.DATABASE_URL = "postgresql://noor:noor_dev_2026@127.0.0.1:5432/noor_feature";
