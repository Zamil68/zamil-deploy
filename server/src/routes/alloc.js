const R = require('express').Router();
const { q, PKT_DAY } = require('../db');
const A = require('../auth');
const lx = require('../lamix');
const sse = require('../sse');
const L = require('../loops');
const ok = (res, d = {}) => res.json({ ok: true, ...d });
const countryOf = t => { const m = String(t || '').match(/^(.+?)[\s-](?:LX|MX|RX|DC)\b/i) || String(t || '').match(/^([A-Za-z\s]+?)\d/); return (m && m[1] ? m[1] : String(t || '')).trim(); };

let _limCache = null, _limAt = 0;
async function getLimits(){
  const now = Date.now();
  if (_limCache && now - _limAt < 30000) return _limCache;
  try { const r = await q("SELECT qty_min,qty_max,range_daily,country_daily FROM alloc_limits WHERE id=1"); if (r.rows[0]) { _limCache = r.rows[0]; _limAt = now; return _limCache; } } catch (e) {}
  _limCache = { qty_min: 1, qty_max: 50, range_daily: 50, country_daily: 100 }; _limAt = now; return _limCache;
}

// ── Dock daily reset: batches older than today's business day (00:00 UTC = 5:00 AM PKT) are purged (max once/min) ──
let _lastPurge = 0;
async function purgeOldQueue(){
  const now = Date.now();
  if (now - _lastPurge < 60000) return;
  _lastPurge = now;
  await q("DELETE FROM alloc_queue WHERE created_at < " + PKT_DAY).catch(() => {});
}

R.post('/api/alloc/limits', A.verify, async (req, res) => ok(res, { limits: await getLimits() }));

R.post('/api/alloc/search-ranges', A.verify, async (req, res) => {
  const qq = String(req.body.query || '').toLowerCase().trim();
  const r = await q("SELECT p.range_id AS id, COALESCE(r.name,p.range_id) AS title, COALESCE(r.prefix,'') AS prefix, COUNT(*) FILTER (WHERE p.status='free')::int AS available, COUNT(*) FILTER (WHERE p.status='assigned')::int AS assigned FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id GROUP BY 1,2,3 HAVING COUNT(*) FILTER (WHERE p.status='free') > 0 ORDER BY 2");
  const mapped = r.rows.map(x => ({ id: x.id, title: x.title, prefix: x.prefix, country: countryOf(x.title), total: x.available + x.assigned, available: x.available }));
  ok(res, { ranges: !qq ? mapped : mapped.filter(x => ((x.country || '') + ' ' + (x.title || '')).toLowerCase().indexOf(qq) >= 0) });
});

// classic-UI aliases
R.post('/api/alloc/free-ranges', A.verify, async (req, res) => {
  const r = await q("SELECT p.range_id AS id, COALESCE(r.name,p.range_id) AS title, COUNT(*) FILTER (WHERE p.status='free')::int available, COUNT(*)::int total FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id GROUP BY 1,2 HAVING COUNT(*) FILTER (WHERE p.status='free') > 0 ORDER BY 2 LIMIT 300");
  ok(res, { ranges: r.rows.map(x => ({ id: x.id, range: x.title, country: countryOf(x.title), available: x.available, total: x.total })) });
});

R.post('/api/alloc/free-numbers', A.verify, async (req, res) => {
  const rt = String(req.body.rangeTitle || '');
  const r = await q("SELECT p.number FROM pool_numbers p JOIN ranges g ON g.range_id=p.range_id WHERE p.status='free' AND g.name=$1 ORDER BY p.number LIMIT 300", [rt]);
  ok(res, { numbers: r.rows.map(x => ({ id: x.number, number: x.number })) });
});

R.post('/api/alloc/daily-used', A.verify, async (req, res) => {
  const Lim = await getLimits();
  const u = req.user.username, ctry = countryOf(req.body.rangeTitle || req.body.country || ''), rid = String(req.body.rangeId || '');
  const r = await q("SELECT country, range_id, COALESCE(SUM(qty),0)::int c FROM alloc_events WHERE username=$1 AND created_at >= " + PKT_DAY + " GROUP BY 1,2", [u]);
  let cu = 0, ru = 0; r.rows.forEach(x => { if (ctry && x.country === ctry) cu += x.c; if (rid && x.range_id === rid) ru += x.c; });
  if (u.toLowerCase() === require('../config').SUPER_ADMIN) return ok(res, { country: ctry, rangeUsed: ru, rangeLimit: 999, countryUsed: cu, countryLimit: 999, remaining: 999, exempt: true });
  ok(res, { country: ctry, rangeUsed: ru, rangeLimit: Lim.range_daily, countryUsed: cu, countryLimit: Lim.country_daily, remaining: Math.max(0, Math.min(Lim.range_daily - ru, Lim.country_daily - cu)) });
});

R.post('/api/alloc/allocate', A.verify, async (req, res) => {
  const C = require('../config');
  const { pool } = require('../db');
  const u = req.user.username, rid = String(req.body.rangeId || ''), rtitle = String(req.body.rangeTitle || ''), ctry = countryOf(rtitle);
  const Lim = await getLimits();
  const qtyReq = parseInt(req.body.quantity || req.body.qty, 10) || 0;
  const payout = parseFloat(req.body.payout) || 0.01;
  if (!rid) return res.status(400).json({ ok: false, error: 'rangeId required' });
  if (qtyReq < Lim.qty_min || qtyReq > Lim.qty_max) return ok(res, { ok: false, error: 'Quantity must be between ' + Lim.qty_min + ' and ' + Lim.qty_max + ' per allocation (admin limit).' });

  const caps = await q("SELECT country, range_id, COALESCE(SUM(qty),0)::int c FROM alloc_events WHERE username=$1 AND created_at >= " + PKT_DAY + " GROUP BY 1,2", [u]);
  let cu = 0, ru = 0; caps.rows.forEach(x => { if (x.country === ctry) cu += x.c; if (x.range_id === rid) ru += x.c; });
  if (u.toLowerCase() !== C.SUPER_ADMIN) {
    if (ru + qtyReq > Lim.range_daily) return ok(res, { limitReached: true, capType: 'range', country: ctry, used: ru, limit: Lim.range_daily, remaining: Math.max(0, Lim.range_daily - ru), message: 'Range daily limit ' + Lim.range_daily + ' reached (used ' + ru + ' today).' });
    if (cu + qtyReq > Lim.country_daily) return ok(res, { limitReached: true, capType: 'country', country: ctry, used: cu, limit: Lim.country_daily, remaining: Math.max(0, Lim.country_daily - cu), message: 'Country daily limit ' + Lim.country_daily + ' reached (used ' + cu + ' today).' });
  }

  // 1) Claim in a millisecond-short transaction. The LaMix call used to run INSIDE
  //    this transaction, holding row locks + a pool connection for up to 20s.
  let nums = [];
  const c1 = await pool.connect();
  try {
    await c1.query('BEGIN');
    const lock = await c1.query("SELECT number FROM pool_numbers WHERE range_id=$1 AND status='free' ORDER BY number LIMIT $2 FOR UPDATE SKIP LOCKED", [rid, qtyReq]);
    nums = lock.rows.map(r => r.number);
    if (nums.length) await c1.query("UPDATE pool_numbers SET status='reserved', updated_at=NOW() WHERE number = ANY($1)", [nums]);
    await c1.query('COMMIT');
  } catch (e) { await c1.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c1.release(); }
  if (!nums.length) return res.status(400).json({ ok: false, error: 'No free numbers left in this range right now.' });

  // 2) Network call with NO transaction open.
  const lr = await lx.post('/numbers/assign', { client: u, numbers: nums, clientPayoutRate: String(payout) }, 'fast');
  const failed = !!(lr && (lr._error || lr._rateLimited));

  // 3) Finalize in a second short transaction. A crash here leaves 'reserved' rows,
  //    which the queue worker reclaims after 5 minutes and reconcile re-heals.
  const c2 = await pool.connect();
  try {
    await c2.query('BEGIN');
    if (failed) {
      await c2.query("UPDATE pool_numbers SET status='free', updated_at=NOW() WHERE number = ANY($1) AND status='reserved'", [nums]);
      await c2.query("INSERT INTO alloc_queue (username,client,range_id,range_name,qty,payout_rate,status) VALUES ($1,$2,$3,$4,$5,$6,'pending')", [u, u, rid, rtitle, nums.length, payout]);
      await c2.query("INSERT INTO alloc_events (username,country,range_id,range_title,qty) VALUES ($1,$2,$3,$4,$5)", [u, ctry, rid, rtitle, nums.length]);
      await c2.query('COMMIT');
      sse.broadcast('numbers');
      return ok(res, { queued: true, allocated: nums.length, country: ctry, message: '⛵ Queued — high demand, delivering in ~1 min.' });
    }
    await c2.query("UPDATE pool_numbers SET status='assigned', client_id=$1, assigned_at=NOW(), updated_at=NOW() WHERE number = ANY($2)", [u, nums]);
    await c2.query("INSERT INTO user_numbers (number,client,range_id,range_name,status,updated_at) SELECT n,$1,$2,$3,'active',NOW() FROM UNNEST($4::text[]) n ON CONFLICT (number) DO UPDATE SET client=EXCLUDED.client, status='active', range_name=EXCLUDED.range_name, updated_at=NOW()", [u, rid, rtitle, nums]);
    await c2.query("INSERT INTO alloc_events (username,country,range_id,range_title,qty) VALUES ($1,$2,$3,$4,$5)", [u, ctry, rid, rtitle, nums.length]);
    await c2.query("INSERT INTO alloc_queue (username,client,range_id,range_name,qty,payout_rate,status,result,processed_at) VALUES ($1,$2,$3,$4,$5,$6,'done',$7,NOW())", [u, u, rid, rtitle, nums.length, payout, JSON.stringify({ assigned: nums.length, instant: true })]);
    await c2.query('COMMIT');
  } catch (e) { await c2.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c2.release(); }

  L.invalidateNc(); sse.broadcast('numbers'); sse.broadcast('ranges');
  ok(res, { instant: true, allocated: nums.length, country: ctry, used: cu + nums.length, limit: Lim.country_daily, remaining: Math.max(0, Lim.country_daily - (cu + nums.length)), message: 'Delivered instantly.' });
});

// Strictly scoped to ONE range. The old NULL/empty-range fallback clause
// released every unlabelled row the user owned, across all ranges, in a single click.
R.post('/api/range/unassign', A.verify, async (req, res) => {
  const u = req.user.username, alt = req.user.clientName || u, rid = String(req.body.rangeId || '');
  if (!rid) return res.status(400).json({ ok: false, error: 'rangeId required' });
  const rows = (await q("SELECT number FROM user_numbers WHERE status='active' AND range_id=$3 AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2))", [u, alt, rid])).rows;
  const nums = rows.map(r => r.number);
  if (!nums.length) return ok(res, { removed: 0, message: 'No numbers found in this range' });
  for (let i = 0; i < nums.length; i += 1000) {
    const lr = await lx.post('/numbers/unassign', { numbers: nums.slice(i, i + 1000) }, 'fast');
    if (lr && (lr._error || lr._rateLimited)) return res.status(500).json({ ok: false, error: 'LaMix unassign failed — retry in a moment.' });
  }
  await q("UPDATE user_numbers SET status='released', updated_at=NOW() WHERE number = ANY($1)", [nums]);
  await q("UPDATE pool_numbers SET status='free', client_id=NULL, updated_at=NOW() WHERE number = ANY($1)", [nums]);
  L.invalidateNc(); sse.broadcast('numbers'); sse.broadcast('ranges');
  ok(res, { removed: nums.length, message: 'Unassigned ' + nums.length + ' numbers' });
});

// ── Shipping Dock list: today only (00:00 UTC / 5:00 AM PKT), latest 50 ──

R.post('/api/alloc/queue-list', A.verify, async (req, res) => {
  const un = String(req.user.username || '').toLowerCase();
  const isAdmin = A.isAdminish(await A.getRole(un));
  await purgeOldQueue();
  const sql = "SELECT id, COALESCE(NULLIF(client,''),username) AS username, range_id, range_name, qty, status, created_at, processed_at, result FROM alloc_queue WHERE created_at >= " + PKT_DAY + (isAdmin ? '' : ' AND (LOWER(username)=$1 OR LOWER(client)=$1)') + " ORDER BY id DESC LIMIT 50";
  const r = await q(sql, isAdmin ? [] : [un]);
  ok(res, { admin: isAdmin, items: r.rows });
});

R.post('/api/alloc/queue-status', A.verify, async (req, res) => {
  const g = await q("SELECT COUNT(*)::int n FROM alloc_queue WHERE status='pending' AND created_at >= " + PKT_DAY);
  const m = await q("SELECT COUNT(*)::int n FROM alloc_queue WHERE status='pending' AND created_at >= " + PKT_DAY + " AND (LOWER(username)=$1 OR LOWER(client)=$1)", [req.user.username]);
  ok(res, { totalBatches: g.rows[0].n, myPosition: m.rows[0].n, myEtaMins: m.rows[0].n ? Math.max(1, Math.ceil(m.rows[0].n / 38)) : 0, globalEtaMins: Math.ceil(g.rows[0].n / 38) });
});

R.post('/api/alloc/status', A.verify, async (req, res) => {
  const r = await q("SELECT id, status, result, range_name, qty, created_at, processed_at FROM alloc_queue WHERE created_at >= " + PKT_DAY + " AND (LOWER(username)=$1 OR LOWER(client)=$1) ORDER BY id DESC LIMIT 5", [req.user.username]);
  ok(res, { items: r.rows, isAdmin: false, total: r.rows.length });
});

module.exports = R;
// === EOF: alloc.js ===
