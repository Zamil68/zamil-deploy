-- ZAMIL migration 003 — CDR day-sweep bookkeeping + per-number weekly/monthly rollups
BEGIN;

CREATE TABLE IF NOT EXISTS cdr_day_state (
  day          date PRIMARY KEY,
  swept_to     timestamp,
  rows_written bigint NOT NULL DEFAULT 0,
  local_total  bigint,
  complete     boolean NOT NULL DEFAULT false,
  updated_at   timestamptz DEFAULT now()
);

-- raw CDR is truncated at 00:00 UTC; per-number counts survive for week/month
CREATE TABLE IF NOT EXISTS otp_number_daily (
  number text NOT NULL,
  day    date NOT NULL,
  client text,
  count  int  NOT NULL DEFAULT 0,
  PRIMARY KEY (number, day)
);
CREATE INDEX IF NOT EXISTS ix_ond_day    ON otp_number_daily (day DESC);
CREATE INDEX IF NOT EXISTS ix_ond_client ON otp_number_daily (client, day DESC);

-- chronological insert (oldest → newest), dedup on the primary key, returns NEW rows only
CREATE OR REPLACE FUNCTION ingest_cdr_sorted(rows json) RETURNS int AS $$
WITH ins AS (
  INSERT INTO sms_cdr (time,number,cli,client,content,range,range_prefix,currency,payout,client_payout,status,cleared_at,content_hash)
  SELECT r.time, r.number, r.cli, r.client, r.content, r.range, r.range_prefix, r.currency,
         r.payout, r.client_payout, r.status, r.cleared_at, md5(coalesce(r.content,''))
  FROM json_to_recordset(rows) AS r(
    time timestamp, number text, cli text, client text, content text, range text,
    range_prefix text, currency text, payout numeric, client_payout numeric,
    status text, cleared_at timestamp)
  WHERE r.time IS NOT NULL AND r.number IS NOT NULL AND r.number <> ''
  ORDER BY r.time ASC, r.number ASC
  ON CONFLICT (time,number,cli) DO NOTHING
  RETURNING 1)
SELECT count(*)::int FROM ins;
$$ LANGUAGE sql;

COMMIT;
