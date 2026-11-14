const { q } = require('./db');
const lx = require('./lamix');
const L = require('./loops');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const G = global;

const normT = s => {
  let v = String(s == null ? '' : s).trim();
  if (!v) return v;
  if (/^[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}/.test(v)) {
    try { const d = new Date(v); if (!isNaN(d.getTime())) return d.toISOString().replace('T', ' ').replace(/\.\d+$/, '').replace(/Z$/, '').trim(); } catch (e) {}
  }
  return v.replace('T', ' ').replace(/\.\d+/, '').replace(/(Z|[+-]\d{2}:?\d{2})$/, '').trim();
};
const dayKey = () => new Date().toISOString().slice(0, 10);
const dayStart = () => dayKey() + ' 00:00:00';

// owner resolution: live pool map first, ledger fallback for released/reassigned
async function toRows(recs, affected) {
  const m = await L.ncMap();
  const need = [...new Set(recs.filter(r => !r.client && !m.has(String(r.number || ''))).map(r => String(r.number || '')))];
  let fb = new Map();
  if (need.length) {
    const r = await q("SELECT number, client FROM user_numbers WHERE number = ANY($1) AND client IS NOT NULL AND client<>''", [need]);
    fb = new Map(r.rows.map(x => [x.number, x.client]));
  }
  const rows = recs.map(r => {
    const num = String(r.number || '');
    const owner = String(r.client || m.get(num) || fb.get(num) || '');
    if (owner) affected.add(owner);
    return {
      time: normT(r.time), number: num, cli: String(r.cli || ''), client: owner || null,
      content: r.content || '', range: r.range || '', range_prefix: r.rangePrefix || '',
      currency: r.currency || null, payout: r.payout != null ? r.payout : null,
      client_payout: r.clientPayout != null ? r.clientPayout : null,
      status: r.status || null, cleared_at: r.clearedAt ? normT(r.clearedAt) : null
    };
  }).filter(r => r.time && r.number);
  rows.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.number < b.number ? -1 : a.number > b.number ? 1 : 0));
  return rows;
}

async function write(rows) {
  if (!rows.length) return 0;
  const r = await q("SELECT ingest_cdr_sorted($1) AS n", [JSON.stringify(rows)]);
  return r.rows[0].n || 0;
}

function announce(affected, wrote) {
  if (!wrote) return;
  G.__cdrLast = Date.now();
  L.invalidateNc();
  if (affected.size) L.pushSmsTo([...affected]);
}

// ── FAST lane: live tail ─────────────────────────────────────────────────────
async function realtime() {
  let cur = null;
  while (true) {
    G.__cdrHb = Date.now();
    let ok = false, wrote = 0;
    const affected = new Set();
    try {
      const ds = dayStart();
      if (!cur) {
        const st = await q("SELECT last_time FROM cdr_state WHERE id=1");
        cur = st.rows[0] && st.rows[0].last_time ? normT(st.rows[0].last_time) : ds;
      }
      if (cur < ds) cur = ds;                       // new UTC day → never fetch yesterday
      const before = cur;
      for (let p = 0; p < 4; p++) {                 // bounded burst per tick
        const d = await lx.get('/cdrs', { from: cur, limit: 500 }, 'fast');
        if (!d || d._error || d._rateLimited) break;
        ok = true;
        const recs = d.records || [];
        if (!recs.length) break;
        const rows = await toRows(recs, affected);
        wrote += await write(rows);
        const maxT = rows.length ? rows[rows.length - 1].time : cur;
        if (maxT > cur) cur = maxT; else break;     // no forward progress → stop
        if (recs.length < 500) break;               // reached the live edge
      }
      if (cur !== before) {
        await q("INSERT INTO cdr_state (id,last_time) VALUES (1,$1) ON CONFLICT (id) DO UPDATE SET last_time=$1", [cur]);
      }
      announce(affected, wrote);
      if (ok) G.__cdrOkAt = Date.now();             // healthy poll even with 0 new rows
    } catch (e) { console.error('[cdr-live]', e.message); }
    await sleep(1600);
  }
}

// ── BULK lane: close any gap from 00:00 UTC → now ────────────────────────────
async function sweep() {
  while (true) {
    let idle = 5000;
    try {
      const day = dayKey(), ds = day + ' 00:00:00';
      await q("INSERT INTO cdr_day_state (day, swept_to) VALUES ($1,$2) ON CONFLICT (day) DO NOTHING", [day, ds]);
      const st = (await q("SELECT swept_to, complete FROM cdr_day_state WHERE day=$1", [day])).rows[0];
      G.__cdrSweep = { day, complete: !!(st && st.complete), sweptTo: st && st.swept_to };

      if (st && !st.complete) {
        let cur = st.swept_to ? normT(st.swept_to) : ds;
        if (cur < ds) cur = ds;
        let wrote = 0, caught = false;
        const affected = new Set();
        for (let p = 0; p < 6; p++) {
          const d = await lx.get('/cdrs', { from: cur, limit: 500 }, 'bulk');
          if (!d || d._error || d._rateLimited) break;   // realtime keeps priority
          const recs = d.records || [];
          if (!recs.length) { caught = true; break; }
          const rows = await toRows(recs, affected);
          const n = await write(rows);
          wrote += n;
          const maxT = rows.length ? rows[rows.length - 1].time : cur;
          if (maxT > cur) cur = maxT; else { caught = true; break; }
          await q("UPDATE cdr_day_state SET swept_to=$2, rows_written=rows_written+$3, updated_at=NOW() WHERE day=$1", [day, cur, n]);
          if (recs.length < 500) { caught = true; break; }
        }
        await q("UPDATE cdr_day_state SET swept_to=$2, complete=$3, updated_at=NOW() WHERE day=$1", [day, cur, caught]);
        announce(affected, wrote);
        if (caught) {
          const c = await q("SELECT COUNT(*)::int n FROM sms_cdr WHERE time >= $1", [ds]);
          await q("UPDATE cdr_day_state SET local_total=$2, updated_at=NOW() WHERE day=$1", [day, c.rows[0].n]);
          G.__cdrSweep = { day, complete: true, sweptTo: cur, localTotal: c.rows[0].n };
          console.log('[cdr-sweep] ' + day + ' complete · ' + c.rows[0].n + ' rows stored · +' + wrote + ' recovered');
        }
        idle = caught ? 60000 : 4000;
      } else idle = 60000;
    } catch (e) { console.error('[cdr-sweep]', e.message); }
    await sleep(idle);
  }
}

function start() {
  realtime();
  sweep();
  console.log('[cdr] engine LIVE — realtime(fast) + day-sweep(bulk) · 500/page · dedup on (time,number,cli)');
}
module.exports = { start };
