const R = require('express').Router();
const { q } = require('../db');
const A = require('../auth');
const ok = (res, d = {}) => res.json({ ok: true, ...d });

R.post('/api/notifs/list', A.verify, async (req, res) => {
  const un = String(req.user.username || '').toLowerCase();
  const n = await q("SELECT id, type, title, body, created_by, created_at FROM app_notifs WHERE target='*' OR target=$1 ORDER BY created_at DESC LIMIT 40", [un]);
  const reads = await q("SELECT username, notif_id FROM app_notif_reads WHERE notif_id = ANY($1)", [n.rows.map(x => x.id)]);
  const mine = new Set(reads.rows.filter(r => r.username === un).map(r => r.notif_id));
  const byNotif = {}; reads.rows.forEach(r => (byNotif[r.notif_id] = byNotif[r.notif_id] || []).push(r.username));
  ok(res, { role: await A.getRole(un),
    notifs: n.rows.map(x => ({ id: x.id, type: x.type, title: x.title, body: x.body, at: x.created_at, by: x.created_by, read: mine.has(x.id), readBy: byNotif[x.id] || [] })),
    unread: n.rows.filter(x => !mine.has(x.id)).length });
});
R.post('/api/notifs/mark-read', A.verify, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 60) : [];
  for (const id of ids) await q("INSERT INTO app_notif_reads (username,notif_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [String(req.user.username).toLowerCase(), id]);
  ok(res);
});
R.post('/api/notifs/send', A.verify, async (req, res) => {
  if ((await A.getRole(req.user.username)) !== 'super') return res.status(403).json({ ok: false, error: 'Super admin only' });
  const body = String(req.body.body || '').trim(); if (!body) return res.status(400).json({ ok: false, error: 'Message required' });
  await q("INSERT INTO app_notifs (target,type,title,body,created_by) VALUES ($1,$2,$3,$4,$5)",
    [String(req.body.target || '*').toLowerCase(), req.body.type || 'info', String(req.body.title || '').slice(0, 120), body.slice(0, 1000), req.user.username]);
  ok(res, { pushed: true });
});
R.post('/api/notifs/delete', A.verify, async (req, res) => {
  if ((await A.getRole(req.user.username)) !== 'super') return res.status(403).json({ ok: false, error: 'Super admin only' });
  const id = parseInt(req.body.id, 10); if (!id) return res.status(400).json({ ok: false, error: 'Valid id required' });
  await q("DELETE FROM app_notif_reads WHERE notif_id=$1", [id]);
  await q("DELETE FROM app_notifs WHERE id=$1", [id]);
  ok(res, { deleted: true });
});
module.exports = R;