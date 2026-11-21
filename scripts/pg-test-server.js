// سرور موقت پستگرس برای اجرای آزمون‌ها در سندباکس (پستگرس سیستمی موجود نیست)
// استفاده: node scripts/pg-test-server.js  → تا PG_READY چاپ شود؛ پس از پایان با kill خاتمه دهید.
const EmbeddedPostgres = require('embedded-postgres').default;
const { Client } = require('pg');
const pg = new EmbeddedPostgres({
  databaseDir: '/home/z/.pgdata-test',
  user: 'postgres',
  password: 'postgres',
  port: 5432,
  persistent: false,
  onError: (m) => console.error('[pg]', String(m).slice(0, 200)),
});
(async () => {
  await pg.initialise();
  await pg.start();
  const c = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres' });
  await c.connect();
  await c.query("CREATE ROLE noor LOGIN PASSWORD 'noor_dev_2026' CREATEDB").catch((e) => {
    if (!/already exists/.test(e.message)) throw e;
    console.log('role noor exists');
  });
  await c.query("ALTER ROLE noor WITH LOGIN PASSWORD 'noor_dev_2026' CREATEDB");
  await c.end();
  console.log('PG_READY');
  process.stdin.resume(); // نگه‌داشتن فرایند برای استفادهٔ آزمون‌ها
})().catch((e) => {
  console.error('PG_FAIL', String(e).slice(0, 300));
  process.exit(1);
});
