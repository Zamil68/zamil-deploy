-- ZAMIL migration 002 — queue retry accounting + reservation reclaim support
BEGIN;
ALTER TABLE alloc_queue ADD COLUMN IF NOT EXISTS attempts   int NOT NULL DEFAULT 0;
ALTER TABLE alloc_queue ADD COLUMN IF NOT EXISTS last_error text;
CREATE INDEX IF NOT EXISTS ix_aq_worker   ON alloc_queue (status, attempts, id);
CREATE INDEX IF NOT EXISTS ix_pool_reserv ON pool_numbers (updated_at) WHERE status='reserved';
CREATE INDEX IF NOT EXISTS ix_ae_country  ON alloc_events (username, country, created_at DESC);
COMMIT;
