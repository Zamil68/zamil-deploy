const R = require('express').Router();
const { q, PKT_DAY } = require('../db');
const A = require('../auth');
const sse = require('../sse');
const ok = (res, d = {}) => res.json({ ok: true, ...d });
let _cache = { ts: 0, payload: null };

R.post('/api/scc/status', A.verify, async (req, res) => {
  if (!A.isAdminish(await A.getRole(req.user.username))) return res.status(403).json({ ok: false, error: 'Admins only' });
  if (_cache.payload && Date.now() - _cache.ts < 8000) return ok(res, _cache.payload);
  const now = Date.now();
  const buck = (rows, get, step = 300000) => { const out = new Array(12).fill(0); rows.forEach(r => { const i = 11 - Math.floor((now - new Date(get(r)).getTime()) / step); if (i >= 0 && i < 12) out[i]++; }); return out; };
  const [pingHour, cdrHour, qRow, doneRow, poolRow, todayRow, yestRow, incRows] = await Promise.all([
    q("SELECT username, created_at FROM api_ping_log WHERE created_at >= NOW() - interval '60 minutes' LIMIT 3000"),
    q("SELECT time FROM sms_cdr WHERE time >= NOW() - interval '60 minutes' LIMIT 3000"),
    q("SELECT COUNT(*)::int n, MIN(created_at) t FROM alloc_queue WHERE status='pending'"),
    q("SELECT COALESCE(round(AVG(EXTRACT(EPOCH FROM (processed_at-created_at))/60),1),0)::float m FROM alloc_queue WHERE status='done' AND processed_at >= NOW() - interval '60 minutes'"),
    q("SELECT COUNT(*) FILTER (WHERE status='free')::int f, COUNT(*) FILTER (WHERE status='assigned')::int a FROM pool_numbers"),
    q("SELECT COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY),
    // FIX (CDR retention): yesterday's count comes from the otp_daily summary table,
    // because raw sms_cdr rows now live only for the current PKT day.
    q("SELECT COALESCE(SUM(count),0)::int c FROM otp_daily WHERE day = DATE(" + PKT_DAY + ") - 1"),
    q("SELECT id, type, severity, title, message, created_at FROM system_incidents WHERE status='pending' ORDER BY created_at DESC LIMIT 20")]);
  const today = todayRow.rows[0].c, yest = yestRow.rows[0].c;
  // FIX (CDR retention): Week/Month/All-Time come from otp_daily (1 tiny row per user per day) + today's live count
  const otpSum = await q("SELECT COALESCE(SUM(count) FILTER (WHERE day >= DATE(" + PKT_DAY + ") - 6),0)::int w, COALESCE(SUM(count) FILTER (WHERE day >= DATE(" + PKT_DAY + ") - 29),0)::int m, COALESCE(SUM(count),0)::int t FROM otp_daily");
  const dayRows = await q("SELECT day::text AS d, SUM(count)::int c FROM otp_daily WHERE day >= DATE(" + PKT_DAY + ") - 6 AND day < DATE(" + PKT_DAY + ") GROUP BY 1");
  const weekBuckets = [];
  for (let i = 6; i >= 0; i--) {
    if (i === 0) { weekBuckets.push(today); continue; } // today = live raw count
    const dd = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const hit = dayRows.rows.find(x => String(x.d).slice(0, 10) === dd);
    weekBuckets.push(hit ? hit.c : 0);
  }
  const cliRows = await q("SELECT client, COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY + " AND client IS NOT NULL AND client<>'' GROUP BY 1 ORDER BY 2 DESC LIMIT 300");
  const prefRows = await q("SELECT prefix FROM team_prefixes ORDER BY LENGTH(prefix) DESC");
  const teamAgg = {};
  cliRows.rows.forEach(r => { const un = String(r.client).toLowerCase(); let tk = 'SYS'; for (const p of prefRows.rows) { if (p.prefix && un.indexOf(p.prefix.toLowerCase()) === 0) { tk = p.prefix; break; } } if (!teamAgg[tk]) teamAgg[tk] = { prefix: tk, otpToday: 0, top: null }; teamAgg[tk].otpToday += r.c; if (!teamAgg[tk].top || r.c > teamAgg[tk].top.count) teamAgg[tk].top = { username: r.client, count: r.c }; });
  const teamList = Object.values(teamAgg).sort((a, b) => b.otpToday - a.otpToday).slice(0, 6);
  const G = global;
  const dbMax = await q("SELECT MAX(time) AS t FROM sms_cdr");
  const dbMs = dbMax.rows[0] && dbMax.rows[0].t ? new Date(dbMax.rows[0].t).getTime() : 0;
  const effLast = Math.max(G.__cdrLast || 0, dbMs);
  const cdrLag = effLast ? Math.round((now - effLast) / 60000) : null;
  const cdrStatus = cdrLag != null && cdrLag < 5 ? 'live' : cdrLag != null && cdrLag < 15 ? 'sleep' : 'dead';
  const daemons = [
    { id: 1, name: 'CDR', agoMin: G.__cdrHb ? Math.round((now - G.__cdrHb) / 60000) : null, ok: !!(G.__cdrHb && now - G.__cdrHb < 60000) },
    { id: 2, name: 'Sync', agoMin: G.__syncHb ? Math.round((now - G.__syncHb) / 60000) : null, ok: !!(G.__syncHb && now - G.__syncHb < 60000) },
    { id: 3, name: 'Reconcile', agoMin: G.__reconHb ? Math.round((now - G.__reconHb) / 60000) : null, ok: !!(G.__reconHb && now - G.__reconHb < 20 * 60000) },
    { id: 4, name: 'Queue', agoMin: G.__queueHb ? Math.round((now - G.__queueHb) / 60000) : null, ok: !!(G.__queueHb && now - G.__queueHb < 60000) },
    { id: 5, name: 'Clients', agoMin: G.__clientsHb ? Math.round((now - G.__clientsHb) / 60000) : null, ok: !!(G.__clientsHb && now - G.__clientsHb < 120000) }];
  const activeD = daemons.filter(d => d.ok).length;
  const onlineSet = new Set(sse.online());
  pingHour.rows.forEach(p => { if (now - new Date(p.created_at).getTime() < 600000) onlineSet.add(p.username); });
  const online = onlineSet.size;
  const lastSeen = {}; pingHour.rows.forEach(p => { const t = new Date(p.created_at).getTime(); if (now - t < 600000 && (!lastSeen[p.username] || t > lastSeen[p.username])) lastSeen[p.username] = t; });
  const activeList = Object.keys(lastSeen).map(u => ({ u, ago: Math.max(0, Math.round((now - lastSeen[u]) / 60000)) })).sort((a, b) => a.ago - b.ago).slice(0, 6);
  const userBuckets = Array.from({ length: 12 }, () => new Set()); pingHour.rows.forEach(p => { const i = 11 - Math.floor((now - new Date(p.created_at).getTime()) / 300000); if (i >= 0 && i < 12) userBuckets[i].add(p.username); });
  const qSize = qRow.rows[0].n, oldestMin = qRow.rows[0].t ? Math.round((now - new Date(qRow.rows[0].t).getTime()) / 60000) : 0;
  const pTotal = poolRow.rows[0].f + poolRow.rows[0].a;
  const alerts = [];
  if (cdrStatus === 'dead') alerts.push({ severity: 'critical', message: 'CDR stream offline (' + (cdrLag == null ? '?' : cdrLag) + 'm lag)' });
  if (activeD < daemons.length) alerts.push({ severity: 'warning', message: (daemons.length - activeD) + '/' + daemons.length + ' daemons stale' });
  if (qSize > 100) alerts.push({ severity: 'critical', message: 'Queue overload: ' + qSize });
  let score = 100;
  if (cdrStatus === 'dead') score -= 40; else if (cdrStatus === 'sleep') score -= 5;
  score -= (daemons.length - activeD) * 8;
  if (qSize > 100) score -= 20; else if (qSize > 50) score -= 10; else if (qSize > 15) score -= 5;
  score = Math.max(0, Math.min(100, score));
  if (cdrStatus === 'dead') q("INSERT INTO system_incidents (type,severity,title,message,status) SELECT 'scc_cdr_dead','critical','CDR stream dead','No CDR inserts for " + (cdrLag == null ? '?' : cdrLag) + "m.','pending' WHERE NOT EXISTS (SELECT 1 FROM system_incidents WHERE type='scc_cdr_dead' AND status='pending' AND created_at >= NOW() - interval '10 minutes')").catch(() => {});
  const payload = {
    timestamp: new Date().toISOString(),
    system: { status: alerts.some(a => a.severity === 'critical') ? 'critical' : alerts.length ? 'warning' : 'healthy', score, cdr: cdrStatus },
    queue: { size: qSize, oldestMin, etaMins: qSize ? Math.max(1, Math.ceil(qSize / 38)) : 0, avgDoneMin: doneRow.rows[0].m },
    cdr: { alive: cdrStatus !== 'dead', status: cdrStatus, lagMin: cdrLag, perMin: Math.round((cdrHour.rows.filter(r => now - new Date(r.time).getTime() < 300000).length / 5) * 10) / 10, buckets: buck(cdrHour.rows, r => r.time) },
    boats: { list: daemons, active: activeD, total: daemons.length },
    users: { online, expected: Math.max(online, Math.floor(online * 1.2)), list: activeList },
    load: { perMin: Math.round(pingHour.rows.length / 60), lastHour: pingHour.rows.length, buckets: buck(pingHour.rows, r => r.created_at), users: userBuckets.map(s => s.size) },
    daily: { today, yesterday: yest, growthPct: yest ? Math.round(((today - yest) / yest) * 100) : (today ? 100 : 0) },
    numbers: { total: pTotal, free: poolRow.rows[0].f, assigned: poolRow.rows[0].a, utilPct: pTotal ? Math.round((poolRow.rows[0].a / pTotal) * 100) : 0, lastReconcile: G.__reconHb ? Math.round((now - G.__reconHb) / 60000) + 'm ago' : 'never' },
    alerts, incidents: incRows.rows, otp: { week: otpSum.rows[0].w + today, month: otpSum.rows[0].m + today, total: otpSum.rows[0].t + today }, weekBuckets, teams: teamList };  
  _cache = { ts: Date.now(), payload };
  ok(res, payload);
});

R.post('/api/scc/broadcast', A.verify, async (req, res) => {
  if (!A.isAdminish(await A.getRole(req.user.username))) return res.status(403).json({ ok: false, error: 'Admins only' });
  await q("INSERT INTO app_notifs (target,type,title,body,created_by) VALUES ('*','system_alert',$1,$2,$3)",
    ['⚙️ ' + String(req.body.title || 'System notice'), String(req.body.message || ''), req.user.username]);
  if (req.body.id) await q("UPDATE system_incidents SET status='broadcasted' WHERE id=$1", [String(req.body.id)]);
  ok(res, { pushed: true });
});

R.post('/api/scc/dismiss-all', A.verify, async (req, res) => {
  if (!A.isAdminish(await A.getRole(req.user.username))) return res.status(403).json({ ok: false, error: 'Admins only' });
  const tp = String(req.body.type || '');
  await q("UPDATE system_incidents SET status='dismissed' WHERE status='pending'" + (tp ? ' AND type=$1' : ''), tp ? [tp] : []);
  ok(res, { dismissed: true });
});

module.exports = R;
// === EOF: scc.js ===
