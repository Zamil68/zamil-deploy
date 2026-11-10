// Background daemons (single process, PM2-managed). LaMix = source of truth.
const { q, PKT_DAY } = require('./db');
const lx = require('./lamix');
const sse = require('./sse');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const normT = s => {
  let v = String(s == null ? '' : s).trim();
  if (!v) return v;
  // If it looks like JS Date.toString() e.g. "Wed Nov 04 2026 12:13:36 GM +0500 (...)"
  if (/^[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}/.test(v)) {
    try { const d = new Date(v); if (!isNaN(d.getTime())) return d.toISOString().replace('T',' ').replace(/\.\d+$/,'').replace(/Z$/,'').trim(); } catch {}
  }
  // Normal ISO / pg timestamp cleanup
  return v.replace('T', ' ').replace(/\.\d+/, '').replace(/(Z|[+-]\d{2}:?\d{2})$/, '').trim();
};
const G = global;
G.__cdrHb = 0; G.__cdrLast = 0; G.__syncHb = 0; G.__reconHb = 0; G.__queueHb = 0; G.__clientsHb = 0;
G.__reconState = { status: 'idle', fetched: 0, expected: 0, remaining: 0, etaSecs: 0 };
G.__reconCurve = []; G.__reconDue = 0; G.__reconLast = 0;

// ── number → client attribution map (5s cache) ──
let _nc = { ts: 0, map: new Map() };
async function ncMap(){
  if (_nc.map.size && Date.now() - _nc.ts < 5000) return _nc.map;
  const r = await q("SELECT number, client_id FROM pool_numbers WHERE status='assigned' AND client_id IS NOT NULL");
  _nc = { ts: Date.now(), map: new Map(r.rows.map(x => [x.number, x.client_id])) };
  return _nc.map;
}
const invalidateNc = () => { _nc.ts = 0; };

// ── per-user SMS payload + targeted push ──
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

// ── BOAT 1: CDR stream (watermark + duplicate-safe inserts) ──
async function cdrLoop(){
  while (true) {
    G.__cdrHb = Date.now();
    try {
      const st = await q("SELECT last_time FROM cdr_state WHERE id=1");
      let last = st.rows[0] && st.rows[0].last_time ? normT(st.rows[0].last_time) : normT(new Date(Date.now() - 120000).toISOString());
      let pages = 0, any = false; const affected = new Set();
      while (pages < 12) {
        const d = await lx.get('/cdrs', { from: last, limit: 500 });
        if (d._error || d._rateLimited) break;
        const recs = d.records || [];
        if (!recs.length) break;
        const m = await ncMap();
        const rows = recs.map(r => {
          const cli = String(r.client || m.get(String(r.number || '')) || '');
          if (cli) affected.add(cli);
          return { time: normT(r.time), number: String(r.number || ''), cli: String(r.cli || ''), client: cli || null,
            content: r.content || '', range: r.range || '', range_prefix: r.rangePrefix || '', currency: r.currency || null,
            payout: r.payout != null ? r.payout : null, client_payout: r.clientPayout != null ? r.clientPayout : null,
            status: r.status || null, cleared_at: r.clearedAt ? normT(r.clearedAt) : null };
        });
        await q("SELECT ingest_cdr($1)", [JSON.stringify(rows)]);
        rows.forEach(r => { if (r.time > last) last = r.time; });
        any = true; pages++;
        if (recs.length < 500) break;
      }
      if (any) {
        await q("INSERT INTO cdr_state (id,last_time) VALUES (1,$1) ON CONFLICT (id) DO UPDATE SET last_time=$1", [last]);
        G.__cdrLast = Date.now(); invalidateNc();
        if (affected.size) pushSmsTo([...affected]);
      } else G.__cdrLast = G.__cdrLast || Date.now();
    } catch (e) { console.error('[cdr]', e.message); }
    await sleep(1600);
  }
}

// ── BOAT 2: ranges sync (add/remove detection, auto-release removed ranges) ──
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
        if (sig !== _rangeSig) { if (_rangeSig) G.__reconDue = Date.now(); _rangeSig = sig; }
        sse.broadcast('ranges'); sse.broadcast('numbers');
      }
    } catch (e) { console.error('[sync]', e.message); }
    await sleep(15000);
  }
}

// ── BOAT 3: full numbers reconcile (LaMix → pool_numbers → user_numbers, auto-truncate vanished) ──
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
        G.__reconState = { status: 'running', fetched: 0, expected: exp.rows[0].e, remaining: exp.rows[0].e, etaSecs: 60, startedAt: t0ms };
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
          G.__reconState = { status: 'running', fetched: seen, expected: Math.max(exp.rows[0].e, seen), remaining: Math.max(0, exp.rows[0].e - seen), etaSecs: Math.max(5, Math.round((Math.max(0, exp.rows[0].e - seen) / 500) * (60 / 38)) + 2), startedAt: t0ms };
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
          await q("DELETE FROM user_numbers WHERE status='junk' AND updated_at < NOW() - interval '2 minutes'"); // vanished from LaMix → auto-truncate
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

// ── BOAT 4: allocation queue worker (row-locked, race-free) ──
async function queueWorker(){
  while (true) {
    G.__queueHb = Date.now();
    try {
      const b = await q("SELECT * FROM alloc_queue WHERE status='pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED");
      const row = b.rows[0];
      if (row) {
        const un = row.client || row.username || '';
        const rid = row.range_id || '', rname = row.range_name || '';
        const qty = parseInt(row.qty, 10) || 0;
        const lock = await q("SELECT number FROM pool_numbers WHERE range_id=$1 AND status='free' ORDER BY number LIMIT $2 FOR UPDATE SKIP LOCKED", [rid, qty]);
        const nums = lock.rows.map(r => r.number);
        if (!nums.length) {
          await q("UPDATE alloc_queue SET status='failed', result=$2, processed_at=NOW() WHERE id=$1", [row.id, JSON.stringify({ error: 'no free numbers in range' })]);
        } else {
          const lr = await lx.post('/numbers/assign', { client: un, numbers: nums, clientPayoutRate: String(row.payout_rate || 0.01) }, 'fast');
          if (lr && (lr._error || lr._rateLimited)) {
            await q("UPDATE alloc_queue SET result=$2 WHERE id=$1", [row.id, JSON.stringify({ error: lr._error || 'rate limited, retrying' })]);
          } else {
            await q("UPDATE pool_numbers SET status='assigned', client_id=$1, assigned_at=NOW(), updated_at=NOW() WHERE number = ANY($2)", [un, nums]);
            await q("INSERT INTO user_numbers (number,client,range_id,range_name,status,updated_at) SELECT n,$1,$2,$3,'active',NOW() FROM UNNEST($4::text[]) n ON CONFLICT (number) DO UPDATE SET client=EXCLUDED.client, status='active', range_name=EXCLUDED.range_name, updated_at=NOW()", [un, rid, rname, nums]);
            await q("UPDATE alloc_queue SET status='done', result=$2, processed_at=NOW() WHERE id=$1", [row.id, JSON.stringify({ assigned: nums.length })]);
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
           okR ? ('✅ ' + it.username + ' created' + (r.password ? ' | Pass: ' + r.password : '')) : ('❌ ' + it.username + ' failed: ' + ((r && r._error) || 'unknown'))]);
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
function start(){ cdrLoop(); syncLoop(); reconcileLoop(); queueWorker(); clientsLoop(); rangeRotLoop(); console.log('[loops] daemons LIVE (cdr+sync+reconcile+queue+clients+rot)'); }
module.exports = { start, ncMap, invalidateNc, maybeRangeRefresh, pushSmsTo, smsPayloadFor, refreshRange, dailyTruncationLoop };

// ── BOAT 6: CDR retention ──
// FIX: the old version wiped ALL CDR rows older than today at 5:00 AM PKT, so Week / Month
// (and the Admin Hub OTP report) could never count more than one day. Now we keep 35 days of
// raw CDR so Day / Week (7d) / Month (30d) and the 7-day chart are all computed live and match.
async function dailyTruncationLoop(){
  while (true) {
    try {
      const del = await q("DELETE FROM sms_cdr WHERE time < NOW() - interval '35 days'");
      if (del.rowCount) console.log('[retention] purged', del.rowCount, 'CDR rows older than 35 days');
    } catch (e) { console.error('[retention]', e.message); }
    await sleep(3600000); // hourly check
  }
}
// === EOF: loops.js ===
