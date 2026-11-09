const R = require('express').Router();
const jwt = require('jsonwebtoken');
const C = require('../config');
const { q } = require('../db');
const lx = require('../lamix');
const sse = require('../sse');
const A = require('../auth');
const ok = (res, d = {}) => res.json({ ok: true, ...d });

// ── Silent LaMix client lookup (cached 30s) ──
let _lamixCache = { ts: 0, clients: [] };
async function getLaMixClients() {
  if (Date.now() - _lamixCache.ts < 30000 && _lamixCache.clients.length) return _lamixCache.clients;
  const data = await lx.get('/clients', { limit: 500 });
  if (data._error || data._rateLimited) return _lamixCache.clients; // return stale on failure
  _lamixCache = { ts: Date.now(), clients: data.records || data.clients || [] };
  return _lamixCache.clients;
}

async function lookupLaMixClient(username) {
  const clients = await getLaMixClients();
  const want = String(username).toLowerCase();
  const found = clients.find(c =>
    String(c.username || '').toLowerCase() === want || String(c.name || '').toLowerCase() === want
  );
  return found ? { clientId: found.username, clientName: found.name || found.username } : null;
}

// ──────────────────────────────────────────────────────────────
// LOGIN FLOW:
// 1. Check user_creds → has password? → verify → session
// 2. user_creds exists but NO password → firstLogin (create screen)
// 3. Not in user_creds → silent LaMix check → write row → firstLogin
// 4. Not anywhere → "User not found"
// ──────────────────────────────────────────────────────────────
R.post('/api/login', async (req, res) => {
  const raw = String(req.body.username || '').trim();
  const pass = String(req.body.password || '');
  if (!raw) return res.status(400).json({ ok: false, error: 'Username required' });
  const want = raw.toLowerCase();

  // ── Step 1: Check local DB ──
  const c = await q("SELECT * FROM user_creds WHERE username=$1", [want]);

  if (c.rows[0]) {
    // User exists in our DB
    if (c.rows[0].pass_hash) {
      // Has password → must verify
      if (!pass) return res.status(400).json({ ok: false, error: 'Password required' });
      if (!A.verifyPassword(pass, c.rows[0].pass_hash)) {
        return res.status(401).json({ ok: false, error: 'Incorrect password. Try to reset.' });
      }
      // ✅ Login success
      const u = { username: raw, clientId: c.rows[0].client_id || want, clientName: c.rows[0].client_name || raw, panelNum: 1 };
      return ok(res, { session: A.signToken(u), username: raw, clientId: u.clientId, clientName: u.clientName, redirect: '/new/' });
    } else {
      // Exists but NO password → must create one (first login)
      return ok(res, {
        firstLogin: true,
        username: raw,
        clientId: c.rows[0].client_id || want,
        clientName: c.rows[0].client_name || raw
      });
    }
  }

  // ── Step 2: Not in user_creds → silently check LaMix ──
  const lamix = await lookupLaMixClient(raw);
  if (lamix) {
    // Found in LaMix → write to DB instantly (no password yet)
    await q(
      "INSERT INTO user_creds (username, client_id, client_name, updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (username) DO UPDATE SET client_id=$2, client_name=$3, updated_at=NOW()",
      [want, lamix.clientId, lamix.clientName]
    );
    return ok(res, {
      firstLogin: true,
      username: raw,
      clientId: lamix.clientId,
      clientName: lamix.clientName
    });
  }

  // ── Step 3: Not found anywhere ──
  return res.status(401).json({ ok: false, error: 'User not found. Check the username.' });
});

// ──────────────────────────────────────────────────────────────
// SET PASSWORD (first-time activation)
// Requires: username, password, recovery PIN
// ──────────────────────────────────────────────────────────────
R.post('/api/auth/set-password', async (req, res) => {
  const { username, clientId, clientName, password, recovery } = req.body;
  if (!username) return res.status(400).json({ ok: false, error: 'Username required' });
  if (!password || String(password).length < 6) return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
  if (!recovery || String(recovery).length < 4) return res.status(400).json({ ok: false, error: 'Recovery PIN required (min 4 chars). It is the ONLY way to reset later.' });

  const un = String(username).toLowerCase();

  // Verify user exists (either in user_creds or LaMix)
  const existing = await q("SELECT username FROM user_creds WHERE username=$1", [un]);
  if (!existing.rows[0]) {
    // Check LaMix one more time before creating
    const lamix = await lookupLaMixClient(un);
    if (!lamix) return res.status(404).json({ ok: false, error: 'User not found. Cannot set password.' });
  }

  // Save credentials + recovery hash
  await q(
    "INSERT INTO user_creds (username,pass_hash,recovery_hash,client_id,client_name,pwd_changed_at,updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT (username) DO UPDATE SET pass_hash=$2, recovery_hash=$3, client_id=$4, client_name=$5, pwd_changed_at=NOW(), updated_at=NOW()",
    [un, A.hashPassword(password), A.hashPassword(String(recovery)), clientId || un, clientName || username]
  );

  // Issue fresh session
  const u = { username, clientId: clientId || un, clientName: clientName || username, panelNum: 1 };
  return ok(res, { session: A.signToken(u), username, clientId: u.clientId, clientName: u.clientName, redirect: '/new/' });
});

// ──────────────────────────────────────────────────────────────
// FORGOT PASSWORD (reset via recovery PIN)
// ──────────────────────────────────────────────────────────────
R.post('/api/auth/forgot-password', async (req, res) => {
  const { username, recovery, newPassword } = req.body;
  if (!username || !recovery || !newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ ok: false, error: 'All fields required (password min 6).' });
  }
  const un = String(username).toLowerCase();
  const c = await q("SELECT * FROM user_creds WHERE username=$1", [un]);
  if (!c.rows[0] || !c.rows[0].recovery_hash) {
    return res.status(401).json({ ok: false, error: 'Reset not available for this account.' });
  }
  if (!A.verifyPassword(recovery, c.rows[0].recovery_hash)) {
    return res.status(401).json({ ok: false, error: 'Incorrect recovery PIN.' });
  }
  await q("UPDATE user_creds SET pass_hash=$2, pwd_changed_at=NOW(), updated_at=NOW() WHERE username=$1", [un, A.hashPassword(newPassword)]);
  return ok(res, { message: 'Password reset successfully. Sign in now.' });
});

// ──────────────────────────────────────────────────────────────
// CHANGE PASSWORD (authenticated)
// ──────────────────────────────────────────────────────────────
R.post('/api/auth/change-password', A.verify, async (req, res) => {
  const un = String(req.user.username || '').toLowerCase();
  const oldP = String(req.body.oldPassword || ''), newP = String(req.body.newPassword || '');
  if (!newP || newP.length < 6) return res.status(400).json({ ok: false, error: 'New password must be at least 6 characters.' });

  const c = await q("SELECT * FROM user_creds WHERE username=$1", [un]);
  if (!c.rows[0] || !c.rows[0].pass_hash) return res.status(404).json({ ok: false, error: 'No password set yet.' });
  if (!A.verifyPassword(oldP, c.rows[0].pass_hash)) return res.status(401).json({ ok: false, error: 'Current password is incorrect.' });

  await q("UPDATE user_creds SET pass_hash=$2, pwd_changed_at=NOW(), updated_at=NOW() WHERE username=$1", [un, A.hashPassword(newP)]);
  return ok(res, { message: 'Password updated. All other sessions signed out.' });
});

// ── Role / Logout / Ping / Stream / Internal ──
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
