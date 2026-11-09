-- Tables/columns the code uses that schema.sql does not create.
ALTER TABLE user_creds ADD COLUMN IF NOT EXISTS dor_allowed boolean DEFAULT false;
CREATE TABLE IF NOT EXISTS otp_counters (
  username text PRIMARY KEY, otp_today int DEFAULT 0, otp_week int DEFAULT 0, otp_month int DEFAULT 0,
  last_reset_date text,  -- text on purpose: loops.js compares it with a 'YYYY-MM-DD' string
  updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS cli_access (
  username text PRIMARY KEY, allowed boolean DEFAULT true, updated_by text, updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS kv_settings (
  key text PRIMARY KEY, value text, updated_at timestamptz DEFAULT now());
