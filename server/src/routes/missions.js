const R = require('express').Router();
const crypto = require('crypto');
const { q } = require('../db');
const A = require('../auth');
const ok = (res, d = {}) => res.json({ ok: true, ...d });
const normT = s => String(s == null ? '' : s).replace('T', ' ').replace(/\.\d+/, '').replace(/(Z|[+-]\d{2}:?\d{2})$/, '').trim();

function parseCSV(text){
  const lines = String(text).split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { rows: [], hdr: [], delim: '?' };
  const first = lines[0];
  const cnt = { '\t': (first.match(/\t/g) || []).length, ',': (first.match(/,/g) || []).length, ';': (first.match(/;/g) || []).length, '|': (first.match(/\|/g) || []).length };
  let delim = ',', best = 0; for (const k in cnt) if (cnt[k] > best) { best = cnt[k]; delim = k; }
  const split = line => {
    if (delim === '\t' || delim === '|') return line.split(delim).map(s => s.trim());
    const out = []; let cur = '', qq = false;
    for (let i = 0; i < line.length; i++) { const ch = line[i];
      if (ch === '"') { if (qq && line[i + 1] === '"') { cur += '"'; i++; } else qq = !qq; }
      else if (ch === delim && !qq) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out.map(s => s.trim());
  };
  const hdr = split(first).map(s => s.toLowerCase());
  const alias = { date: ['date', 'time', 'timestamp'], range: ['range', 'range_name'], number: ['number', 'phone', 'msisdn', 'destination'], cli: ['cli', 'sender', 'source'], sms: ['sms', 'message', 'content', 'text'], client: ['client', 'user'] };
  const find = ns => { for (const n of ns) { const i = hdr.indexOf(n); if (i >= 0) return i; } return -1; };
  let iD = find(alias.date), iR = find(alias.range), iN = find(alias.number), iC = find(alias.cli), iS = find(alias.sms);
  if (iD < 0 || iN < 0) { iD = 0; iR = 1; iN = 2; iC = 3; iS = 4; }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = split(lines[i]); const t = c[iD], n = c[iN];
    if (!t || !n) continue;
    const sms = iS >= 0 ? c[iS] || '' : '';
    let s = String(t).trim().replace(' ', 'T');
    if (!/Z$/i.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) s += 'Z';
    const d = new Date(s); if (isNaN(d.getTime())) continue;
    rows.push({ time: normT(d.toISOString()), number: String(n), cli: iC >= 0 ? c[iC] || '' : '', client: null,
      content: sms, range: iR >= 0 ? c[iR] || '' : '', content_hash: crypto.createHash('md5').update(sms).digest('hex') });
  }
  return { rows, hdr, delim };
}

R.post('/api/missions/import-csv', A.verify, async (req, res) => {
  if ((await A.getRole(req.user.username)) !== 'super') return res.status(403).json({ ok: false, error: 'Super admin only' });
  const text = typeof req.body === 'string' ? req.body : '';
  if (!text.trim()) return res.status(400).json({ ok: false, error: 'empty CSV body' });
  const p = parseCSV(text);
  if (!p.rows.length) return ok(res, { inserted: 0, skipped: 0, total: 0 });
  let inserted = 0;
  for (let i = 0; i < p.rows.length; i += 200) {
    const r = await q("SELECT ingest_cdr($1)", [JSON.stringify(p.rows.slice(i, i + 200))]);
    inserted += r.rows[0].ingest_cdr;
  }
  ok(res, { inserted, skipped: p.rows.length - inserted, total: p.rows.length, delim: p.delim });
});

R.post('/api/missions/rewind', A.verify, async (req, res) => {
  if ((await A.getRole(req.user.username)) !== 'super') return res.status(403).json({ ok: false, error: 'Super admin only' });
  const iso = new Date().toISOString().slice(0, 10) + ' 00:00:00';   // 05:00 PKT business-day start
  await q("UPDATE cdr_state SET last_time=$1 WHERE id=1", [iso]);
  ok(res, { rewound_to: iso });
});

R.get('/api/missions/status', async (req, res) => {
  const st = await q("SELECT last_time FROM cdr_state WHERE id=1");
  const cnt = await q("SELECT COUNT(*)::int c FROM sms_cdr WHERE time >= " + "(SELECT date_trunc('day', NOW() AT TIME ZONE 'UTC'))");
  const last = st.rows[0] ? st.rows[0].last_time : null;
  ok(res, { last_time: last, cursor_age_s: last ? Math.round((Date.now() - new Date(last + 'Z').getTime()) / 1000) : null, stored_today: cnt.rows[0].c });
});
module.exports = R;
