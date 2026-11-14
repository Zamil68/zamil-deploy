-- ZAMIL migration 004 — weekly/monthly counters (Tue→Mon week, 4-week month)
-- Type-safe: normalizes otp_counters.last_reset_date to date on ANY existing schema.
BEGIN;

CREATE TABLE IF NOT EXISTS otp_number_daily (
  number text NOT NULL,
  day    date NOT NULL,
  client text,
  count  int  NOT NULL DEFAULT 0,
  PRIMARY KEY (number, day)
);
CREATE INDEX IF NOT EXISTS ix_ond_day    ON otp_number_daily (day DESC);
CREATE INDEX IF NOT EXISTS ix_ond_client ON otp_number_daily (client, day DESC);

CREATE TABLE IF NOT EXISTS cdr_day_state (
  day          date PRIMARY KEY,
  swept_to     timestamp,
  rows_written bigint NOT NULL DEFAULT 0,
  local_total  bigint,
  complete     boolean NOT NULL DEFAULT false,
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_counters (
  username        text PRIMARY KEY,
  otp_today       int NOT NULL DEFAULT 0,
  otp_week        int NOT NULL DEFAULT 0,
  otp_month       int NOT NULL DEFAULT 0,
  last_reset_date date,
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE otp_counters ADD COLUMN IF NOT EXISTS week_start  date;
ALTER TABLE otp_counters ADD COLUMN IF NOT EXISTS month_start date;

-- normalize legacy text/varchar column → date (no-op if already date)
DO $do$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='public' AND table_name='otp_counters' AND column_name='last_reset_date';
  IF t IN ('text','character varying') THEN
    EXECUTE $x$ALTER TABLE otp_counters ALTER COLUMN last_reset_date TYPE date
      USING CASE WHEN last_reset_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                 THEN last_reset_date::date ELSE NULL END$x$;
    RAISE NOTICE 'otp_counters.last_reset_date converted text -> date';
  END IF;
END $do$;

CREATE INDEX IF NOT EXISTS ix_oc_today ON otp_counters (otp_today DESC);
CREATE INDEX IF NOT EXISTS ix_oc_week  ON otp_counters (otp_week  DESC);
CREATE INDEX IF NOT EXISTS ix_oc_month ON otp_counters (otp_month DESC);

-- anchor 2024-01-02 is a TUESDAY → week Tue..Mon, month = 4 aligned weeks
CREATE OR REPLACE FUNCTION refresh_otp_counters() RETURNS int AS $fn$
DECLARE
  d timestamp := date_trunc('day', NOW() AT TIME ZONE 'UTC');
  w timestamp;
  m timestamp;
  n int;
BEGIN
  w := d - (((d::date - DATE '2024-01-02') % 7)  * INTERVAL '1 day');
  m := d - (((d::date - DATE '2024-01-02') % 28) * INTERVAL '1 day');

  WITH raw AS (
    SELECT LOWER(client) AS u, time
    FROM sms_cdr
    WHERE time >= m AND client IS NOT NULL AND client <> '' AND LOWER(client) <> 'system generated'
  ), agg AS (
    SELECT u,
      COUNT(*) FILTER (WHERE time >= d)::int AS t,
      COUNT(*) FILTER (WHERE time >= w)::int AS wk,
      COUNT(*)::int AS mo
    FROM raw GROUP BY u
  ), rolled AS (
    SELECT username AS u,
      COALESCE(SUM(count) FILTER (WHERE day >= w::date), 0)::int AS wk,
      COALESCE(SUM(count), 0)::int AS mo
    FROM otp_daily
    WHERE day >= m::date AND day < d::date AND username <> 'system generated'
    GROUP BY username
  ), us AS (
    SELECT u FROM agg UNION SELECT u FROM rolled UNION SELECT username FROM otp_counters
  ), merged AS (
    SELECT us.u,
      COALESCE(a.t, 0)                      AS t,
      COALESCE(a.wk, 0) + COALESCE(r.wk, 0) AS wk,
      COALESCE(a.mo, 0) + COALESCE(r.mo, 0) AS mo
    FROM us LEFT JOIN agg a ON a.u = us.u LEFT JOIN rolled r ON r.u = us.u
  )
  INSERT INTO otp_counters (username, otp_today, otp_week, otp_month, last_reset_date, week_start, month_start, updated_at)
  SELECT u, t, wk, mo, d::date, w::date, m::date, NOW()
  FROM merged WHERE u IS NOT NULL AND u <> ''
  ON CONFLICT (username) DO UPDATE SET
    otp_today = EXCLUDED.otp_today,
    otp_week = EXCLUDED.otp_week,
    otp_month = EXCLUDED.otp_month,
    last_reset_date = EXCLUDED.last_reset_date,
    week_start = EXCLUDED.week_start,
    month_start = EXCLUDED.month_start,
    updated_at = NOW();

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$fn$ LANGUAGE plpgsql;

-- one-time catch-up: roll stranded past-day raw rows, then purge (atomic)
DO $do$
DECLARE b timestamp := date_trunc('day', NOW() AT TIME ZONE 'UTC');
BEGIN
  IF EXISTS (SELECT 1 FROM sms_cdr WHERE time < b LIMIT 1) THEN
    INSERT INTO otp_daily (username, day, count)
    SELECT LOWER(client), date_trunc('day', time)::date, COUNT(*)::int
    FROM sms_cdr WHERE time < b AND client IS NOT NULL AND client <> ''
    GROUP BY 1,2
    ON CONFLICT (username, day) DO UPDATE SET count = otp_daily.count + EXCLUDED.count;

    INSERT INTO otp_number_daily (number, day, client, count)
    SELECT number, date_trunc('day', time)::date, MAX(LOWER(client)), COUNT(*)::int
    FROM sms_cdr WHERE time < b AND number <> ''
    GROUP BY 1,2
    ON CONFLICT (number, day) DO UPDATE
      SET count = otp_number_daily.count + EXCLUDED.count,
          client = COALESCE(EXCLUDED.client, otp_number_daily.client);

    DELETE FROM sms_cdr WHERE time < b;
    RAISE NOTICE 'backfill: stranded raw rows rolled up and purged';
  END IF;
END $do$;

COMMIT;

SELECT refresh_otp_counters() AS users_updated;
