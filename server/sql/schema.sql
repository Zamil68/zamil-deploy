-- ZAMIL v3 schema (PostgreSQL). Run once: psql -d zamil_p1 -f schema.sql
CREATE TABLE IF NOT EXISTS user_creds (
  username text PRIMARY KEY, pass_hash text, recovery_hash text,
  client_id text, client_name text,
  pwd_changed_at timestamptz, updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS user_roles (
  username text PRIMARY KEY, role text NOT NULL, added_by text, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS team_prefixes (
  prefix text PRIMARY KEY, admin_username text NOT NULL, label text);
CREATE TABLE IF NOT EXISTS client_team_pins (
  username text PRIMARY KEY, prefix text NOT NULL, pinned_by text);
CREATE TABLE IF NOT EXISTS ranges (
  range_id text PRIMARY KEY, name text, prefix text, total_numbers int DEFAULT 0,
  last_num_sync timestamptz, updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS pool_numbers (
  number text PRIMARY KEY, range_id text, status text NOT NULL DEFAULT 'free',
  client_id text, assigned_at timestamptz, lamix_synced_at timestamptz, updated_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS ix_pool_range_status ON pool_numbers (range_id, status);
CREATE INDEX IF NOT EXISTS ix_pool_client ON pool_numbers (client_id) WHERE client_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS user_numbers (
  number text PRIMARY KEY, client text, range_id text, range_name text,
  status text NOT NULL DEFAULT 'active', updated_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS ix_un_client ON user_numbers (client, status);
CREATE INDEX IF NOT EXISTS ix_un_range ON user_numbers (range_name, status);
CREATE TABLE IF NOT EXISTS sms_cdr (
  time timestamp NOT NULL, number text NOT NULL, cli text NOT NULL DEFAULT '',
  client text, content text, range text, range_prefix text, currency text,
  payout numeric, client_payout numeric, status text, cleared_at timestamp, content_hash text,
  PRIMARY KEY (time, number, cli));
CREATE INDEX IF NOT EXISTS ix_cdr_time ON sms_cdr (time DESC);
CREATE INDEX IF NOT EXISTS ix_cdr_client ON sms_cdr (LOWER(client), time DESC);
CREATE INDEX IF NOT EXISTS ix_cdr_number ON sms_cdr (number, time DESC);
CREATE INDEX IF NOT EXISTS ix_cdr_range ON sms_cdr (range, time DESC);
CREATE TABLE IF NOT EXISTS cdr_state (id int PRIMARY KEY, last_time timestamp);
CREATE TABLE IF NOT EXISTS alloc_queue (
  id bigserial PRIMARY KEY, username text, client text, range_id text, range_name text,
  qty int NOT NULL DEFAULT 1, payout_rate numeric DEFAULT 0.01,
  status text NOT NULL DEFAULT 'pending', result jsonb,
  created_at timestamptz DEFAULT now(), processed_at timestamptz);
CREATE INDEX IF NOT EXISTS ix_aq_pending ON alloc_queue (status, id);
CREATE TABLE IF NOT EXISTS alloc_events (
  id bigserial PRIMARY KEY, username text, country text, range_id text, range_title text,
  qty int, created_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS ix_ae_user_day ON alloc_events (username, created_at DESC);
CREATE TABLE IF NOT EXISTS alloc_limits (
  id int PRIMARY KEY, qty_min int DEFAULT 1, qty_max int DEFAULT 50,
  range_daily int DEFAULT 50, country_daily int DEFAULT 100);
CREATE TABLE IF NOT EXISTS number_usage (
  number text NOT NULL, client text NOT NULL, range_id text, range_name text,
  used_by text, source text, used_at timestamptz DEFAULT now(),
  PRIMARY KEY (number, client));
CREATE TABLE IF NOT EXISTS app_notifs (
  id bigserial PRIMARY KEY, target text NOT NULL DEFAULT '*', type text DEFAULT 'info',
  title text, body text, created_by text, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS app_notif_reads (
  username text NOT NULL, notif_id bigint NOT NULL, PRIMARY KEY (username, notif_id));
CREATE TABLE IF NOT EXISTS system_incidents (
  id bigserial PRIMARY KEY, type text, severity text, title text, message text,
  metrics jsonb DEFAULT '{}', status text DEFAULT 'pending', created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS api_ping_log (
  id bigserial PRIMARY KEY, username text, endpoint text, created_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS ix_ping_time ON api_ping_log (created_at DESC);
CREATE TABLE IF NOT EXISTS client_queue (
  id bigserial PRIMARY KEY, admin_username text, username text, name text,
  can_use_api boolean DEFAULT true, can_view_ranges boolean DEFAULT true,
  can_use_extended_api boolean DEFAULT false, status text DEFAULT 'pending',
  generated_password text, result jsonb, created_at timestamptz DEFAULT now(), processed_at timestamptz);
CREATE TABLE IF NOT EXISTS crush_queue (
  id bigserial PRIMARY KEY, range_id text, range_name text, rows_alive int,
  status text, source text, crushed_by text, crushed_at timestamptz, suggested_at timestamptz);
CREATE TABLE IF NOT EXISTS team_targets (
  id bigserial PRIMARY KEY, period text, target_otps int, reward_usd numeric,
  top_n int, note text, updated_by text, updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS range_changelog (
  id bigserial PRIMARY KEY, action text, range_id text, name text, numbers int, ts timestamptz DEFAULT now());

CREATE OR REPLACE FUNCTION ingest_cdr(rows json) RETURNS int AS $$
  WITH ins AS (
    INSERT INTO sms_cdr (time,number,cli,client,content,range,range_prefix,currency,payout,client_payout,status,cleared_at)
    SELECT r.time,r.number,r.cli,r.client,r.content,r.range,r.range_prefix,r.currency,r.payout,r.client_payout,r.status,r.cleared_at
    FROM json_to_recordset(rows) AS r(time timestamp, number text, cli text, client text, content text,
      range text, range_prefix text, currency text, payout numeric, client_payout numeric, status text, cleared_at timestamp)
    ON CONFLICT (time,number,cli) DO NOTHING RETURNING 1)
  SELECT count(*)::int FROM ins;
$$ LANGUAGE sql;

INSERT INTO alloc_limits (id,qty_min,qty_max,range_daily,country_daily) VALUES (1,1,50,50,100) ON CONFLICT (id) DO NOTHING;
INSERT INTO cdr_state (id,last_time) VALUES (1, now() - interval '2 minutes') ON CONFLICT (id) DO NOTHING;