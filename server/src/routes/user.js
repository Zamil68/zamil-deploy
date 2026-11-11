const R = require('express').Router();
const { q, PKT_DAY } = require('../db');
const A = require('../auth');
const sse = require('../sse');
const L = require('../loops');
const ok = (res, d = {}) => res.json({ ok: true, ...d });
const countryOf = t => { const m = String(t || '').match(/^(.+?)[\s-](?:LX|MX|RX|DC)\b/i) || String(t || '').match(/^([A-Za-z\s]+?)\d/); return (m && m[1] ? m[1] : String(t || '')).trim(); };

R.post('/api/ranges', A.verify, async (req, res) => {
  const u = req.user, alt = u.clientName || u.username;
  const r = await q("SELECT p.range_id AS id, COALESCE(r.name,p.range_id) AS title, COALESCE(r.prefix,'') AS prefix, COUNT(*)::int AS count FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id WHERE p.status='assigned' AND (LOWER(p.client_id)=LOWER($1) OR LOWER(p.client_id)=LOWER($2)) GROUP BY 1,2,3 ORDER BY 2", [u.username, alt]);
  ok(res, { ranges: r.rows.map(x => ({ id: x.id, title: x.title, prefix: x.prefix, country: countryOf(x.title), count: x.count })) });
});

R.post('/api/numbers', A.verify, async (req, res) => {
  const u = req.user, alt = u.clientName || u.username, P = [u.username, alt];
  let sql = "SELECT number FROM pool_numbers WHERE status='assigned' AND (LOWER(client_id)=LOWER($1) OR LOWER(client_id)=LOWER($2))";
  const rid = String(req.body.rangeId || ''), rt = String(req.body.rangeTitle || '');
  if (rid && rid.indexOf('r_') !== 0) { P.push(rid); sql += ' AND range_id=$3'; }
  else if (rt) { P.push(rt); sql += ' AND range_id IN (SELECT range_id FROM ranges WHERE name=$3)'; }
  L.maybeRangeRefresh(rid);
  const r = await q(sql, P);
  ok(res, { numbers: r.rows.map(x => x.number) });
});

R.post('/api/smscount', A.verify, async (req, res) => {
  const u = req.user, alt = u.clientName || u.username;
  const c = await q("SELECT COUNT(*)::int t FROM sms_cdr WHERE time >= " + PKT_DAY + " AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2))", [u.username, alt]);
  const r = await q("SELECT to_char(time AT TIME ZONE 'UTC','HH24:MI:SS') AS time, time AS datetime, number, cli, content AS message, range FROM sms_cdr WHERE time >= " + PKT_DAY + " AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2)) ORDER BY time DESC LIMIT 50", [u.username, alt]);
  ok(res, { count: c.rows[0].t, recent: r.rows });
});

// FIX (CDR retention): raw sms_cdr rows now live ONLY for the current PKT day.
// Week/Month = today's live count + stored per-user day counters in otp_daily.
R.post('/api/smscount-range', A.verify, async (req, res) => {
  const u = req.user, alt = u.clientName || u.username, rg = req.body.range;
  if (rg !== 'week' && rg !== 'month') {
    const c = await q("SELECT COUNT(*)::int t FROM sms_cdr WHERE time >= " + PKT_DAY + " AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2))", [u.username, alt]);
    return ok(res, { count: c.rows[0].t, byNumber: {}, byRange: {} });
  }
  const days = rg === 'week' ? 6 : 29;
  const r = await q(
    "SELECT (SELECT COUNT(*)::int FROM sms_cdr WHERE time >= " + PKT_DAY + " AND (LOWER(client)=LOWER($2) OR LOWER(client)=LOWER($3))) + " +
    "(SELECT COALESCE(SUM(count),0)::int FROM otp_daily WHERE day >= DATE(" + PKT_DAY + ") - $1 AND day < DATE(" + PKT_DAY + ") AND username IN (LOWER($2), LOWER($3))) AS t",
    [days, u.username, alt]);
  ok(res, { count: r.rows[0].t, byNumber: {}, byRange: {} });
});

R.post('/api/number-smscount', A.verify, async (req, res) => {
  const n = String(req.body.number || '').replace(/[^0-9]/g, '');
  if (!n) return ok(res, { number: n, count: 0, recent: [] });
  const c = await q("SELECT COUNT(*)::int t FROM sms_cdr WHERE time >= " + PKT_DAY + " AND (number=$1 OR number LIKE '%'||$1 OR number LIKE $1||'%')", [n]);
  const r = await q("SELECT to_char(time AT TIME ZONE 'UTC','HH24:MI:SS') AS time, cli, content AS message, number FROM sms_cdr WHERE time >= " + PKT_DAY + " AND (number=$1 OR number LIKE '%'||$1 OR number LIKE $1||'%') ORDER BY time DESC LIMIT 8", [n]);
  ok(res, { number: n, count: c.rows[0].t, recent: r.rows });
});

R.post('/api/leaderboard', A.verify, async (req, res) => {
  const rg = req.body.range || 'today';
  let rows = [];

  // 1. Get leaderboard data (today = live raw rows; week/month = today's live + otp_daily stored counters)
  if (rg === 'today') {
    const r = await q(
      "SELECT client AS username, COUNT(*)::int AS count FROM sms_cdr WHERE time >= " +
      PKT_DAY +
      " AND client IS NOT NULL AND client<>'' AND LOWER(client)<>'system generated' GROUP BY 1 ORDER BY 2 DESC LIMIT 50"
    );
    rows = r.rows;
  } else {
    // FIX (CDR retention): merge today's live counts with the stored per-user day counters
    const days = rg === 'week' ? 6 : 29;
    const r = await q(
      "SELECT COALESCE(t.username, p.username) AS username, (COALESCE(t.c,0) + COALESCE(p.c,0))::int AS count FROM " +
      "(SELECT LOWER(client) AS username, COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY +
      " AND client IS NOT NULL AND client<>'' AND LOWER(client)<>'system generated' GROUP BY 1) t " +
      "FULL OUTER JOIN " +
      "(SELECT username, SUM(count)::int c FROM otp_daily WHERE day >= DATE(" + PKT_DAY + ") - $1 AND day < DATE(" + PKT_DAY + ") AND username<>'system generated' GROUP BY 1) p " +
      "ON t.username = p.username ORDER BY 2 DESC LIMIT 50", [days]);
    rows = r.rows;
  }

  // 2. Read team prefixes
  const prefRows = await q(
    "SELECT prefix, label FROM team_prefixes ORDER BY LENGTH(prefix) DESC"
  );

  // 3. Build secondary team leaderboard
  const teamAgg = {};
  rows.forEach(row => {
    const un = String(row.username).toLowerCase();
    let tk = 'SYS';
    let tl = 'System Generated';
    for (const p of prefRows.rows) {
      if (p.prefix && un.startsWith(p.prefix.toLowerCase())) {
        tk = p.prefix;
        tl = p.label || p.prefix;
        break;
      }
    }
    if (!teamAgg[tk]) {
      teamAgg[tk] = {
        team: tk,
        label: tl,
        count: 0,
        top: null
      };
    }
    teamAgg[tk].count += Number(row.count) || 0;
    if (!teamAgg[tk].top || row.count > teamAgg[tk].top.count) {
      teamAgg[tk].top = {
        username: row.username,
        count: Number(row.count)
      };
    }
  });
  const secondary = Object.values(teamAgg)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 4. Find current user's rank
  // FIX ("me" matching): exact match ONLY. The old includes() check could stick the YOU badge
  // on the wrong person (e.g. 'ali' matched 'zml_alice').
  const meKeys = [
    req.user.clientName,
    req.user.username
  ].map(x => String(x || '').toLowerCase()).filter(Boolean);
  let me = null;
  const users = rows.map((row, i) => {
    const un = String(row.username).toLowerCase();
    const curRank = i + 1;
    const achs = [];
    if (curRank === 1) {
      achs.push({
        id: 'champ',
        type: 'champion',
        label: 'Champion',
        icon: '👑',
        color: 'yellow'
      });
    } else if (curRank <= 3) {
      achs.push({
        id: 'top3',
        type: 'top3',
        label: 'Top 3',
        icon: '🏅',
        color: 'cyan'
      });
    }
    const percentile = Math.max(
      1,
      Math.round((1 - curRank / Math.max(rows.length, 1)) * 100)
    );
    if (!me && meKeys.some(m => un === m)) {
      me = {
        rank: curRank,
        username: row.username,
        count: row.count,
        rankChange: 0,
        streak: 0,
        achievements: achs,
        percentile
      };
    }
    return {
      ...row,
      rank: curRank,
      prevRank: null,
      rankChange: 0,
      streak: 0,
      achievements: achs,
      percentile
    };
  });

  // 4b. FIX: user ranked OUTSIDE Top 50 → compute own count + real rank from the full set (today only)
  if (!me && rg === 'today') {
    const mc = await q("SELECT COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY + " AND (LOWER(client)=LOWER($1) OR LOWER(client)=LOWER($2))", [req.user.username, req.user.clientName || req.user.username]);
    const myCount = mc.rows[0].c;
    if (myCount > 0) {
      const rk = await q("SELECT COUNT(*)::int n FROM (SELECT 1 FROM sms_cdr WHERE time >= " + PKT_DAY + " AND client IS NOT NULL AND client<>'' AND LOWER(client)<>'system generated' GROUP BY client HAVING COUNT(*) > $1) x", [myCount]);
      const myRank = rk.rows[0].n + 1;
      me = { rank: myRank, username: req.user.username, count: myCount, rankChange: 0, streak: 0, achievements: [], percentile: Math.max(1, Math.round((1 - myRank / Math.max(rows.length, myRank, 1)) * 100)) };
    }
  }

  // 5. Find user's team prefix
  const userPrefix = prefRows.rows.find(
    p => p.prefix &&
      String(req.user.username).toLowerCase().startsWith(p.prefix.toLowerCase())
  )?.prefix || '';

  // 6. Return response
  ok(res, {
    users,
    me,
    range: rg,
    total: users.length,
    scope: 'global',
    teamName: userPrefix,
    mode: 'auto',
    secondary
  });
});

R.post('/api/numbers/mark-used', A.verify, async (req, res) => {
  const number = String(req.body.number || '').replace(/[^0-9+]/g, '');
  if (!number) return res.status(400).json({ ok: false, error: 'number required' });
  let rid = String(req.body.rangeId || ''), rname = String(req.body.rangeTitle || '');
  if (!rname) { const nr = await q("SELECT range_id, range_name FROM user_numbers WHERE number=$1 AND client=$2 LIMIT 1", [number, req.user.username]); if (nr.rows[0]) { rid = nr.rows[0].range_id || rid; rname = nr.rows[0].range_name || rname; } }
  await q("INSERT INTO number_usage (number,client,range_id,range_name,used_by,source) VALUES ($1,$2,$3,$4,$5,'copy') ON CONFLICT (number,client) DO NOTHING",
    [number, req.user.username, rid, rname, req.user.username]);
  ok(res, { marked: true });
});

R.post('/api/numbers/used-list', A.verify, async (req, res) => {
  const r = await q("SELECT number FROM number_usage WHERE client=$1 LIMIT 20000", [req.user.username]);
  ok(res, { used: r.rows.map(x => x.number) });
});

// DOR — global ops feed
// FIX: admins/super always see the DOR tab (the /api/dor data endpoint already allows them);
// normal users see it only when dor_allowed=true — backend stays in full control of visibility.
R.post('/api/dor/access', A.verify, async (req, res) => {
  const un = String(req.user.username).toLowerCase();
  if (A.isAdminish(await A.getRole(un))) return ok(res, { allowed: true });
  const r = await q("SELECT dor_allowed FROM user_creds WHERE username=$1", [un]);
  const allowed = r.rows[0]?.dor_allowed || false;
  ok(res, { allowed });
});

R.post('/api/dor', A.verify, async (req, res) => {
  { const _r=await A.getRole(req.user.username); const _d=await q("SELECT dor_allowed FROM user_creds WHERE username=$1",[String(req.user.username).toLowerCase()]); if(!A.isAdminish(_r) && !_d.rows[0]?.dor_allowed) return res.status(403).json({ ok:false, error:'DOR not enabled' }); }
  const r = await q("SELECT to_char(time AT TIME ZONE 'UTC','HH24:MI:SS') AS time, time AS datetime, number, cli, content AS message, client, range FROM sms_cdr WHERE time >= " + PKT_DAY + " ORDER BY time DESC LIMIT 200");
  ok(res, { recent: r.rows });
});

// CLI Insights — computed from sms_cdr (zero scraping)
R.post('/api/cli/gate', A.verify, async (req, res) => { 
  const un = String(req.user.username).toLowerCase(); 
  if (A.isAdminish(await A.getRole(un))) return ok(res, { insights: true }); 
  const r = await q("SELECT allowed FROM cli_access WHERE username=$1", [un]); 
  return ok(res, { insights: !!r.rows[0]?.allowed }); 
});

R.post('/api/cli/refresh', A.verify, (req, res) => ok(res));

R.post('/api/cli/analysis', A.verify, async (req, res) => { 
  const unG = String(req.user.username).toLowerCase(); 
  if (!A.isAdminish(await A.getRole(unG))) { 
    const g = await q("SELECT allowed FROM cli_access WHERE username=$1", [unG]); 
    if (!g.rows[0]?.allowed) return res.status(403).json({ ok: false, error: 'CLI not enabled for you' }); 
  }
  
  const tot = await q("SELECT COUNT(*)::int s, COUNT(DISTINCT cli)::int c FROM sms_cdr WHERE time >= " + PKT_DAY);
  const byCli = await q("SELECT cli, COUNT(*)::int n, MAX(time) ls FROM sms_cdr WHERE time >= " + PKT_DAY + " AND cli<>'' GROUP BY 1 ORDER BY 2 DESC LIMIT 60");
  const byCliRange = await q("SELECT cli, COALESCE(NULLIF(range,''),'Unknown') rg, COUNT(*)::int n FROM sms_cdr WHERE time >= " + PKT_DAY + " AND cli<>'' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 400");
  const samples = await q("SELECT DISTINCT ON (cli) cli, content, time FROM sms_cdr WHERE time >= " + PKT_DAY + " AND cli<>'' ORDER BY cli, time DESC");
  
  const cm = {}; const tm = {};
  byCliRange.rows.forEach(r => { (cm[r.cli] = cm[r.cli] || []).push(r); });
  samples.rows.forEach(r => { tm[r.cli] = r; });
  
  const ctryCount = {};
  byCliRange.rows.forEach(r => { const c = countryOf(r.rg); ctryCount[c] = (ctryCount[c] || 0) + r.n; });
  const topCountries = Object.entries(ctryCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, n]) => ({ name, n }));
  
  ok(res, {
    stats: { totalSms: tot.rows[0].s, totalCli: tot.rows[0].c, topCountry: topCountries[0] || null, topCountries },
    list: byCli.rows.map(r => ({ 
      cli: r.cli, 
      count: r.n, 
      lastSeen: r.ls,
      countries: (cm[r.cli] || []).slice(0, 6).map(x => ({ name: countryOf(x.rg), range: x.rg, n: x.n })),
      samples: tm[r.cli] ? [{ t: tm[r.cli].time, text: tm[r.cli].content }] : [] 
    }))
  });
});

// Stats overview (pool truth; OTP totals super/admin only) — NOTE: unused by the new UI, kept as-is
R.post('/api/stats', A.verify, async (req, res) => {
  const role = await A.getRole(req.user.username);
  const isSuper = role === 'super';
  const t = await q("SELECT COUNT(*) FILTER (WHERE status='free')::int f, COUNT(*) FILTER (WHERE status='assigned')::int a FROM pool_numbers");
  const rr = await q("SELECT p.range_id, COALESCE(r.name,p.range_id) AS name, COUNT(*) FILTER (WHERE p.status='free')::int free, COUNT(*) FILTER (WHERE p.status='assigned')::int assigned FROM pool_numbers p LEFT JOIN ranges r ON r.range_id=p.range_id GROUP BY 1,2");
  
  const cm = {};
  rr.rows.forEach(r => { 
    const c = countryOf(r.name) || 'Other'; 
    if (!cm[c]) cm[c] = { country: c, ranges: {} }; 
    if (!cm[c].ranges[r.name]) cm[c].ranges[r.name] = { range: r.name, available: 0, total: 0 }; 
    cm[c].ranges[r.name].total += r.free + r.assigned; 
    cm[c].ranges[r.name].available += r.free; 
  });
  
  const countries = Object.values(cm).map(c => ({ 
    country: c.country, 
    ranges: Object.values(c.ranges).sort((a, b) => b.available - a.available) 
  })).sort((a, b) => a.country.localeCompare(b.country));
  
  let otpToday = 0, otpWeek = 0, otpMonth = 0, mostActiveRange = '—', mostActiveCount = 0;
  if (isSuper) {
    otpToday = (await q("SELECT COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY)).rows[0].c;
    otpWeek = (await q("SELECT COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY + " - interval '6 days'")).rows[0].c;
    otpMonth = (await q("SELECT COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY + " - interval '29 days'")).rows[0].c;
    const ma = await q("SELECT COALESCE(NULLIF(range,''),'Unknown') rn, COUNT(*)::int c FROM sms_cdr WHERE time >= " + PKT_DAY + " GROUP BY 1 ORDER BY 2 DESC LIMIT 1");
    if (ma.rows[0]) { mostActiveRange = ma.rows[0].rn; mostActiveCount = ma.rows[0].c; }
  }
  
  ok(res, { 
    totalCountries: countries.length, 
    totalRanges: rr.rows.length, 
    totalNumbers: t.rows[0].f + t.rows[0].a, 
    allocated: t.rows[0].a, 
    available: t.rows[0].f, 
    otpToday, 
    otpWeek, 
    otpMonth, 
    mostActiveRange, 
    mostActiveCount, 
    countries 
  });
});

module.exports = R;
// === EOF: user.js ===
