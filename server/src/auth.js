const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const C = require('./config');
const { q } = require('./db');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  try {
    if (!stored || !stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(String(pw), salt, 64).toString('hex');
    const a = Buffer.from(hash, 'hex'), b = Buffer.from(test, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
function signToken(u) {
  return jwt.sign({ username: u.username, clientId: u.clientId || '0',
    clientName: u.clientName || u.username, panelNum: u.panelNum || 1 },
    C.JWT_SECRET, { expiresIn: '7d' });
}

const _pcCache = new Map();
// jwt iat is floored to whole seconds while pwd_changed_at has ms precision.
// Without this grace a token minted in the same second as a password change is rejected.
const PWD_GRACE_MS = 1500;

async function pwdChangedAt(un) {
  const now = Date.now();
  const hit = _pcCache.get(un);
  if (hit && now - hit.at < 10000) return hit.ms;
  try {
    const r = await q("SELECT pwd_changed_at FROM user_creds WHERE username=$1", [un]);
    const ms = r.rows[0] && r.rows[0].pwd_changed_at ? new Date(r.rows[0].pwd_changed_at).getTime() : 0;
    _pcCache.set(un, { at: now, ms });
    return ms;
  } catch { _pcCache.set(un, { at: now, ms: 0 }); return 0; }
}
function invalidatePwdCache(un) {
  if (un) _pcCache.delete(String(un).toLowerCase());
  else _pcCache.clear();
}

function verify(req, res, next) {
  const t = (req.body && req.body.session) || String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (!t) return res.status(401).json({ ok: false, error: 'No session' });
  let u;
  try { u = jwt.verify(t, C.JWT_SECRET); }
  catch { return res.status(401).json({ ok: false, error: 'Session expired' }); }

  const done = () => { req.user = u; logAct(u.username, req.url); next(); };
  if (!u.iat) return done();

  pwdChangedAt(String(u.username).toLowerCase())
    .then(ms => {
      if (res.headersSent) return;
      if (ms && (u.iat * 1000 + PWD_GRACE_MS) < ms) {
        return res.status(401).json({ ok: false, error: 'Session expired — password changed.' });
      }
      done();
    })
    .catch(next); // was an unhandled rejection → request hung forever
}

const _roleCache = new Map();
async function getRole(username) {
  const u = String(username || '').toLowerCase();
  if (!u) return 'none';
  if (u === C.SUPER_ADMIN) return 'super';
  const c = _roleCache.get(u);
  if (c && Date.now() - c.ts < 30000) return c.role;
  let role = 'none';
  try { const r = await q("SELECT role FROM user_roles WHERE username=$1", [u]); if (r.rows[0]) role = r.rows[0].role; } catch (e) {}
  _roleCache.set(u, { ts: Date.now(), role });
  return role;
}
const isAdminish = r => r === 'super' || r === 'admin' || r === 'moderator';
const isFullAdmin = r => r === 'super' || r === 'admin';

const _pingTh = new Map();
function logAct(u, ep) {
  try {
    const k = String(u || '').toLowerCase(); if (!k) return;
    const now = Date.now();
    if (now - (_pingTh.get(k) || 0) < 60000) return;
    _pingTh.set(k, now);
    if (_pingTh.size > 3000) _pingTh.clear();
    q("INSERT INTO api_ping_log (username, endpoint) VALUES ($1,$2)", [k, ep]).catch(() => {});
  } catch (e) {}
}

module.exports = { hashPassword, verifyPassword, signToken, verify, getRole, isAdminish, isFullAdmin, logAct, invalidatePwdCache, roleCache: _roleCache };
