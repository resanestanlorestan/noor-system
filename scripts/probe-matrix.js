// Quick DB probes for the permission matrix smoke test.
const { Client } = require("pg");
const label = process.argv[2];
(async () => {
  const c = new Client({ connectionString: "postgresql://noor:noor_dev_2026@127.0.0.1:5432/noor_dev" });
  await c.connect();
  const role = await c.query("select id, label, base_role from custom_roles where label = $1", [label]);
  if (!role.rows.length) { console.log("custom role not found:", label); await c.end(); return; }
  console.log("custom role:", role.rows[0]);
  const grants = await c.query("select permission_key from custom_role_permissions where custom_role_id = $1", [role.rows[0].id]);
  console.log("grants:", grants.rows.map((row) => row.permission_key));
  await c.end();
})().catch((error) => { console.error(error.message); process.exit(1); });
