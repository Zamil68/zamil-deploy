// LaMix REST client — ONE pacer for the whole process.
// Budget: 38 req/min per endpoint + 1.6s min gap (LaMix hard limit 40/min + 1s).
// Two lanes: 'fast' (user-triggered assign/unassign) jumps ahead of 'bulk' (sync pagination).
const C = require('./config');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const S = {};
function st(ep){ return S[ep] || (S[ep] = { last: 0, stamps: [], waiters: [], pumping: false }); }
function take(ep, prio){
  return new Promise(resolve => {
    const s = st(ep);
    s.waiters.push({ prio: prio === 'fast' ? 1 : 0, t: Date.now(), resolve });
    pump(ep);
  });
}
async function pump(ep){
  const s = st(ep);
  if (s.pumping) return;
  s.pumping = true;
  while (s.waiters.length) {
    s.waiters.sort((a, b) => (b.prio - a.prio) || (a.t - b.t));
    const w = s.waiters[0];
    let now = Date.now();
    const gap = now - s.last;
    if (gap < C.RATE_GAP) await sleep(C.RATE_GAP - gap);
    now = Date.now();
    while (s.stamps.length && now - s.stamps[0] > 60000) s.stamps.shift();
    if (s.stamps.length >= C.RATE_CAP) { await sleep(s.stamps[0] + 60000 - now + 40); continue; }
    s.waiters.shift();
    s.last = Date.now(); s.stamps.push(s.last);
    w.resolve();
  }
  s.pumping = false;
}
async function call(ep, { params, body, prio } = {}){
  await take(ep, prio);
  const url = C.LAMIX_REST + ep + (params ? '?' + new URLSearchParams(params) : '');
  const opt = { headers: { Authorization: 'Bearer ' + C.LAMIX_KEY }, signal: AbortSignal.timeout(20000) };
  if (body) { opt.method = 'POST'; opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  try {
    let res = await fetch(url, opt);
    if (res.status === 429) {
      const ra = parseInt(res.headers.get('retry-after') || '5', 10);
      console.log('[lamix] 429 on', ep, '→ wait', ra + 's');
      await sleep(ra * 1000);
      res = await fetch(url, opt);
      if (res.status === 429) return { _rateLimited: true };
    }
    if (res.status >= 400) { const t = await res.text().catch(() => ''); return { _error: (t || '').slice(0, 200) || 'http_' + res.status, _status: res.status }; }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) return { _error: 'non_json_response' };
    return await res.json();
  } catch (e) { return { _error: e.message }; }
}
module.exports = {
  get: (ep, params, prio) => call(ep, { params, prio }),
  post: (ep, body, prio) => call(ep, { body, prio })
};