// Single process-wide LaMix /clients cache. Admin Hub polls every 8-20s; without this
// each poll burned 2-3 requests of the 38/min budget that assign/unassign also needs.
const lx = require('./lamix');
let cache = { ts: 0, rows: [] };
let inflight = null;

async function load() {
  const d = await lx.get('/clients', { limit: 500 });
  if (!d || d._error || d._rateLimited) return null;
  const rows = (d.records || d.clients || [])
    .map(c => ({ id: c.username, username: String(c.username || ''), name: c.name || '' }))
    .filter(c => c.username);
  cache = { ts: Date.now(), rows };
  return rows;
}

async function getClients(maxAgeMs = 30000) {
  if (cache.rows.length && Date.now() - cache.ts < maxAgeMs) return cache.rows;
  if (inflight) return inflight;                 // single-flight: N callers, 1 request
  inflight = (async () => {
    try { return (await load()) || cache.rows; } // stale-on-failure beats an empty list
    finally { inflight = null; }
  })();
  return inflight;
}

async function findClient(username) {
  const want = String(username || '').toLowerCase();
  if (!want) return null;
  const rows = await getClients();
  const hit = rows.find(c => c.username.toLowerCase() === want)
           || rows.find(c => c.name.toLowerCase() === want);
  return hit ? { clientId: hit.username, clientName: hit.name || hit.username } : null;
}

module.exports = { getClients, findClient, invalidate: () => { cache.ts = 0; } };
