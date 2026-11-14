// ZAMIL v3 — single monolith: API + daemons + SSE + static (classic + new UI).
process.env.TZ = process.env.TZ || 'UTC';   // pg parses naive timestamps in local TZ → keep math deterministic
const path = require('path');
const express = require('express');
require('./safe').install();                // MUST run before any route file is required
const C = require('./config');
const { pool } = require('./db');
const sse = require('./sse');
const loops = require('./loops');
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*'); next(); });

// ── API routes ──
app.use(require('./routes/public'));
app.use(require('./routes/user'));
app.use(require('./routes/alloc'));
app.use(require('./routes/admin'));
app.use(require('./routes/scc'));
app.use(require('./routes/notifs'));
app.post('/api/missions/import-csv', express.text({ limit: '30mb', type: 'text/csv' }), (req, res, next) => next());
app.use(require('./routes/missions'));

// ── Static: NEW React UI at /new, CLASSIC vanilla at / ──
app.use('/new', express.static(C.STATIC_NEW, { maxAge: '1h' }));
app.get(/^\/new(\/.*)?$/, (req, res) => res.sendFile(path.join(C.STATIC_NEW, 'index.html')));
app.use(express.static(C.STATIC_CLASSIC, { maxAge: 0, index: 'index.html' }));
app.get(/^\/dashboard\/?$/i, (q, s) => s.redirect(301, '/dashboard/dashboard.html'));
app.use((q, s, n) => {
  if (q.url.startsWith('/api')) return s.status(404).json({ ok: false, error: 'Route not found' });
  if (q.method === 'GET' && String(q.headers.accept || '').includes('text/html') && q.url !== '/') return s.redirect(301, '/dashboard/dashboard.html');
  s.status(404).send('Not found');
});

// ── last resort: thrown / rejected handlers land here instead of hanging ──
app.use((err, req, res, next) => {
  console.error('[api-error]', req.method, req.originalUrl, (err && err.message) || err);
  if (res.headersSent) return next(err);
  if (String(req.originalUrl || '').startsWith('/api')) return res.status(500).json({ ok: false, error: 'Server error — please retry' });
  res.status(500).send('Server error');
});

const server = app.listen(C.PORT, C.HOST, () => console.log('🚀 ZAMIL v3 on ' + C.HOST + ':' + C.PORT));
if (C.DAEMONS) { loops.start(); loops.dailyTruncationLoop(); }

// ── Graceful shutdown: close SSE first, otherwise server.close() never returns ──
function shutdown(sig) {
  console.log('[shutdown] ' + sig + ' — draining…');
  try { sse.closeAll(); } catch (e) {}
  try { server.closeIdleConnections && server.closeIdleConnections(); } catch (e) {}
  server.close(() => { pool.end(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 9000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', e => console.error('[unhandled]', e && e.message));
