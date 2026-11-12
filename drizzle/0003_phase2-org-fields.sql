-- Phase 2 (management depth): full organization profile — geographic scope,
-- address, contact phone and manager name, so the settings catalogue matches
-- the requirement document's institution fields.
-- Hand-written companion to drizzle schema (applied by scripts/apply-migrations.mjs).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS province_id integer,
  ADD COLUMN IF NOT EXISTS county_id integer,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone varchar(20),
  ADD COLUMN IF NOT EXISTS manager_name varchar(140);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_province_fk') THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_province_fk
      FOREIGN KEY (province_id) REFERENCES provinces(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_county_fk') THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_county_fk
      FOREIGN KEY (county_id) REFERENCES counties(id);
  END IF;
END $$;
