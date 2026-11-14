-- ZAMIL migration 001 — objects the code queries but schema.sql never created.
-- Idempotent: safe to re-run, and safe on a fresh install after schema.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS otp_daily (
  username text NOT NULL,
  day      date NOT NULL,
  count    int  NOT NULL DEFAULT 0,
  PRIMARY KEY (username, day)
);
CREATE INDEX IF NOT EXISTS ix_otp_daily_day ON otp_daily (day DESC);

CREATE TABLE IF NOT EXISTS kv_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cli_access (
  username   text PRIMARY KEY,
  allowed    boolean NOT NULL DEFAULT false,
  updated_by text,
  updated_at timestamptz DEFAULT now()
);

-- DOR stays DB-controlled: flip with UPDATE user_creds SET dor_allowed=true WHERE username='x';
ALTER TABLE user_creds ADD COLUMN IF NOT EXISTS dor_allowed boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS free_try_log (
  id         bigserial PRIMARY KEY,
  username   text NOT NULL,
  granted_by text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ftl_user_time ON free_try_log (username, created_at DESC);

INSERT INTO kv_settings (key,value) VALUES ('leaderboard_mode','global') ON CONFLICT (key) DO NOTHING;

COMMIT;
