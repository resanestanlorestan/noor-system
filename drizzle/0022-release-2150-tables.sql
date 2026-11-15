-- الحاقیهٔ ۲.۱۵.۰ — مدیریت API و اتصال به سامانه‌های خارجی: جدول‌های کلیدها، اتصال‌ها، وب‌هوک‌ها، تاریخچه و تنظیمات
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(120) NOT NULL,
  "key_prefix" varchar(24) NOT NULL,
  "key_hash" varchar(64) NOT NULL UNIQUE,
  "key_cipher" text,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rate_limit" integer DEFAULT 60 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "last_used_at" timestamp with time zone,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "api_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(120) NOT NULL,
  "base_url" varchar(500) NOT NULL,
  "auth_type" varchar(12) DEFAULT 'none' NOT NULL,
  "auth_header_name" varchar(80) DEFAULT 'X-API-Key' NOT NULL,
  "token_cipher" text,
  "headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "last_status" varchar(10),
  "last_latency_ms" integer,
  "last_tested_at" timestamp with time zone,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "api_webhooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(120) NOT NULL,
  "event_key" varchar(60) NOT NULL,
  "integration_id" uuid REFERENCES "api_integrations"("id") ON DELETE SET NULL,
  "url" varchar(500) NOT NULL,
  "secret_cipher" text,
  "active" boolean DEFAULT true NOT NULL,
  "last_status_code" integer,
  "last_dispatch_at" timestamp with time zone,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "api_request_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "direction" varchar(10) NOT NULL,
  "method" varchar(10) NOT NULL,
  "path" varchar(300) NOT NULL,
  "api_key_id" uuid REFERENCES "api_keys"("id") ON DELETE SET NULL,
  "integration_id" uuid REFERENCES "api_integrations"("id") ON DELETE SET NULL,
  "webhook_id" uuid REFERENCES "api_webhooks"("id") ON DELETE SET NULL,
  "status_code" integer,
  "ok" boolean DEFAULT true NOT NULL,
  "duration_ms" integer DEFAULT 0 NOT NULL,
  "payload" text,
  "response_snippet" varchar(400),
  "error" varchar(400),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "api_request_logs_created_idx" ON "api_request_logs" ("created_at");
CREATE TABLE IF NOT EXISTS "api_settings" (
  "id" varchar(20) PRIMARY KEY DEFAULT 'global',
  "incoming_enabled" boolean DEFAULT true NOT NULL,
  "default_rate_limit" integer DEFAULT 60 NOT NULL,
  "ip_allowlist" varchar(300) DEFAULT '' NOT NULL,
  "updated_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
