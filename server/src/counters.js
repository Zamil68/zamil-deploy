// otp_counters is a MATERIALIZED SNAPSHOT, recomputed from otp_daily + today's raw.
// Recompute (not blind increment) means a missed tick or a restart can never drift it.
// Windows: day = 00:00 UTC (05:00 PKT) · week = Tue→Mon · month = 4 aligned weeks.
const { q } = require('./db');
const TTL = 10000;
let last = 0;
let inflight = null;

async function refreshCounters(force = false) {
  if (!force && Date.now() - last < TTL) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try { await q('SELECT refresh_otp_counters()'); }
    catch (e) { console.error('[counters]', e.message); }
    finally { last = Date.now(); inflight = null; }
  })();
  return inflight;
}

const DAY = "date_trunc('day', NOW() AT TIME ZONE 'UTC')";
const ANCHOR = "DATE '2024-01-02'"; // a Tuesday
const WEEK_START  = `(${DAY} - ((((${DAY})::date - ${ANCHOR}) % 7)  * INTERVAL '1 day'))`;
const MONTH_START = `(${DAY} - ((((${DAY})::date - ${ANCHOR}) % 28) * INTERVAL '1 day'))`;

module.exports = { refreshCounters, DAY, WEEK_START, MONTH_START };
