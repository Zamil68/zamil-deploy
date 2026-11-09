// ZAMIL v3 — single monolith: API + daemons + SSE + static (classic + new UI).
const path = require('path');
const express = require('express');
const C = require('./config');
const { pool } = require('./db');
const sse = require('./sse');
const loops = require('./loops');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', C.CORS_ORIGIN || '*'); next(); });

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

const server = app.listen(C.PORT, C.HOST, () => console.log('🚀 ZAMIL v3 on ' + C.HOST + ':' + C.PORT));
if (C.DAEMONS) { loops.start(); require("./loops").dailyTruncationLoop(); }

// ── Graceful shutdown (PM2 kill_timeout 10s) ──
function shutdown(sig){
  console.log('[shutdown] ' + sig + ' — draining…');
  server.close(() => { pool.end(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 9000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', e => console.error('[unhandled]', e && e.message));