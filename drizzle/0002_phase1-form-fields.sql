-- Phase 1 (form data completion): identity fields, residence/activity geo split,
-- postal code, document type/number, personnel photo, record position,
-- course-to-certificate link, paper-form source, base specialties.
-- Hand-written companion to drizzle schema (applied by scripts/apply-migrations.mjs).

ALTER TABLE quranic_activists
  ADD COLUMN IF NOT EXISTS id_card_number varchar(20),
  ADD COLUMN IF NOT EXISTS id_issue_place varchar(80),
  ADD COLUMN IF NOT EXISTS postal_code varchar(10),
  ADD COLUMN IF NOT EXISTS activity_province_id integer,
  ADD COLUMN IF NOT EXISTS activity_county_id integer,
  ADD COLUMN IF NOT EXISTS photo_document_id uuid;

ALTER TABLE activist_documents
  ADD COLUMN IF NOT EXISTS doc_type varchar(40),
  ADD COLUMN IF NOT EXISTS doc_number varchar(60),
  ADD COLUMN IF NOT EXISTS kind varchar(20) NOT NULL DEFAULT 'evidence';

ALTER TABLE activity_records
  ADD COLUMN IF NOT EXISTS position varchar(120);

ALTER TABLE educational_courses
  ADD COLUMN IF NOT EXISTS certificate_id uuid;

-- fourth source value: data captured from a paper form
ALTER TYPE application_source ADD VALUE IF NOT EXISTS 'paper';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activists_activity_province_fk') THEN
    ALTER TABLE quranic_activists ADD CONSTRAINT activists_activity_province_fk
      FOREIGN KEY (activity_province_id) REFERENCES provinces(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activists_activity_county_fk') THEN
    ALTER TABLE quranic_activists ADD CONSTRAINT activists_activity_county_fk
      FOREIGN KEY (activity_county_id) REFERENCES counties(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activists_photo_document_fk') THEN
    ALTER TABLE quranic_activists ADD CONSTRAINT activists_photo_document_fk
      FOREIGN KEY (photo_document_id) REFERENCES activist_documents(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courses_certificate_fk') THEN
    ALTER TABLE educational_courses ADD CONSTRAINT courses_certificate_fk
      FOREIGN KEY (certificate_id) REFERENCES certificates(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS activists_activity_geo_idx
  ON quranic_activists (activity_province_id, activity_county_id);

-- three base specialties required by the requirement document (part 4)
INSERT INTO quranic_specialties (code, title) VALUES
  ('commentator', 'مفسر قرآن'),
  ('author', 'مؤلف قرآنی'),
  ('cultural_activist', 'فعال فرهنگی قرآنی')
ON CONFLICT (code) DO NOTHING;
