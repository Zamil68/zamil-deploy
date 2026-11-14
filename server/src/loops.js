// Background daemons (single process, PM2-managed). LaMix = source of truth.
const { q, PKT_DAY, pool } = require('./db');
const lx = require('./lamix');
const sse = require('./sse');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const normT = s => {
  let v = String(s == null ? '' : s).trim();
  if (!v) return v;
  if (/^[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}/.test(v)) {
    try { const d = new Date(v); if (!isNaN(d.getTime())) return d.toISOString().replace('T',' ').replace(/\.\d+$/,'').replace(/Z$/,'').trim(); } catch {}
  }
  return v.replace('T', ' ').replace(/\.\d+/, '').replace(/(Z|[+-]\d{2}:?\d{2})$/, '').trim();
};
const G = global;
G.__cdrHb = 0; G.__cdrLast = 0; G.__cdrOkAt = 0; G.__syncHb = 0; G.__reconHb = 0; G.__queueHb = 0; G.__clientsHb = 0;
G.__reconState = { status: 'idle', fetched: 0, expected: 0, remaining: 0, etaSecs: 0 };
G.__reconCurve = []; G.__reconDue = 0; G.__reconLast = 0;

let _nc = { ts: 0, map: new Map() };
async function ncMap(){
  if (_nc.map.size && Date.now() - _nc.ts < 5000) return _nc.map;
  const r = await q("SELECT number, client_id FROM pool_numbers WHERE status='assigned' AND client_id IS NOT NULL");
  _nc = { ts: Date.now(), map: new Map(r.rows.map(x => [x.number, x.client_id])) };
  return _nc.map;
}
const invalidateNc = () => { _nc.ts = 0; };

// Numbers released or reassigned since an SMS arrived are absent from the assigned
// pool map. Without this fallback their OTPs were attributed to nobody and lost.
async function ownerFallback(nums) {
  if (!nums.length) return new Map();
  const r = await q("SELECT number, client FROM user_numbers WHERE number = ANY($1) AND client IS NOT NULL AND client<>''", [nums]);
  return new Map(r.rows.map(x => [x.number, x.client]));
}

async function smsPayloadFor(username, clientName){
  const alt = clientName || username;
  const c = await q("SELECT COUNT(*)::int t FROM sms_cdr WHERE time >= " + PKT_DAY + " AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2))", [username, alt]);
  const r = await q("SELECT to_char(time AT TIME ZONE 'UTC','HH24:MI:SS') AS time, time AS datetime, number, cli, content AS message, range FROM sms_cdr WHERE time >= " + PKT_DAY + " AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2)) ORDER BY time DESC LIMIT 50", [username, alt]);
  return { ok: true, count: c.rows[0].t, recent: r.rows };
}

async function pushSmsTo(users){
  for (const u of new Set(users)) {
    try { const p = await smsPayloadFor(u, u); sse.pushUsers([u], 'sms', p); sse.pushUsers([u], 'lb', {}); } catch (e) {}
  }
}

// ── BOAT 1: CDR stream → moved to ./cdr.js (realtime + day-sweep lanes) ──

// ── BOAT 2: ranges sync ──
// FIX (glitch): broadcasts fire ONLY when the pool signature actually changed.
// Before this, every 15s tick pushed 'ranges'+'numbers' → the whole UI refetched
// and flashed on every tab switch. Silent background sync continues as before.
let _rangeSig = '';
async function syncLoop(){
  while (true) {
    G.__syncHb = Date.now();
    try {
      const d = await lx.get('/ranges');
      const recs = (d && (d.ranges || d.records)) || [];
      if (!d._error && !d._rateLimited && recs.length) {
        let n = 0, u = 0; recs.forEach(r => { n += (r.numbers || 0); u += (r.unassignedNumbers || 0); });
        const sig = recs.map(r => String(r.id)).sort().join(',') + '|' + n + '|' + u;
        const prev = await q("SELECT range_id, name FROM ranges");
        const pm = new Map(prev.rows.map(r => [r.range_id, r.name]));
        const nm = new Map(recs.map(r => [String(r.id), r.name || '']));
        const ev = [];
        if (pm.size) {
          nm.forEach((name, id) => { if (!pm.has(id)) ev.push({ action: 'added', range_id: id, name, numbers: 0 }); });
          pm.forEach((name, id) => { if (!nm.has(id)) ev.push({ action: 'removed', range_id: id, name, numbers: 0 }); });
        }
        for (const r of recs) {
          await q("INSERT INTO ranges (range_id,name,prefix,total_numbers,updated_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (range_id) DO UPDATE SET name=EXCLUDED.name, prefix=EXCLUDED.prefix, total_numbers=EXCLUDED.total_numbers, updated_at=NOW()",
            [String(r.id), r.name || '', r.prefix || '', r.numbers || 0]);
        }
        const gone = [...pm.keys()].filter(id => !nm.has(id));
        if (gone.length) {
          await q("DELETE FROM ranges WHERE range_id = ANY($1)", [gone]);
          for (const id of gone) {
            await q("UPDATE user_numbers SET status='released', updated_at=NOW() WHERE range_id=$1 AND status='active'", [id]);
            await q("UPDATE pool_numbers SET status='gone', client_id=NULL, updated_at=NOW() WHERE range_id=$1 AND status IN ('free','assigned')", [id]);
            const cnt = await q("SELECT COUNT(*)::int c FROM user_numbers WHERE range_id=$1", [id]);
            await q("INSERT INTO crush_queue (range_id,range_name,rows_alive,status,source,suggested_at) SELECT $1,$2,$3,'suggested','auto',NOW() WHERE NOT EXISTS (SELECT 1 FROM crush_queue WHERE range_id=$1 AND status='suggested')",
              [id, pm.get(id) || '', cnt.rows[0].c]);
            console.log('[sync] range removed → released:', pm.get(id));
          }
          invalidateNc();
        }
        if (ev.length) q("INSERT INTO range_changelog (action,range_id,name,numbers) SELECT v.a,v.id,v.nm,v.n FROM json_to_recordset($1) AS v(a text,id text,nm text,n int)", [JSON.stringify(ev.map(e => ({ a: e.action, id: e.range_id, nm: e.name, n: e.numbers })))]).catch(() => {});
        if (sig !== _rangeSig) {
          if (_rangeSig) G.__reconDue = Date.now();
          _rangeSig = sig;
          sse.broadcast('ranges'); sse.broadcast('numbers');
        }
      }
    } catch (e) { console.error('[sync]', e.message); }
    await sleep(15000);
  }
}

// ── BOAT 3: full numbers reconcile ──
async function reconcileLoop(){
  while (true) {
    const idle = Date.now() - (G.__reconLast || 0);
    if (idle > 15000 || (G.__reconDue && idle > 10000)) {
      G.__reconDue = 0; G.__reconLast = Date.now();
      const t0 = new Date().toISOString(); const t0ms = Date.now();
      let after = null, pages = 0, seen = 0, complete = false;
      const curve = [];
      try {
        const exp = await q("SELECT COUNT(*)::int e FROM pool_numbers WHERE status IN ('free','assigned')");
        G.__reconState = { status: 'running', fetched: 0, expected: exp.rows[0].e, remaining: exp.rows[0].e, etaSecs: 60, etaAt: Date.now(), startedAt: t0ms };
        while (pages < 1200) {
          const d = await lx.get('/numbers', after ? { limit: 500, after } : { limit: 500 });
          if (!d || d._error || d._rateLimited) break;
          const recs = d.records || [];
          if (recs.length) {
            const rows = recs.map(r => ({ num: String(r.number || ''), rid: r.rangeId ? String(r.rangeId) : '', cli: r.client || '' }));
            await q("INSERT INTO pool_numbers (number,range_id,status,client_id,lamix_synced_at,updated_at) SELECT n.num, NULLIF(n.rid,''), CASE WHEN n.cli='' THEN 'free' ELSE 'assigned' END, NULLIF(n.cli,''), $2, $2 FROM json_to_recordset($1) AS n(num text, rid text, cli text) ON CONFLICT (number) DO UPDATE SET range_id=EXCLUDED.range_id, status=EXCLUDED.status, client_id=EXCLUDED.client_id, lamix_synced_at=$2, updated_at=$2", [JSON.stringify(rows), t0]);
            const nums = rows.map(x => x.num);
            await q("INSERT INTO user_numbers (number,client,range_id,range_name,status,updated_at) SELECT p.number,p.client_id,p.range_id,r.name,'active',NOW() FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id WHERE p.status='assigned' AND p.client_id IS NOT NULL AND p.number = ANY($1) ON CONFLICT (number) DO UPDATE SET client=EXCLUDED.client, range_name=EXCLUDED.range_name, status='active', updated_at=NOW()", [nums]);
            await q("UPDATE user_numbers u SET status='released', updated_at=NOW() WHERE u.status='active' AND u.number = ANY($1) AND EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=u.number AND p.status='free')", [nums]);
            seen += recs.length;
          }
          pages++; curve.push({ t: Date.now(), f: seen }); if (curve.length > 400) curve.shift();
          G.__reconHb = Date.now();
          G.__reconState = { status: 'running', fetched: seen, expected: Math.max(exp.rows[0].e, seen), remaining: Math.max(0, exp.rows[0].e - seen), etaSecs: Math.max(5, Math.round((Math.max(0, exp.rows[0].e - seen) / 500) * (60 / 38)) + 2), etaAt: Date.now(), startedAt: t0ms };
          G.__reconCurve = curve;
          after = d.nextCursor || null;
          if (!after) { complete = true; break; }
        }
        if (complete && seen) {
          await q("UPDATE pool_numbers SET status='gone', client_id=NULL, updated_at=$1 WHERE status IN ('free','assigned') AND lamix_synced_at < $1", [t0]);
          await q("UPDATE user_numbers u SET status='released', updated_at=NOW() WHERE u.status='active' AND EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=u.number AND p.status='gone')");
          await q("UPDATE user_numbers u SET client=p.client_id, updated_at=NOW() FROM pool_numbers p WHERE u.number=p.number AND u.status='active' AND p.status='assigned' AND u.client IS DISTINCT FROM p.client_id");
          await q("UPDATE user_numbers SET status='junk', updated_at=NOW() WHERE status='released' AND NOT EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=user_numbers.number AND p.status IN ('free','assigned'))");
          await q("DELETE FROM pool_numbers WHERE status='gone' AND updated_at < NOW() - interval '20 minutes'");
          await q("DELETE FROM user_numbers WHERE status='junk' AND updated_at < NOW() - interval '2 minutes'");
          await q("UPDATE ranges SET last_num_sync=NOW()");
          invalidateNc();
          sse.broadcast('numbers'); sse.broadcast('ranges');
          G.__reconState = { status: 'done', fetched: seen, expected: seen, remaining: 0, etaSecs: 0, startedAt: t0ms, endedAt: Date.now(), complete: true };
          G.__reconSeen = seen; G.__reconComplete = true;
          console.log('[recon] complete pages=' + pages + ' seen=' + seen);
        } else console.log('[recon] partial pages=' + pages + ' seen=' + seen);
      } catch (e) { console.error('[recon]', e.message); }
      G.__reconHb = Date.now();
    }
    await sleep(5000);
  }
}

// ── BOAT 4: allocation queue worker ──
const ctryOf = t => { const m = String(t || '').match(/^(.+?)[\s-](?:LX|MX|RX|DC)\b/i) || String(t || '').match(/^([A-Za-z\s]+?)\d/); return (m && m[1] ? m[1] : String(t || '')).trim(); };

// A permanently-failing batch used to stay 'pending' forever and re-hit LaMix every
// 1.5s in the FAST lane, starving every real user allocation behind it.
async function failBatch(row, err) {
  const msg = String(err || 'unknown').slice(0, 200);
  await q("UPDATE alloc_queue SET status='failed', result=$2, last_error=$3, processed_at=NOW() WHERE id=$1", [row.id, JSON.stringify({ error: msg }), msg]);
  const owner = String(row.client || row.username || '').toLowerCase();
  // User bookings consumed daily quota up front — refund it. Admin bulk never wrote events.
  if (owner && String(row.username || '').toLowerCase() === owner) {
    await q("INSERT INTO alloc_events (username,country,range_id,range_title,qty) VALUES ($1,$2,$3,$4,$5)",
      [owner, ctryOf(row.range_name), row.range_id || '', row.range_name || '', -(parseInt(row.qty, 10) || 0)]).catch(() => {});
  }
  await q("INSERT INTO app_notifs (target,type,title,body,created_by) VALUES ($1,'warn','⛵ Dispatch failed',$2,'system')",
    [owner, (row.range_name || 'Batch') + ' ×' + row.qty + ' could not be delivered: ' + msg + '. Your daily quota was refunded.']).catch(() => {});
  if (owner) sse.pushUsers([owner], 'notif');
  sse.broadcast('numbers');
}

async function queueWorker(){
  const MAX_ATTEMPTS = 8;
  while (true) {
    G.__queueHb = Date.now();
    try {
      // Reclaim reservations abandoned by a crashed request or a killed process.
      await q("UPDATE pool_numbers SET status='free', updated_at=NOW() WHERE status='reserved' AND updated_at < NOW() - interval '5 minutes'");
      const b = await q("SELECT * FROM alloc_queue WHERE status='pending' AND attempts < $1 ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED", [MAX_ATTEMPTS]);
      const row = b.rows[0];
      if (row) {
        const tries = (parseInt(row.attempts, 10) || 0) + 1;
        await q("UPDATE alloc_queue SET attempts=$2 WHERE id=$1", [row.id, tries]);
        const un = row.client || row.username || '';
        const rid = row.range_id || '', rname = row.range_name || '';
        const qty = parseInt(row.qty, 10) || 0;
        const lock = await q("SELECT number FROM pool_numbers WHERE range_id=$1 AND status='free' ORDER BY number LIMIT $2 FOR UPDATE SKIP LOCKED", [rid, qty]);
        const nums = lock.rows.map(r => r.number);
        if (!nums.length) {
          await failBatch(row, 'no free numbers in range');
        } else {
          const lr = await lx.post('/numbers/assign', { client: un, numbers: nums, clientPayoutRate: String(row.payout_rate || 0.01) }, 'fast');
          if (lr && (lr._error || lr._rateLimited)) {
            const err = String(lr._error || 'rate limited');
            if (tries >= MAX_ATTEMPTS) await failBatch(row, err);
            else await q("UPDATE alloc_queue SET last_error=$2 WHERE id=$1", [row.id, err.slice(0, 200)]);
          } else {
            await q("UPDATE pool_numbers SET status='assigned', client_id=$1, assigned_at=NOW(), updated_at=NOW() WHERE number = ANY($2)", [un, nums]);
            await q("INSERT INTO user_numbers (number,client,range_id,range_name,status,updated_at) SELECT n,$1,$2,$3,'active',NOW() FROM UNNEST($4::text[]) n ON CONFLICT (number) DO UPDATE SET client=EXCLUDED.client, status='active', range_name=EXCLUDED.range_name, updated_at=NOW()", [un, rid, rname, nums]);
            await q("UPDATE alloc_queue SET status='done', result=$2, last_error=NULL, processed_at=NOW() WHERE id=$1", [row.id, JSON.stringify({ assigned: nums.length })]);
            invalidateNc(); sse.broadcast('numbers'); sse.broadcast('ranges');
          }
        }
      }
    } catch (e) { console.error('[queue]', e.message); }
    await sleep(1500);
  }
}

// ── BOAT 5: client creation queue ──
async function clientsLoop(){
  while (true) {
    G.__clientsHb = Date.now();
    try {
      const qs = await q("SELECT * FROM client_queue WHERE status='pending' ORDER BY created_at ASC LIMIT 5");
      for (const it of qs.rows) {
        await sleep(2500);
        const r = await lx.post('/clients', { username: it.username, name: it.name || it.username,
          canUseApi: !!it.can_use_api, canViewRanges: !!it.can_view_ranges, canUseExtendedApi: !!it.can_use_extended_api });
        const okR = r && !r._error && !r._rateLimited;
        await q("UPDATE client_queue SET status=$2, generated_password=$3, result=$4, processed_at=NOW() WHERE id=$1",
          [it.id, okR ? 'done' : 'failed', (r && r.password) || null, JSON.stringify(r || {})]);
        await q("INSERT INTO app_notifs (target,type,title,body,created_by) VALUES ($1,$2,$3,$4,'system')",
          [String(it.admin_username || '*').toLowerCase(), okR ? 'success' : 'warn',
          okR ? 'Client Created' : 'Client Creation Failed',
          okR ? ('✅ ' + it.username + ' created') : ('❌ ' + it.username + ' failed: ' + ((r && r._error) || 'unknown'))]);
      }
    } catch (e) {}
    await sleep(2000);
  }
}

// ── scheduler: refresh stale ranges ──
const _rrTh = new Map();
function maybeRangeRefresh(rid){
  if (!rid || rid.indexOf('r_') === 0) return;
  const last = _rrTh.get(rid) || 0;
  if (Date.now() - last < 60000) return;
  _rrTh.set(rid, Date.now()); G.__reconDue = Date.now();
}

async function rangeRotLoop(){
  while (true) {
    try { const r = await q("SELECT 1 FROM ranges WHERE total_numbers>0 AND (last_num_sync IS NULL OR last_num_sync < NOW() - interval '6 minutes') LIMIT 1"); if (r.rows[0]) G.__reconDue = Date.now(); } catch (e) {}
    await sleep(20000);
  }
}

async function refreshRange(rangeId){
  const t0 = new Date().toISOString();
  let after = null, pages = 0, seen = 0;
  while (pages < 40) {
    const d = await lx.get('/numbers', after ? { rangeId, limit: 500, after } : { rangeId, limit: 500 });
    if (!d || d._error || d._rateLimited) break;
    const recs = d.records || [];
    if (recs.length) {
      const rows = recs.map(r => ({ num: String(r.number || ''), rid: r.rangeId ? String(r.rangeId) : rangeId, cli: r.client || '' }));
      await q("INSERT INTO pool_numbers (number,range_id,status,client_id,lamix_synced_at,updated_at) SELECT n.num, NULLIF(n.rid,''), CASE WHEN n.cli='' THEN 'free' ELSE 'assigned' END, NULLIF(n.cli,''), $2, $2 FROM json_to_recordset($1) AS n(num text, rid text, cli text) ON CONFLICT (number) DO UPDATE SET range_id=EXCLUDED.range_id, status=EXCLUDED.status, client_id=EXCLUDED.client_id, lamix_synced_at=$2, updated_at=$2", [JSON.stringify(rows), t0]);
      seen += recs.length;
    }
    pages++; after = d.nextCursor || null; if (!after) break;
  }
  await q("INSERT INTO user_numbers (number,client,range_id,range_name,status,updated_at) SELECT p.number,p.client_id,p.range_id,r.name,'active',NOW() FROM pool_numbers p JOIN ranges r ON r.range_id=p.range_id WHERE p.range_id=$1 AND p.status='assigned' AND p.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user_numbers u WHERE u.number=p.number AND u.status='active') ON CONFLICT (number) DO UPDATE SET client=EXCLUDED.client, status='active', updated_at=NOW()", [rangeId]);
  await q("UPDATE user_numbers u SET status='released', updated_at=NOW() WHERE u.status='active' AND range_id=$1 AND EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=u.number AND p.status='free')", [rangeId]);
  await q("UPDATE ranges SET last_num_sync=NOW() WHERE range_id=$1", [rangeId]);
  invalidateNc(); sse.broadcast('numbers'); sse.broadcast('ranges');
  return { pages, seen };
}

function start(){ require('./cdr').start(); syncLoop(); reconcileLoop(); queueWorker(); clientsLoop(); rangeRotLoop(); console.log('[loops] daemons LIVE (cdr+sync+reconcile+queue+clients+rot)'); }
module.exports = { start, ncMap, invalidateNc, maybeRangeRefresh, pushSmsTo, smsPayloadFor, refreshRange, dailyTruncationLoop };

// ── BOAT 6: CDR rollover (count per user → otp_daily, then wipe raw rows) ──
async function dailyTruncationLoop(){
  while (true) {
    try {
      const br = await q("SELECT date_trunc('day', NOW() AT TIME ZONE 'UTC') AS b");
      const B = br.rows[0].b;
      const has = await q("SELECT 1 FROM sms_cdr WHERE time < $1 LIMIT 1", [B]);
      if (has.rows[0]) {
        const cl = await pool.connect();
        try {
          await cl.query('BEGIN');
          await cl.query("SET LOCAL statement_timeout='10min'");
          await cl.query("INSERT INTO otp_daily (username, day, count) SELECT LOWER(client), date_trunc('day', time)::date, COUNT(*)::int FROM sms_cdr WHERE time < $1 AND client IS NOT NULL AND client <> '' GROUP BY 1, 2 ON CONFLICT (username, day) DO UPDATE SET count = otp_daily.count + EXCLUDED.count", [B]);
          await cl.query("INSERT INTO otp_number_daily (number, day, client, count) SELECT number, date_trunc('day', time)::date, MAX(LOWER(client)), COUNT(*)::int FROM sms_cdr WHERE time < $1 AND number <> '' GROUP BY 1,2 ON CONFLICT (number, day) DO UPDATE SET count = otp_number_daily.count + EXCLUDED.count, client = COALESCE(EXCLUDED.client, otp_number_daily.client)", [B]);
          const del = await cl.query("DELETE FROM sms_cdr WHERE time < $1", [B]);
          await cl.query('COMMIT');
          console.log('[retention] rolled up + purged', del.rowCount, 'raw CDR rows');
        } finally { cl.release(); }
      }
    } catch (e) { console.error('[retention]', e.message); }
    await sleep(3600000);
  }
}
// === EOF: loops.js ===
