const R = require('express').Router();
const jwt = require('jsonwebtoken');
const C = require('../config');
const { q } = require('../db');
const lx = require('../lamix');
const sse = require('../sse');
const A = require('../auth');
const ok = (res, d = {}) => res.json({ ok: true, ...d });

// ── in-memory brute-force guard (per process, self-cleaning) ──
const RL = new Map();
function hit(key, max, windowMs) {
  const now = Date.now();
  let e = RL.get(key);
  if (!e || now > e.reset) { e = { n: 0, reset: now + windowMs }; RL.set(key, e); }
  e.n++;
  if (RL.size > 8000) for (const [k, v] of RL) if (now > v.reset) RL.delete(k);
  return { blocked: e.n > max, secs: Math.max(1, Math.ceil((e.reset - now) / 1000)) };
}
const ipOf = req => String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().slice(0, 64);
const tooMany = (res, secs) => res.status(429).json({ ok: false, error: 'Too many attempts. Wait ' + secs + 's and try again.', retryAfter: secs });

// ── Silent LaMix client lookup (cached 30s, stale-on-failure) ──
let _lamixCache = { ts: 0, clients: [] };
async function getLaMixClients() {
  if (Date.now() - _lamixCache.ts < 30000 && _lamixCache.clients.length) return _lamixCache.clients;
  const data = await lx.get('/clients', { limit: 500 });
  if (data._error || data._rateLimited) return _lamixCache.clients;
  _lamixCache = { ts: Date.now(), clients: data.records || data.clients || [] };
  return _lamixCache.clients;
}
async function lookupLaMixClient(username) {
  const clients = await getLaMixClients();
  const want = String(username).toLowerCase();
  const found = clients.find(c => String(c.username || '').toLowerCase() === want)
             || clients.find(c => String(c.name || '').toLowerCase() === want);
  return found ? { clientId: found.username, clientName: found.name || found.username } : null;
}

// ── LOGIN ──
R.post('/api/login', async (req, res) => {
  const raw = String(req.body.username || '').trim();
  const pass = String(req.body.password || '');
  if (!raw) return res.status(400).json({ ok: false, error: 'Username required' });
  const want = raw.toLowerCase();

  const gi = hit('loginip:' + ipOf(req), 60, 300000);
  if (gi.blocked) return tooMany(res, gi.secs);
  const gu = hit('login:' + want, 8, 300000);
  if (gu.blocked) return tooMany(res, gu.secs);

  const c = await q("SELECT * FROM user_creds WHERE username=$1", [want]);
  if (c.rows[0]) {
    if (c.rows[0].pass_hash) {
      if (!pass) return res.status(400).json({ ok: false, error: 'Password required' });
      if (!A.verifyPassword(pass, c.rows[0].pass_hash)) {
        return res.status(401).json({ ok: false, error: 'Incorrect password. Try to reset.' });
      }
      const u = { username: raw, clientId: c.rows[0].client_id || want, clientName: c.rows[0].client_name || raw, panelNum: 1 };
      return ok(res, { session: A.signToken(u), username: raw, clientId: u.clientId, clientName: u.clientName, redirect: '/new/' });
    }
    return ok(res, { firstLogin: true, username: raw, clientId: c.rows[0].client_id || want, clientName: c.rows[0].client_name || raw });
  }

  const lamix = await lookupLaMixClient(raw);
  if (lamix) {
    await q("INSERT INTO user_creds (username, client_id, client_name, updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (username) DO UPDATE SET client_id=$2, client_name=$3, updated_at=NOW()",
      [want, lamix.clientId, lamix.clientName]);
    return ok(res, { firstLogin: true, username: raw, clientId: lamix.clientId, clientName: lamix.clientName });
  }
  return res.status(401).json({ ok: false, error: 'User not found. Check the username.' });
});

// ── SET PASSWORD — first-time activation ONLY ──
// FIX 1: refuses when a password already exists (was a full account-takeover hole).
// FIX 2: clientId/clientName come from DB/LaMix, never from the request body (they scope data access).
R.post('/api/auth/set-password', async (req, res) => {
  const { username, password, recovery } = req.body;
  if (!username) return res.status(400).json({ ok: false, error: 'Username required' });
  if (!password || String(password).length < 6) return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
  if (!recovery || String(recovery).length < 4) return res.status(400).json({ ok: false, error: 'Recovery PIN required (min 4 chars). It is the ONLY way to reset later.' });
  const un = String(username).toLowerCase();

  const g = hit('setpw:' + un, 6, 900000);
  if (g.blocked) return tooMany(res, g.secs);

  const ex = await q("SELECT username, pass_hash, client_id, client_name FROM user_creds WHERE username=$1", [un]);
  if (ex.rows[0] && ex.rows[0].pass_hash) {
    return res.status(403).json({ ok: false, error: 'Password already set. Use "Forgot password" with your recovery PIN.' });
  }
  let cid = ex.rows[0] && ex.rows[0].client_id;
  let cname = ex.rows[0] && ex.rows[0].client_name;
  if (!ex.rows[0] || !cid || !cname) {
    const lamix = await lookupLaMixClient(un);
    if (!ex.rows[0] && !lamix) return res.status(404).json({ ok: false, error: 'User not found. Cannot set password.' });
    cid = cid || (lamix && lamix.clientId) || un;
    cname = cname || (lamix && lamix.clientName) || un;
  }

  await q("INSERT INTO user_creds (username,pass_hash,recovery_hash,client_id,client_name,pwd_changed_at,updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT (username) DO UPDATE SET pass_hash=$2, recovery_hash=$3, client_id=$4, client_name=$5, pwd_changed_at=NOW(), updated_at=NOW()",
    [un, A.hashPassword(password), A.hashPassword(String(recovery)), cid, cname]);

  const u = { username, clientId: cid, clientName: cname, panelNum: 1 };
  return ok(res, { session: A.signToken(u), username, clientId: cid, clientName: cname, redirect: '/new/' });
});

// ── FORGOT PASSWORD (recovery PIN) ──
R.post('/api/auth/forgot-password', async (req, res) => {
  const { username, recovery, newPassword } = req.body;
  if (!username || !recovery || !newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ ok: false, error: 'All fields required (password min 6).' });
  }
  const un = String(username).toLowerCase();
  const g = hit('forgot:' + un, 6, 900000);
  if (g.blocked) return tooMany(res, g.secs);
  const gi = hit('forgotip:' + ipOf(req), 30, 900000);
  if (gi.blocked) return tooMany(res, gi.secs);

  const c = await q("SELECT * FROM user_creds WHERE username=$1", [un]);
  if (!c.rows[0] || !c.rows[0].recovery_hash) return res.status(401).json({ ok: false, error: 'Reset not available for this account.' });
  if (!A.verifyPassword(recovery, c.rows[0].recovery_hash)) return res.status(401).json({ ok: false, error: 'Incorrect recovery PIN.' });
  await q("UPDATE user_creds SET pass_hash=$2, pwd_changed_at=NOW(), updated_at=NOW() WHERE username=$1", [un, A.hashPassword(newPassword)]);
  return ok(res, { message: 'Password reset successfully. Sign in now.' });
});

// ── CHANGE PASSWORD (authenticated) ──
R.post('/api/auth/change-password', A.verify, async (req, res) => {
  const un = String(req.user.username || '').toLowerCase();
  const oldP = String(req.body.oldPassword || ''), newP = String(req.body.newPassword || '');
  if (!newP || newP.length < 6) return res.status(400).json({ ok: false, error: 'New password must be at least 6 characters.' });
  const g = hit('chpw:' + un, 10, 900000);
  if (g.blocked) return tooMany(res, g.secs);
  const c = await q("SELECT * FROM user_creds WHERE username=$1", [un]);
  if (!c.rows[0] || !c.rows[0].pass_hash) return res.status(404).json({ ok: false, error: 'No password set yet.' });
  if (!A.verifyPassword(oldP, c.rows[0].pass_hash)) return res.status(401).json({ ok: false, error: 'Current password is incorrect.' });
  await q("UPDATE user_creds SET pass_hash=$2, pwd_changed_at=NOW(), updated_at=NOW() WHERE username=$1", [un, A.hashPassword(newP)]);
  A.invalidatePwdCache(un);
  const fresh = A.signToken({ username: req.user.username, clientId: req.user.clientId, clientName: req.user.clientName, panelNum: req.user.panelNum });
  return ok(res, { session: fresh, message: 'Password updated. Other sessions signed out.' });
});

// ── Role / Logout / Ping / Health / Stream / Internal ──
R.post('/api/auth/role', A.verify, async (req, res) => ok(res, { role: await A.getRole(req.user.username), username: req.user.username }));
R.post('/api/auth/logout', (req, res) => ok(res));
R.post('/api/ping', A.verify, (req, res) => ok(res));
R.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now(), cdr: global.__cdrLast || 0 }));
R.get('/api/stream', (req, res) => {
  let u = null;
  try { u = jwt.verify(String(req.query.session || ''), C.JWT_SECRET); } catch (e) { return res.status(401).end(); }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(': connected\n\n');
  sse.add(res, u);
});
R.post('/api/internal/push', (req, res) => {
  if (req.headers['x-boat-secret'] !== C.BOAT_SECRET) return res.status(401).json({ ok: false });
  if (req.body && req.body.event) sse.broadcast(String(req.body.event));
  res.json({ ok: true });
});
R.post(/^\/api\/boats\//, (req, res) => res.json({ ok: true, skipped: true, reason: 'v3 monolith owns all loops' }));
module.exports = R;
