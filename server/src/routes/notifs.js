const R = require('express').Router();
const { q } = require('../db');
const A = require('../auth');
const sse = require('../sse');
const ok = (res, d = {}) => res.json({ ok: true, ...d });

R.post('/api/notifs/list', A.verify, async (req, res) => {
  const un = String(req.user.username || '').toLowerCase();
  const n = await q("SELECT id, type, title, body, created_by, created_at FROM app_notifs WHERE target='*' OR target=$1 ORDER BY created_at DESC LIMIT 40", [un]);
  // only MY read marks (was pulling every user's reads → payload + privacy waste)
  const reads = await q("SELECT notif_id FROM app_notif_reads WHERE username=$1 AND notif_id = ANY($2::bigint[])", [un, n.rows.map(x => x.id)]);
  const mine = new Set(reads.rows.map(r => String(r.notif_id)));
  ok(res, {
    role: await A.getRole(un),
    notifs: n.rows.map(x => ({ id: x.id, type: x.type, title: x.title, body: x.body, at: x.created_at, by: x.created_by, read: mine.has(String(x.id)) })),
    unread: n.rows.filter(x => !mine.has(String(x.id))).length
  });
});

R.post('/api/notifs/mark-read', A.verify, async (req, res) => {
  const un = String(req.user.username || '').toLowerCase();
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(x => parseInt(x, 10)).filter(Number.isFinite).slice(0, 60);
  if (!ids.length) return ok(res, { marked: 0 });
  // only ids that exist AND are addressed to me — no more junk rows from arbitrary ids
  const r = await q("INSERT INTO app_notif_reads (username,notif_id) SELECT $1, n.id FROM app_notifs n WHERE n.id = ANY($2::bigint[]) AND (n.target='*' OR n.target=$1) ON CONFLICT DO NOTHING", [un, ids]);
  ok(res, { marked: r.rowCount });
});

R.post('/api/notifs/send', A.verify, async (req, res) => {
  if ((await A.getRole(req.user.username)) !== 'super') return res.status(403).json({ ok: false, error: 'Super admin only' });
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ ok: false, error: 'Message required' });
  const target = String(req.body.target || '*').toLowerCase();
  await q("INSERT INTO app_notifs (target,type,title,body,created_by) VALUES ($1,$2,$3,$4,$5)",
    [target, req.body.type || 'info', String(req.body.title || '').slice(0, 120), body.slice(0, 1000), req.user.username]);
  if (target === '*') sse.broadcast('notif'); else sse.pushUsers([target], 'notif');
  ok(res, { pushed: true });
});

R.post('/api/notifs/delete', A.verify, async (req, res) => {
  const _r = await A.getRole(req.user.username);
if (_r !== 'super' && _r !== 'admin') return res.status(403).json({ ok: false, error: 'Admins only' });
  const id = parseInt(req.body.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'Valid id required' });
  await q("DELETE FROM app_notif_reads WHERE notif_id=$1", [id]);
  await q("DELETE FROM app_notifs WHERE id=$1", [id]);
  sse.broadcast('notif');
  ok(res, { deleted: true });
});

module.exports = R;
