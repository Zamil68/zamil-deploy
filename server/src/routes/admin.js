const R = require('express').Router();
const { q, PKT_DAY } = require('../db');
const A = require('../auth');
const C = require('../config');
const lx = require('../lamix');
const sse = require('../sse');
const L = require('../loops');
const ok = (res, d = {}) => res.json({ ok: true, ...d });
const countryOf = t => { const m = String(t || '').match(/^(.+?)[\s-](?:LX|MX|RX|DC)\b/i) || String(t || '').match(/^([A-Za-z\s]+?)\d/); return (m && m[1] ? m[1] : String(t || '')).trim(); };
async function needAdmin(req, res){ const r = await A.getRole(req.user.username); if (!A.isAdminish(r)) { res.status(403).json({ ok: false, error: 'Admins only' }); return false; } return true; }
async function needSuper(req, res){ const r = await A.getRole(req.user.username); if (r !== 'super') { res.status(403).json({ ok: false, error: 'Super admin only' }); return false; } return true; }
async function prefixes(){ const r = await q("SELECT prefix, admin_username, label FROM team_prefixes ORDER BY prefix"); return r.rows; }
async function pins(){ const r = await q("SELECT username, prefix FROM client_team_pins"); const m = {}; r.rows.forEach(x => m[x.username] = x.prefix); return m; }
function prefixTeam(un, all){ const s = all.slice().sort((a, b) => b.prefix.length - a.prefix.length); for (const p of s) if (p.prefix && un.indexOf(p.prefix.toLowerCase()) === 0) return p.prefix; return ''; }
function resolveTeam(un, all, pm){ const pin = pm[un]; if (pin && all.some(p => p.prefix === pin)) return pin; return prefixTeam(un, all); }
// FIX: Return ALL prefixes for both super AND admin
function myPrefixes(role, un, all){ return all; }

R.post('/api/admin/admins', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const r = await q("SELECT username, role, added_by, created_at FROM user_roles ORDER BY created_at");
  ok(res, { admins: r.rows });
});

R.post('/api/admin/promote', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const role = await A.getRole(req.user.username);
  if (role !== 'super' && role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Only super/admin can manage roles' });
  }
  const t = String(req.body.username || '').trim().toLowerCase();
  if (!t) return res.status(400).json({ ok: false, error: 'Username required' });
  if (t === C.SUPER_ADMIN) {
    return res.status(400).json({ ok: false, error: 'Cannot modify super admin' });
  }
  await q(
    "INSERT INTO user_roles (username,role,added_by) VALUES ($1,'admin',$2) ON CONFLICT (username) DO UPDATE SET role='admin'",
    [t, req.user.username]
  );
  A.roleCache.delete(t);
  ok(res, { message: t + ' is now an admin' });
});

R.post('/api/admin/demote', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const role = await A.getRole(req.user.username);
  if (role !== 'super' && role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Only super/admin can manage roles' });
  }
  const t = String(req.body.username || '').trim().toLowerCase();
  if (!t) return res.status(400).json({ ok: false, error: 'Username required' });
  if (t === C.SUPER_ADMIN) {
    return res.status(400).json({ ok: false, error: 'Cannot modify super admin' });
  }
  await q("DELETE FROM user_roles WHERE username=$1", [t]);
  A.roleCache.delete(t);
  ok(res, { message: t + ' removed' });
});

R.post('/api/admin/team-prefixes', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const all = await prefixes();
  ok(res, { prefixes: all });
});

R.post('/api/admin/set-prefix', A.verify, async (req, res) => {
  if (!await needSuper(req, res)) return;
  const prefix = String(req.body.prefix || '').trim(), adminU = String(req.body.admin || '').trim().toLowerCase();
  if (!prefix || !adminU) return res.status(400).json({ ok: false, error: 'prefix and admin required' });
  if (!/^[A-Za-z0-9_]+$/.test(prefix)) return res.status(400).json({ ok: false, error: 'prefix: letters/numbers/underscore only' });
  await q("INSERT INTO team_prefixes (prefix,admin_username,label) VALUES ($1,$2,$3) ON CONFLICT (prefix) DO UPDATE SET admin_username=$2, label=$3", [prefix, adminU, req.body.label || '']);
  ok(res, { message: prefix + ' assigned to ' + adminU });
});

R.post('/api/admin/del-prefix', A.verify, async (req, res) => {
  if (!await needSuper(req, res)) return;
  await q("DELETE FROM team_prefixes WHERE prefix=$1", [String(req.body.prefix || '')]);
  ok(res, { message: 'removed' });
});

R.post('/api/admin/my-clients', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const role = await A.getRole(req.user.username);
  const data = await lx.get('/clients', { limit: 500 });
  let allClients = ((data.records || data.clients || []).map(c => ({ id: c.username, username: c.username, name: c.name || '' })));
  try {
    const dbf = await q("SELECT DISTINCT client AS username FROM user_numbers WHERE client IS NOT NULL AND client <> '' ORDER BY 1");
    const have = new Set(allClients.map(c => String(c.username).toLowerCase()));
    dbf.rows.forEach(r => { if (!have.has(String(r.username).toLowerCase())) allClients.push({ id: r.username, username: r.username, name: r.username }); });
  } catch (e) {}
  const all = await prefixes(), pm = await pins();
  // FIX: Return ALL clients for both super AND admin
  const scoped = allClients;
  const groups = {};
  all.forEach(p => groups[p.prefix] = { prefix: p.prefix, admin: p.admin_username, label: p.label || '', clients: [] });
  if (!groups['']) groups[''] = { prefix: '', admin: '—', label: 'System Generated', clients: [] };
  scoped.forEach(c => {
    const team = resolveTeam(c.username.toLowerCase(), all, pm);
    const key = team || '';
    c.pinned = !!pm[c.username.toLowerCase()];
    if (groups[key]) groups[key].clients.push(c);
    else if (groups['']) groups[''].clients.push(c);
  });
  const teams = Object.values(groups).map(g => ({ ...g, count: g.clients.length }));
  ok(res, { teams, total: scoped.length });
});

R.post('/api/admin/create-client', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const role = await A.getRole(req.user.username);
  let prefix = String(req.body.prefix || '').trim();
  const suffix = String(req.body.suffix || '').trim();
  const all = await prefixes();
  // FIX: Allow admins to create in any prefix
  if (!prefix) {
    if (all.length === 1) prefix = all[0].prefix;
    else return res.status(400).json({ ok: false, error: 'Select a team prefix first.' });
  }
  const username = prefix + suffix;
  if (!/^[A-Za-z0-9_]{6,15}$/.test(username)) return res.status(400).json({ ok: false, error: 'Full ID must be 6–15 chars.' });
  await q("INSERT INTO client_queue (admin_username,username,name,status) VALUES ($1,$2,$3,'pending')", [req.user.username, username, req.body.name || username]);
  ok(res, { queued: true, username, message: '⛵ Client creation queued for ' + username });
});

R.post('/api/admin/pin-client', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const username = String(req.body.username || '').trim().toLowerCase(), prefix = String(req.body.prefix || '').trim();
  if (!username || !prefix) return res.status(400).json({ ok: false, error: 'username and prefix required' });
  await q("INSERT INTO client_team_pins (username,prefix,pinned_by) VALUES ($1,$2,$3) ON CONFLICT (username) DO UPDATE SET prefix=$2", [username, prefix, req.user.username]);
  ok(res, { message: username + ' pinned to ' + prefix });
});

R.post('/api/admin/unpin-client', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  await q("DELETE FROM client_team_pins WHERE username=$1", [String(req.body.username || '').trim().toLowerCase()]);
  ok(res, { message: 'unpinned' });
});

R.post('/api/admin/reset-credentials', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const un = String(req.body.username || '').trim().toLowerCase();
  if (!un) return res.status(400).json({ ok: false, error: 'username required' });
  if (un === C.SUPER_ADMIN) return res.status(400).json({ ok: false, error: 'Cannot reset super admin' });
  const d = await q("DELETE FROM user_creds WHERE username=$1", [un]);
  if (!d.rowCount) return res.status(404).json({ ok: false, error: 'No password row found for ' + un });
  await q("INSERT INTO app_notifs (target,type,title,body,created_by) VALUES ($1,'warn','🔑 Password reset by admin','Your password was wiped by " + req.user.username + ". Set a new one on next login.',$2)", [un, req.user.username]);
  ok(res, { reset: true, username: un, message: 'Credentials wiped — they must activate on next login' });
});

R.post('/api/admin/reset-password', A.verify, async (req, res) => {
  if (!await needSuper(req, res)) return;
  const un = String(req.body.username || '').trim().toLowerCase(), pw = String(req.body.password || '');
  if (!un || pw.length < 6) return res.status(400).json({ ok: false, error: 'username + password (min 6) required' });
  await q("INSERT INTO user_creds (username,pass_hash,pwd_changed_at,updated_at) VALUES ($1,$2,NOW(),NOW()) ON CONFLICT (username) DO UPDATE SET pass_hash=$2, pwd_changed_at=NOW(), updated_at=NOW()", [un, A.hashPassword(pw)]);
  ok(res, { message: 'Password reset for ' + un });
});

R.post('/api/admin/limit-status', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const target = String(req.body.username || '').trim();
  if (!target) return res.status(400).json({ ok: false, error: 'Username required' });
  const Lim = await (async () => { const r = await q("SELECT * FROM alloc_limits WHERE id=1"); return r.rows[0] || { range_daily: 50, country_daily: 100 }; })();
  const rows = await q("SELECT id, country, range_id, range_title, qty FROM alloc_events WHERE username=$1 AND created_at >= " + PKT_DAY + " ORDER BY created_at", [target.toLowerCase()]);
  const byRange = {}, byCountry = {};
  rows.forEach(x => {
    const rk = x.range_id || x.range_title || 'Unknown';
    (byRange[rk] = byRange[rk] || { rangeId: x.range_id || '', rangeTitle: x.range_title || rk, country: x.country || '', used: 0, ids: [] }).used += x.qty;
    byRange[rk].ids.push(x.id);
    const ck = x.country || 'Unknown';
    (byCountry[ck] = byCountry[ck] || { country: ck, used: 0, ids: [] }).used += x.qty;
    byCountry[ck].ids.push(x.id);
  });
  ok(res, {
    username: target,
    ranges: Object.values(byRange).filter(o => o.used >= Lim.range_daily).map(o => ({ ...o, limit: Lim.range_daily })),
    countries: Object.values(byCountry).filter(o => o.used >= Lim.country_daily).map(o => ({ ...o, limit: Lim.country_daily }))
  });
});

R.post('/api/admin/free-try', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const target = String(req.body.username || '').trim().toLowerCase(), rowId = req.body.rowId;
  if (!target || rowId == null) return res.status(400).json({ ok: false, error: 'username and rowId required' });
  const granted = await q("SELECT COUNT(*)::int c FROM alloc_events WHERE username=$1 AND created_at >= " + PKT_DAY + " AND qty=-1", [target]);
  if (granted.rows[0].c >= 3) return res.status(400).json({ ok: false, error: 'Max +3 tries per user per day.' });
  const d = await q("DELETE FROM alloc_events WHERE id=$1 AND username=$2", [rowId, target]);
  if (!d.rowCount) return res.status(404).json({ ok: false, error: 'Row not found.' });
  ok(res, { message: 'Freed 1 try for ' + target });
});

R.post('/api/admin/limits-get', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const r = await q("SELECT * FROM alloc_limits WHERE id=1");
  ok(res, { limits: r.rows[0] || null });
});

R.post('/api/admin/limits-set', A.verify, async (req, res) => {
  if (!await needSuper(req, res)) return;
  const qm = Math.max(1, Math.min(1000, parseInt(req.body.qtyMax, 10) || 50));
  const rd = Math.max(1, Math.min(100000, parseInt(req.body.rangeDaily, 10) || 50));
  const cd = Math.max(1, Math.min(100000, parseInt(req.body.countryDaily, 10) || 100));
  await q("INSERT INTO alloc_limits (id,qty_min,qty_max,range_daily,country_daily) VALUES (1,1,$1,$2,$3) ON CONFLICT (id) DO UPDATE SET qty_max=$1, range_daily=$2, country_daily=$3", [qm, rd, cd]);
  ok(res, { limits: { qty_min: 1, qty_max: qm, range_daily: rd, country_daily: cd } });
});

R.post('/api/admin/bulk-ranges', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const r = await q("SELECT p.range_id, COALESCE(r.name,p.range_id) AS name, COUNT(*)::int AS unassigned FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id WHERE p.status='free' GROUP BY 1,2 HAVING COUNT(*)>0 ORDER BY 2 LIMIT 800");
  ok(res, { ranges: r.rows });
});

R.post('/api/admin/bulk-queue', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const me = req.user.username;
  const rangeIds = Array.isArray(req.body.rangeIds) ? req.body.rangeIds.map(String) : [];
  const users = Array.isArray(req.body.users) ? req.body.users.map(String) : [];
  const per = Math.max(1, Math.min(1000, parseInt(req.body.perRange, 10) || 0));
  if (!rangeIds.length || !users.length || !per) return res.status(400).json({ ok: false, error: 'Select ranges, users and qty (1-1000).' });
  const rr = await q("SELECT p.range_id, COALESCE(r.name,p.range_id) AS name, COUNT(*) FILTER (WHERE p.status='free')::int free FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id WHERE p.range_id = ANY($1) GROUP BY 1,2", [rangeIds]);
  const need = users.length * per;
  const short = rr.rows.filter(x => x.free < need);
  if (short.length) return ok(res, { ok: false, queued: 0, error: 'Not enough free numbers in: ' + short.map(x => x.name + ' (' + x.free + ' free < ' + need + ' needed)').join('; ') });
  let queued = 0;
  for (const rg of rr.rows) for (const u of users) {
    await q("INSERT INTO alloc_queue (username,client,range_id,range_name,qty,status) VALUES ($1,$2,$3,$4,$5,'pending')", [me, u, rg.range_id, rg.name, per]);
    queued++;
  }
  sse.broadcast('numbers');
  ok(res, { queued, batches: queued, plan: rr.rows.map(x => x.name + ' (' + x.free + ' free)').join(', ') });
});

R.post('/api/admin/queue-clear', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const r = await q("UPDATE alloc_queue SET status='failed', result='{\"error\":\"cancelled by admin\"}', processed_at=NOW() WHERE status='pending'");
  sse.broadcast('numbers');
  ok(res, { cancelled: r.rowCount });
});

R.post('/api/admin/crush-options', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const led = await q("SELECT COALESCE(NULLIF(range_name,''),'?') AS nm, COUNT(*) FILTER (WHERE status='active')::int active, COUNT(*) FILTER (WHERE status='released')::int released, COUNT(*) FILTER (WHERE status='junk')::int junk, COUNT(DISTINCT client) FILTER (WHERE status='active')::int u FROM user_numbers GROUP BY 1 ORDER BY 3 DESC");
  const pool = await q("SELECT COALESCE(r.name,p.range_id) AS nm, COUNT(*) FILTER (WHERE p.status='assigned')::int assigned, COUNT(*) FILTER (WHERE p.status='free')::int free FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id GROUP BY 1");
  const pm = {};
  pool.rows.forEach(x => pm[x.nm] = x);
  const opts = led.rows.map(r => {
    const pl = pm[r.nm] || { assigned: 0, free: 0 };
    return { range_name: r.nm, range_id: '', count: r.released + r.junk, active: r.active, users: r.u, pool_assigned: pl.assigned, pool_free: pl.free, gone: pl.assigned === 0 && pl.free === 0, live: pl.assigned > 0 };
  });
  const sugg = opts.filter(o => o.pool_assigned === 0 && o.count > 0).slice(0, 12).map(o => ({ id: 0, range_name: o.range_name, rows_alive: o.count, status: 'suggested', source: o.gone ? 'vanished' : 'returned' }));
  ok(res, { options: opts, suggestions: sugg });
});

R.post('/api/admin/range-crush', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const name = String(req.body.rangeName || '').trim();
  if (!name) return res.status(400).json({ ok: false, error: 'rangeName required' });
  const hard = !!req.body.hard;
  const cond = hard ? '' : " AND status IN ('released','junk')";
  const del = await q("DELETE FROM user_numbers WHERE range_name=$1" + cond, [name]);
  await q("INSERT INTO crush_queue (range_id,range_name,rows_alive,status,source,crushed_by,crushed_at) VALUES ('',$1,$2,'crushed','manual',$3,NOW())", [name, del.rowCount, req.user.username]);
  sse.broadcast('numbers');
  sse.broadcast('ranges');
  sse.broadcast('crush', { range: name, count: del.rowCount, by: req.user.username });
  ok(res, { crushed: del.rowCount, mode: hard ? 'deleted-all' : 'idle-only' });
});

R.post('/api/admin/crush-orphans', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const del = await q("DELETE FROM user_numbers WHERE status='junk' AND NOT EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=user_numbers.number AND p.status IN ('free','assigned'))");
  sse.broadcast('numbers');
  ok(res, { deleted: del.rowCount });
});

R.post('/api/admin/crush-dismiss', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  await q("UPDATE crush_queue SET status='dismissed' WHERE id=$1", [parseInt(req.body.id, 10) || 0]);
  ok(res, { dismissed: true });
});

R.post('/api/admin/db-explorer', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  if (req.body.meta) {
    const [c, r] = await Promise.all([
      q("SELECT DISTINCT client FROM user_numbers WHERE client IS NOT NULL AND client<>'' ORDER BY 1"),
      q("SELECT DISTINCT range_name FROM user_numbers WHERE range_name IS NOT NULL AND range_name<>'' ORDER BY 1")
    ]);
    return ok(res, { clients: c.rows.map(x => x.client), ranges: r.rows.map(x => x.range_name) });
  }
  const w = [], P = [];
  if (req.body.client) { P.push(req.body.client); w.push("u.client=$" + P.length); }
  if (req.body.range) { P.push(req.body.range); w.push("u.range_name=$" + P.length); }
  const r2 = await q("SELECT COALESCE(NULLIF(u.range_name,''),'?') AS range_name, COUNT(DISTINCT u.client)::int users, COUNT(*) FILTER (WHERE u.status='active')::int active, COUNT(*) FILTER (WHERE u.status='released')::int released, COUNT(*) FILTER (WHERE u.status='junk')::int junk, COUNT(*)::int total FROM user_numbers u " + (w.length ? 'WHERE ' + w.join(' AND ') : '') + " GROUP BY 1 ORDER BY total DESC LIMIT 200", P);
  ok(res, { rows: r2.rows });
});

R.post('/api/admin/user-ranges', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const u = String(req.body.client || '').trim();
  if (!u) {
    const c = await q("SELECT DISTINCT client FROM user_numbers WHERE client IS NOT NULL AND client<>'' ORDER BY 1 LIMIT 800");
    return ok(res, { clients: c.rows.map(x => x.client) });
  }
  const r = await q("SELECT COALESCE(NULLIF(range_name,''),'(no range)') AS range_name, COUNT(*)::int qty, COUNT(*) FILTER (WHERE status='active')::int active, COUNT(*) FILTER (WHERE status='released')::int released, COUNT(*) FILTER (WHERE status='junk')::int junk FROM user_numbers WHERE client=$1 GROUP BY 1 ORDER BY qty DESC LIMIT 400", [u]);
  const t = await q("SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status='active')::int active FROM user_numbers WHERE client=$1", [u]);
  ok(res, { client: u, ranges: r.rows, total: t.rows[0] });
});

R.post('/api/admin/fleet-ranges', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const r = await q("SELECT p.range_id AS id, COALESCE(r.name,p.range_id) AS name, COALESCE(r.prefix,'') AS prefix, COUNT(*)::int total, COUNT(*) FILTER (WHERE p.status='assigned')::int assigned, COUNT(*) FILTER (WHERE p.status='free')::int free, COUNT(DISTINCT p.client_id) FILTER (WHERE p.status='assigned')::int users, (r.name IS NOT NULL) AS in_gateway FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id GROUP BY 1,2,3,8 ORDER BY 2");
  const otp = await q("SELECT COALESCE(NULLIF(range,''),'?') rg, MAX(time) t FROM sms_cdr WHERE time >= " + PKT_DAY + " GROUP BY 1");
  const om = {};
  otp.rows.forEach(x => om[x.rg] = x.t);
  ok(res, {
    totalCount: r.rows.length,
    ranges: r.rows.map(x => ({
      id: x.id,
      name: x.name,
      country: countryOf(x.name),
      prefix: x.prefix,
      totalDbRows: x.total,
      allocatedToUsers: x.assigned,
      freeInPool: x.free,
      inGateway: x.in_gateway,
      activeUsersCount: x.users,
      lastOtpAt: om[x.name] ? new Date(om[x.name]).toISOString() : null
    }))
  });
});

R.post('/api/admin/reconcile-status', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const [p2, u, o, m, j, ls] = await Promise.all([
    q("SELECT COUNT(*) FILTER (WHERE status IN ('free','assigned'))::int t, COUNT(*) FILTER (WHERE status='assigned')::int a FROM pool_numbers"),
    q("SELECT COUNT(*)::int t, COUNT(*) FILTER (WHERE status='active')::int a FROM user_numbers"),
    q("SELECT COUNT(*)::int c FROM user_numbers u WHERE u.status='active' AND NOT EXISTS (SELECT 1 FROM pool_numbers p WHERE p.number=u.number AND p.status='assigned')"),
    q("SELECT COUNT(*)::int c FROM pool_numbers p WHERE p.status='assigned' AND NOT EXISTS (SELECT 1 FROM user_numbers u WHERE u.number=p.number AND u.status='active')"),
    q("SELECT COUNT(*)::int c FROM user_numbers WHERE status='junk'"),
    q("SELECT MAX(lamix_synced_at)::text t FROM pool_numbers")
  ]);
  const st = global.__reconState || {};
  ok(res, {
    mirror_total: p2.rows[0].t,
    mirror_assigned: p2.rows[0].a,
    db_total: u.rows[0].t,
    db_assigned: u.rows[0].a,
    orphans: o.rows[0].c,
    missing: m.rows[0].c,
    junk: j.rows[0].c,
    last_sync: ls.rows[0].t,
    sync_status: st.status || 'idle',
    fetched: st.fetched || 0,
    expected: st.expected || 0
  });
});

R.post('/api/admin/sync-progress', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const st = global.__reconState || { status: 'idle', fetched: 0, expected: 0, remaining: 0, etaSecs: 0 };
  let eta = 0;
  if (st.status === 'running' && st.etaSecs) eta = Math.max(0, st.etaSecs - Math.round((Date.now() - (st.etaAt || Date.now())) / 1000));
  ok(res, { prog: { ...st, etaSecs: eta }, curve: (global.__reconCurve || []).slice(-120), hb: global.__reconHb || 0 });
});

R.post('/api/admin/numsync-run', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  await q("UPDATE ranges SET last_num_sync=NULL");
  global.__reconDue = Date.now();
  ok(res, { message: 'Full sync rotation queued' });
});

R.post('/api/admin/range-refresh', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  let rid = String(req.body.rangeId || '');
  if (!rid && req.body.rangeName) {
    const r = await q("SELECT range_id FROM ranges WHERE name=$1", [String(req.body.rangeName)]);
    rid = r.rows[0] ? r.rows[0].range_id : '';
  }
  if (!rid) return res.status(400).json({ ok: false, error: 'rangeId or rangeName required' });
  ok(res, await L.refreshRange(rid));
});

R.post('/api/admin/team-report', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const all = await prefixes(), pm = await pins();
  const today = await q("SELECT client, COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY + " AND client IS NOT NULL GROUP BY 1");
  const week = await q("SELECT client, COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY + " - interval '6 days' AND client IS NOT NULL GROUP BY 1");
  const data = await lx.get('/clients', { limit: 500 });
  const clients = (data.records || data.clients || []).map(c => c.username);
  const tally = rows => {
    const m = {};
    rows.forEach(r => {
      const k = resolveTeam(String(r.client).toLowerCase(), all, pm) || '__none__';
      m[k] = (m[k] || 0) + r.c;
    });
    return m;
  };
  const tT = tally(today.rows), tW = tally(week.rows);
  const cC = {};
  clients.forEach(c => {
    const k = resolveTeam(String(c).toLowerCase(), all, pm) || '__none__';
    cC[k] = (cC[k] || 0) + 1;
  });
  // FIX: Show ALL teams for both super AND admin
  let teams = all.map(p => ({
    prefix: p.prefix,
    admin: p.admin_username,
    label: p.label || '',
    otpToday: tT[p.prefix] || 0,
    otpWeek: tW[p.prefix] || 0,
    clients: cC[p.prefix] || 0
  }));
  teams.push({ prefix: '', admin: '—', label: 'System Generated', otpToday: tT.__none__ || 0, otpWeek: tW.__none__ || 0, clients: cC.__none__ || 0 });
  teams.sort((a, b) => b.otpToday - a.otpToday);
  ok(res, { teams, hottest: teams[0] && teams[0].otpToday > 0 ? teams[0] : null, date: new Date().toISOString().slice(0, 10) });
});

R.post('/api/admin/target-get', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const r = await q("SELECT * FROM team_targets ORDER BY updated_at DESC LIMIT 1");
  ok(res, { config: r.rows[0] || null });
});

R.post('/api/admin/target-set', A.verify, async (req, res) => {
  if (!await needSuper(req, res)) return;
  await q("INSERT INTO team_targets (period,target_otps,reward_usd,top_n,note,updated_by) VALUES ($1,$2,$3,$4,$5,$6)",
    [req.body.period === 'weekly' ? 'weekly' : 'daily', Math.max(1, parseInt(req.body.target_otps, 10) || 1000), Math.max(0, parseFloat(req.body.reward_usd) || 0), Math.max(1, parseInt(req.body.top_n, 10) || 5), String(req.body.note || ''), req.user.username]);
  ok(res, { message: 'Target saved' });
});

R.post('/api/admin/cli-access', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const un = String(req.body.username || '').trim().toLowerCase();
  if (!un) return res.status(400).json({ ok: false, error: 'username required' });
  const allowed = req.body.allowed !== false;
  await q("INSERT INTO cli_access (username,allowed,updated_by,updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (username) DO UPDATE SET allowed=$2, updated_by=$3, updated_at=NOW()", [un, allowed, req.user.username]);
  ok(res, { username: un, allowed });
});

R.post('/api/admin/cli-access-list', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const r = await q("SELECT username, allowed, updated_by, updated_at FROM cli_access ORDER BY username");
  ok(res, { rows: r.rows });
});

R.post('/api/admin/settings-get', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const r = await q("SELECT key, value FROM kv_settings");
  const o = {};
  r.rows.forEach(x => o[x.key] = x.value);
  ok(res, { settings: o });
});

R.post('/api/admin/settings-set', A.verify, async (req, res) => {
  if (!await needSuper(req, res)) return;
  const k = String(req.body.key || ''), v = String(req.body.value || '');
  if (!k) return res.status(400).json({ ok: false, error: 'key required' });
  await q("INSERT INTO kv_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()", [k, v]);
  ok(res, { saved: true, key: k, value: v });
});

R.post('/api/admin/lift-restrictions', A.verify, async (req, res) => {
  if (!await needAdmin(req, res)) return;
  const target = String(req.body.user || '').trim();
  if (!target) return res.status(400).json({ ok: false, error: 'user required' });
  await q("DELETE FROM alloc_events WHERE username=$1 AND created_at >= " + PKT_DAY, [target.toLowerCase()]);
  ok(res, { message: 'Restrictions lifted for ' + target });
});

module.exports = R;