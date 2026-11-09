// ZAMIL v3 — DB-less dev mock (UI testing). Pure Node, zero deps.
// Mode A (default): fake seed data.  Mode B: LAMIX_API_KEY=<zero-traffic key> node dev-mock.js → hydrates from that panel, still no DB.
const http = require('http');
const PORT = 8787;
const B64 = o => Buffer.from(JSON.stringify(o)).toString('base64');
const tok = u => 'dev.' + B64({ username: u, clientId: '1', clientName: u, iat: Math.floor(Date.now() / 1000) }) + '.sig';
const nowIso = () => new Date().toISOString();
const hhmmss = d => d.toISOString().slice(11, 19);
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];

// ── in-memory store ──
const ME = { user: 'demo_user' };
const S = {
  ranges: [
    { id: 'r1', title: 'Tunisia LX 24 May', prefix: '216', country: 'Tunisia' },
    { id: 'r2', title: '970 + 972 - Palestine LX 04May', prefix: '970', country: 'Palestine' },
    { id: 'r3', title: 'Angola MX 02 Jun', prefix: '244', country: 'Angola' },
    { id: 'r4', title: 'Sri Lanka LX 11 Apr', prefix: '94', country: 'Sri Lanka' },
  ],
  mine: {},   // rangeId -> [numbers]
  free: {},   // rangeId -> [numbers]
  cdr: [], queue: [],
  notifs: [
    { id: 1, type: 'info', title: 'Welcome', body: 'Dev mock backend — UI test mode.', at: nowIso(), by: 'system', read: false, readBy: [] },
    { id: 2, type: 'success', title: 'Dock ready', body: 'Shipping dock simulated at ~20s per batch.', at: nowIso(), by: 'system', read: false, readBy: [] },
  ],
  incidents: [{ id: 1, type: 'dev', severity: 'warning', title: 'Dev mode', message: 'Running without PostgreSQL (mock).', created_at: nowIso() }],
  limits: { qty_min: 1, qty_max: 50, range_daily: 50, country_daily: 100, qtyMin: 1, qtyMax: 50, rangeDaily: 50, countryDaily: 100 },
  used: new Set(), sync: { status: 'done', fetched: 1000, expected: 1000, remaining: 0, etaSecs: 0 },
};
const CLIS = ['WhatsApp', 'Google', 'Facebook', 'TikTok', 'Telegram', 'Uber'];
const LB_USERS = ['zml_ahsan', 'zml_anns', 'zml_bilal', 'zml_hina', 'zml_omair', 'zml_sara', 'zml_tariq', 'zml_usman'];

function genNums(prefix, n, split) {
  const out = []; for (let i = 0; i < n; i++) out.push(split && i % 2 ? '972' + String(50000000 + i) : prefix + String(90000000 + i).slice(0, 8));
  return out;
}
S.mine.r1 = genNums('216', 120); S.mine.r2 = genNums('970', 80, true);
S.free.r1 = genNums('216', 300).slice(120); S.free.r3 = genNums('244', 400); S.free.r4 = genNums('94', 150);

for (let i = 0; i < 14; i++) {
  const t = new Date(Date.now() - i * rnd(4, 9) * 60000);
  S.cdr.push({ time: hhmmss(t), datetime: t.toISOString(), number: pick(S.mine.r1), cli: pick(CLIS), client: ME.user, message: 'Your ' + pick(CLIS) + ' code is ' + rnd(100000, 999999), range: 'Tunisia LX 24 May' });
}
S.queue.push({ id: 1, username: ME.user, range_id: 'r3', range_name: 'Angola MX 02 Jun', qty: 25, status: 'done', created_at: new Date(Date.now() - 300000).toISOString(), processed_at: new Date(Date.now() - 240000).toISOString(), result: { assigned: 25 } });

// ── SSE ──
const sseClients = new Set();
function ssePush(ev, data) {
  const p = 'event: ' + ev + '\ndata: ' + JSON.stringify(data || {}) + '\n\n';
  for (const r of sseClients) { try { r.write(p); } catch (e) { sseClients.delete(r); } }
}
function smsPayload() { return { ok: true, count: S.cdr.length, recent: S.cdr.slice(0, 50) }; }

// ── tickers: live OTPs + dock worker + sync sim ──
setInterval(() => {
  const t = new Date();
  S.cdr.unshift({ time: hhmmss(t), datetime: t.toISOString(), number: pick(S.mine.r1.concat(S.mine.r2)), cli: pick(CLIS), client: ME.user, message: pick(['Your verification code is ', 'G-', 'Enter code ']) + rnd(100000, 999999) + pick(['', ' to continue', '. Do not share.']), range: pick(S.ranges).title });
  ssePush('sms', smsPayload()); ssePush('lb', {});
}, 7000);
setInterval(() => {
  const p = S.queue.find(q => q.status === 'pending');
  if (p && Date.now() - new Date(p.created_at).getTime() > 20000) { p.status = 'done'; p.processed_at = nowIso(); ssePush('numbers'); }
}, 5000);

// ── helpers ──
const json = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(b); };
const ok = (res, o = {}) => json(res, 200, { ok: true, ...o });
function readBody(req) { return new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch (e) { r({}); } }); }); }
const agg = (map, rid) => ({ id: rid, title: (S.ranges.find(x => x.id === rid) || {}).title || rid, prefix: '', country: (S.ranges.find(x => x.id === rid) || {}).country || '', count: (map[rid] || []).length });

// ── routes ──
const R = {
  'POST /login': (b, res) => ok(res, { session: tok(b.username || ME.user), username: b.username || ME.user, clientId: '1', clientName: b.username || ME.user, redirect: '/new/' }),
  'POST /auth/role': (b, res) => ok(res, { role: 'super', username: ME.user }),
  'POST /auth/set-password': (b, res) => ok(res, { session: tok(b.username), username: b.username }),
  'POST /auth/forgot-password': (b, res) => ok(res, { message: 'Password reset.' }),
  'POST /auth/change-password': (b, res) => ok(res, { message: 'Password updated.' }),
  'POST /auth/logout': (b, res) => ok(res),
  'POST /ping': (b, res) => ok(res),
  'POST /ranges': (b, res) => ok(res, { ranges: Object.keys(S.mine).map(rid => agg(S.mine, rid)).filter(r => r.count) }),
  'POST /numbers': (b, res) => ok(res, { numbers: S.mine[b.rangeId] || [] }),
  'POST /smscount': (b, res) => ok(res, smsPayload()),
  'POST /smscount-range': (b, res) => ok(res, { count: b.range === 'week' ? S.cdr.length + 480 : b.range === 'month' ? S.cdr.length + 2100 : S.cdr.length, byNumber: {}, byRange: {} }),
  'POST /number-smscount': (b, res) => { const n = String(b.number || ''); const rows = S.cdr.filter(r => r.number.includes(n.slice(-6))); ok(res, { number: n, count: rows.length, recent: rows.slice(0, 8) }); },
  'POST /leaderboard': (b, res) => { const users = LB_USERS.map((u, i) => ({ username: u, count: 900 - i * 90 + rnd(0, 40) })); users.splice(4, 0, { username: ME.user, count: 505 }); ok(res, { users, me: { rank: 5, username: ME.user, count: 505 }, range: b.range || 'today', total: users.length }); },
  'POST /numbers/mark-used': (b, res) => { S.used.add(String(b.number)); ok(res, { marked: true }); },
  'POST /numbers/used-list': (b, res) => ok(res, { used: [...S.used] }),
  'POST /alloc/search-ranges': (b, res) => { const q = String(b.query || '').toLowerCase(); let list = Object.keys(S.free).filter(rid => S.free[rid].length).map(rid => { const r = S.ranges.find(x => x.id === rid); return { id: rid, title: r.title, prefix: r.prefix, country: r.country, total: S.free[rid].length, available: S.free[rid].length }; }); if (q) list = list.filter(x => (x.country + ' ' + x.title).toLowerCase().includes(q)); ok(res, { ranges: list }); },
  'POST /alloc/daily-used': (b, res) => ok(res, { country: 'Angola', rangeUsed: 0, rangeLimit: S.limits.range_daily, countryUsed: 0, countryLimit: S.limits.country_daily, remaining: S.limits.country_daily }),
  'POST /alloc/limits': (b, res) => ok(res, { limits: S.limits }),
  'POST /alloc/allocate': (b, res) => { const rid = b.rangeId, qty = Math.min(+b.quantity || 1, (S.free[rid] || []).length); if (!qty) return json(res, 400, { ok: false, error: 'No free numbers left in this range right now.' }); const nums = S.free[rid].splice(0, qty); (S.mine[rid] = S.mine[rid] || []).push(...nums); S.queue.unshift({ id: Date.now(), username: ME.user, range_id: rid, range_name: (S.ranges.find(x => x.id === rid) || {}).title, qty, status: qty > 10 ? 'pending' : 'done', created_at: nowIso(), processed_at: qty > 10 ? null : nowIso(), result: {} }); ssePush('numbers'); ssePush('ranges'); ok(res, qty > 10 ? { queued: true, allocated: qty, message: '⛵ Queued — high demand, ETA ~1 min.' } : { instant: true, allocated: qty, message: 'Delivered instantly.' }); },
  'POST /alloc/queue-list': (b, res) => ok(res, { admin: true, items: S.queue.slice(0, 50) }),
  'POST /alloc/queue-status': (b, res) => { const p = S.queue.filter(q => q.status === 'pending').length; ok(res, { totalBatches: p, myPosition: p, myEtaMins: p ? 1 : 0, globalEtaMins: p ? 1 : 0 }); },
  'POST /alloc/status': (b, res) => ok(res, { items: S.queue.slice(0, 5), isAdmin: true, total: S.queue.length }),
  'POST /range/unassign': (b, res) => { const n = (S.mine[b.rangeId] || []).length; S.free[b.rangeId] = (S.free[b.rangeId] || []).concat(S.mine[b.rangeId] || []); S.mine[b.rangeId] = []; ssePush('numbers'); ssePush('ranges'); ok(res, { removed: n, message: 'Unassigned ' + n + ' numbers' }); },
  'POST /dor/access': (b, res) => ok(res, { allowed: true }),
  'POST /dor': (b, res) => ok(res, { recent: S.cdr.map(r => ({ ...r, client: pick(LB_USERS) })) }),
  'POST /cli/gate': (b, res) => ok(res, { insights: true }),
  'POST /cli/refresh': (b, res) => ok(res),
  'POST /cli/analysis': (b, res) => { const m = {}; S.cdr.forEach(r => { (m[r.cli] = m[r.cli] || []).push(r); }); const list = Object.entries(m).map(([cli, rows], i) => ({ cli, count: rows.length * 37, lastSeen: rows[0].datetime, countries: [{ name: 'Tunisia', range: 'Tunisia LX 24 May', n: rows.length * 20 }, { name: 'Angola', range: 'Angola MX 02 Jun', n: rows.length * 17 }], samples: [{ t: rows[0].datetime, text: rows[0].message }] })).sort((a, b) => b.count - a.count); ok(res, { stats: { totalSms: S.cdr.length * 37, totalCli: list.length, topCountry: { name: 'Tunisia', n: 900 }, topCountries: [{ name: 'Tunisia', n: 900 }, { name: 'Angola', n: 640 }, { name: 'Palestine', n: 310 }] }, list }); },
  'POST /notifs/list': (b, res) => ok(res, { role: 'super', notifs: S.notifs, unread: S.notifs.filter(n => !n.read).length }),
  'POST /notifs/mark-read': (b, res) => { (b.ids || []).forEach(id => { const n = S.notifs.find(x => x.id === id); if (n) n.read = true; }); ok(res); },
  'POST /notifs/send': (b, res) => { S.notifs.unshift({ id: Date.now(), type: b.type || 'info', title: b.title || '', body: b.body || '', at: nowIso(), by: ME.user, read: false, readBy: [] }); ok(res, { pushed: true }); },
  'POST /notifs/delete': (b, res) => { S.notifs = S.notifs.filter(n => n.id !== +b.id); ok(res, { deleted: true }); },
  'POST /scc/status': (b, res) => ok(res, { timestamp: nowIso(), system: { status: 'healthy', score: 92, cdr: 'live' }, queue: { size: S.queue.filter(q => q.status === 'pending').length, oldestMin: 0, etaMins: 1, avgDoneMin: 0.4 }, cdr: { alive: true, status: 'live', lagMin: 0, perMin: 8.5, buckets: [2, 4, 3, 6, 8, 7, 9, 11, 8, 10, 12, 9] }, boats: { list: [{ id: 1, name: 'CDR', agoMin: 0, ok: true }, { id: 2, name: 'Sync', agoMin: 0, ok: true }, { id: 3, name: 'Reconcile', agoMin: 1, ok: true }, { id: 4, name: 'Queue', agoMin: 0, ok: true }, { id: 5, name: 'Clients', agoMin: 0, ok: true }], active: 5, total: 5 }, users: { online: 3, expected: 4, list: [{ u: ME.user, ago: 0 }, { u: 'zml_ahsan', ago: 2 }] }, load: { perMin: 14, lastHour: 840, buckets: [8, 12, 10, 15, 18, 14, 20, 22, 17, 19, 24, 21], users: [1, 2, 2, 3, 3, 2, 3, 4, 3, 3, 4, 3] }, daily: { today: S.cdr.length, yesterday: S.cdr.length + 40, growthPct: -9 }, numbers: { total: 1600, free: 900, assigned: 700, utilPct: 44, lastReconcile: '1m ago' }, alerts: [], incidents: S.incidents }),
  'POST /scc/broadcast': (b, res) => ok(res, { pushed: true }),
  'POST /scc/dismiss-all': (b, res) => { S.incidents = []; ok(res, { dismissed: true }); },
  'POST /admin/fleet-ranges': (b, res) => ok(res, { totalCount: S.ranges.length, ranges: S.ranges.map(r => ({ id: r.id, name: r.title, country: r.country, prefix: r.prefix, totalDbRows: (S.mine[r.id] || []).length + (S.free[r.id] || []).length, allocatedToUsers: (S.mine[r.id] || []).length, freeInPool: (S.free[r.id] || []).length, inGateway: true, activeUsersCount: (S.mine[r.id] || []).length ? 1 : 0, lastOtpAt: nowIso() })) }),
  'POST /admin/sync-progress': (b, res) => ok(res, { prog: S.sync, curve: [], hb: Date.now() }),
  'POST /admin/reconcile-status': (b, res) => ok(res, { mirror_total: 1600, mirror_assigned: 700, db_total: 700, db_assigned: 700, orphans: 0, missing: 0, junk: 0, last_sync: nowIso(), sync_status: S.sync.status }),
  'POST /admin/numsync-run': (b, res) => { S.sync = { status: 'running', fetched: 0, expected: 1600, remaining: 1600, etaSecs: 45 }; let f = 0; const t = setInterval(() => { f += 200; S.sync = { status: f >= 1600 ? 'done' : 'running', fetched: Math.min(f, 1600), expected: 1600, remaining: Math.max(0, 1600 - f), etaSecs: Math.max(0, 45 - Math.floor(f / 40)) }; if (f >= 1600) clearInterval(t); }, 1500); ok(res, { message: 'Full sync queued' }); },
  'POST /admin/range-refresh': (b, res) => ok(res, { pages: 1, seen: (S.free[b.rangeId] || []).length }),
  'POST /admin/my-clients': (b, res) => ok(res, { teams: [{ prefix: 'ZML_', admin: ME.user, label: 'Zml', count: LB_USERS.length, clients: LB_USERS.map(u => ({ id: u, username: u, name: u, pinned: false })) }, { prefix: '', admin: '—', label: 'System Generated', count: 1, clients: [{ id: 'sys_1', username: 'sys_gen_1', name: '', pinned: false }] }], total: LB_USERS.length + 1 }),
  'POST /admin/admins': (b, res) => ok(res, { admins: [{ username: 'zml_ahsan', role: 'admin', added_by: ME.user, created_at: nowIso() }] }),
  'POST /admin/promote': (b, res) => ok(res, { message: b.username + ' is now an admin' }),
  'POST /admin/demote': (b, res) => ok(res, { message: b.username + ' removed' }),
  'POST /admin/team-prefixes': (b, res) => ok(res, { prefixes: [{ prefix: 'ZML_', admin_username: ME.user, label: 'Zml' }] }),
  'POST /admin/set-prefix': (b, res) => ok(res, { message: b.prefix + ' assigned' }),
  'POST /admin/del-prefix': (b, res) => ok(res, { message: 'removed' }),
  'POST /admin/create-client': (b, res) => ok(res, { queued: true, username: (b.prefix || '') + (b.suffix || ''), message: '⛵ Queued' }),
  'POST /admin/pin-client': (b, res) => ok(res, { message: 'Pinned' }),
  'POST /admin/unpin-client': (b, res) => ok(res, { message: 'Unpinned' }),
  'POST /admin/reset-credentials': (b, res) => ok(res, { reset: true, message: 'Wiped' }),
  'POST /admin/reset-password': (b, res) => ok(res, { message: 'Set' }),
  'POST /admin/limits-get': (b, res) => ok(res, { limits: S.limits }),
  'POST /admin/limits-set': (b, res) => { S.limits = { qty_min: 1, qty_max: +b.qtyMax || 50, range_daily: +b.rangeDaily || 50, country_daily: +b.countryDaily || 100, qtyMin: 1, qtyMax: +b.qtyMax || 50, rangeDaily: +b.rangeDaily || 50, countryDaily: +b.countryDaily || 100 }; ok(res, { limits: S.limits }); },
  'POST /admin/limit-status': (b, res) => ok(res, { username: b.username, ranges: [], countries: [] }),
  'POST /admin/free-try': (b, res) => ok(res, { message: 'Freed 1 try' }),
  'POST /admin/bulk-ranges': (b, res) => ok(res, { ranges: Object.keys(S.free).filter(r => S.free[r].length).map(rid => ({ range_id: rid, name: (S.ranges.find(x => x.id === rid) || {}).title, unassigned: S.free[rid].length })) }),
  'POST /admin/bulk-queue': (b, res) => { let n = 0; (b.rangeIds || []).forEach(rid => (b.users || []).forEach(u => { S.queue.unshift({ id: Date.now() + n, username: ME.user, range_id: rid, range_name: (S.ranges.find(x => x.id === rid) || {}).title, qty: +b.perRange || 1, status: 'pending', created_at: nowIso(), result: {} }); n++; })); ok(res, { queued: n, batches: n, plan: 'mock' }); },
  'POST /admin/queue-clear': (b, res) => { const c = S.queue.filter(q => q.status === 'pending').length; S.queue.forEach(q => { if (q.status === 'pending') q.status = 'failed'; }); ok(res, { cancelled: c }); },
  'POST /admin/crush-options': (b, res) => ok(res, { options: Object.keys(S.mine).filter(r => S.mine[r].length).map(rid => ({ range_name: (S.ranges.find(x => x.id === rid) || {}).title, range_id: rid, count: S.mine[rid].length, users: 1, gone: false, live: true })), suggestions: [] }),
  'POST /admin/range-crush': (b, res) => { const rid = (S.ranges.find(x => x.title === b.rangeName) || {}).id; const n = rid ? (S.mine[rid] || []).length : 0; if (rid) S.mine[rid] = []; ssePush('numbers'); ok(res, { crushed: n, mode: b.hard ? 'deleted-all' : 'idle-only' }); },
  'POST /admin/crush-orphans': (b, res) => ok(res, { deleted: 0 }),
  'POST /admin/crush-dismiss': (b, res) => ok(res, { dismissed: true }),
  'POST /admin/team-report': (b, res) => ok(res, { teams: [{ prefix: 'ZML_', admin: ME.user, label: 'Zml', otpToday: S.cdr.length, otpWeek: S.cdr.length * 6, clients: LB_USERS.length }], hottest: { prefix: 'ZML_', otpToday: S.cdr.length }, date: nowIso().slice(0, 10) }),
  'POST /admin/target-get': (b, res) => ok(res, { config: null }),
  'POST /admin/target-set': (b, res) => ok(res, { message: 'Saved' }),
  'POST /admin/db-explorer': (b, res) => b.meta ? ok(res, { clients: [ME.user], ranges: S.ranges.map(r => r.title) }) : ok(res, { rows: S.ranges.map(r => ({ range_name: r.title, users: 1, active: (S.mine[r.id] || []).length, released: 0, junk: 0, total: (S.mine[r.id] || []).length })) }),
  'POST /admin/user-ranges': (b, res) => !b.client ? ok(res, { clients: [ME.user] }) : ok(res, { client: b.client, ranges: Object.keys(S.mine).map(rid => ({ range_name: (S.ranges.find(x => x.id === rid) || {}).title, qty: S.mine[rid].length, active: S.mine[rid].length, released: 0, junk: 0 })), total: { total: 200, active: 200 } }),
};

// ── optional LIVE hydrate from your zero-traffic panel ──
(async () => {
  const KEY = process.env.LAMIX_API_KEY; if (!KEY) return console.log('[mock] FAKE DATA mode (set LAMIX_API_KEY for live-panel mode)');
  try {
    const g = async (ep, p) => { const r = await fetch('https://panel.lamix.org/api/v1' + ep + (p ? '?' + new URLSearchParams(p) : ''), { headers: { Authorization: 'Bearer ' + KEY } }); return r.json(); };
    const rr = await g('/ranges'); const recs = (rr.ranges || rr.records || []).slice(0, 3);
    if (recs.length) { S.ranges = recs.map((r, i) => ({ id: String(r.id), title: r.name, prefix: r.prefix || '', country: r.name })); S.mine = {}; S.free = {};
      for (const r of S.ranges) { const d = await g('/numbers', { rangeId: r.id, limit: 500 }); const nums = (d.records || []).map(x => x.number); S.mine[r.id] = nums.slice(0, 100); S.free[r.id] = nums.slice(100); }
      const c = await g('/cdrs', { limit: 50 }); S.cdr = (c.records || []).map(r => ({ time: String(r.time || '').slice(11, 19) || hhmmss(new Date()), datetime: r.time, number: r.number, cli: r.cli, client: ME.user, message: r.content, range: r.range }));
      console.log('[mock] LIVE mode hydrated from panel:', S.ranges.length, 'ranges'); }
  } catch (e) { console.log('[mock] hydrate failed → fake data:', e.message); }
})();

// ── server ──
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/stream') { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.write(': connected\n'); sseClients.add(res); req.on('close', () => sseClients.delete(res)); return; }
  if (u.pathname === '/healthz') return ok(res, { mock: true });
  const body = req.method === 'POST' ? await readBody(req) : {};
  const key = req.method + ' ' + u.pathname.replace(/^\/api/, '');
  const fn = R[key];
  if (fn) return fn(body, res);
  console.warn('[mock] unhandled:', key);
  return ok(res, { _mock: true });
}).listen(PORT, '127.0.0.1', () => console.log('🧪 dev-mock on http://127.0.0.1:' + PORT + ' (no DB)'));
