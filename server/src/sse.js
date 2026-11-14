// Server-Sent Events registry, grouped per username → targeted OTP push.
const conns = new Map(); // uname(lower) -> Set(conn)
const MAX_PER_USER = 8;

function drop(un, s, c) {
  if (c.hb) { clearInterval(c.hb); c.hb = null; }
  s.delete(c);
  if (!s.size) conns.delete(un);
  try { c.res.end(); } catch (e) {}
}

function add(res, user) {
  const un = String(user.username || '').toLowerCase();
  let s = conns.get(un); if (!s) { s = new Set(); conns.set(un, s); }
  const c = { res, user, hb: null };
  s.add(c);
  c.hb = setInterval(() => { try { res.write(': hb\n\n'); } catch (e) { drop(un, s, c); } }, 25000);
  res.on('close', () => drop(un, s, c));
  res.on('error', () => drop(un, s, c));
  if (s.size > MAX_PER_USER) { 
    const oldest = s.values().next().value; 
    if (oldest && oldest !== c) drop(un, s, oldest); 
  }
  return c;
}

const frame = (ev, data) => 'event: ' + ev + '\ndata: ' + JSON.stringify(data == null ? {} : data) + '\n\n';

function pushUsers(usernames, ev, data) {
  const p = frame(ev, data);
  for (const raw of usernames) {
    const un = String(raw).toLowerCase();
    const s = conns.get(un); if (!s || !s.size) continue;
    for (const c of [...s]) { try { c.res.write(p); } catch (e) { drop(un, s, c); } }
  }
}

function broadcast(ev, data) {
  const p = frame(ev, data);
  for (const [un, s] of [...conns]) for (const c of [...s]) { try { c.res.write(p); } catch (e) { drop(un, s, c); } }
}

const online = () => [...conns.entries()].filter(([, s]) => s.size).map(([u]) => u);

function closeAll() { 
  for (const [un, s] of [...conns]) for (const c of [...s]) drop(un, s, c); 
  conns.clear(); 
}

module.exports = { add, pushUsers, broadcast, online, closeAll };
