// Server-Sent Events registry, grouped per username → targeted OTP push (500-user safe).
const conns = new Map(); // uname(lower) -> Set({res,user})

function add(res, user){
  const un = String(user.username || '').toLowerCase();
  let s = conns.get(un); if (!s) { s = new Set(); conns.set(un, s); }
  const c = { res, user };
  s.add(c);
  const hb = setInterval(() => { try { res.write(': hb\n'); } catch (e) { s.delete(c); } }, 25000);
  res.on('close', () => { clearInterval(hb); s.delete(c); });
  return c;
}

function pushUsers(usernames, ev, data){
  const p = 'event: ' + ev + '\ndata: ' + JSON.stringify(data == null ? {} : data) + '\n\n';
  for (const raw of usernames) {
    const s = conns.get(String(raw).toLowerCase()); if (!s) continue;
    for (const c of s) { try { c.res.write(p); } catch (e) { s.delete(c); } }
  }
}

function broadcast(ev, data){
  const p = 'event: ' + ev + '\ndata: ' + JSON.stringify(data == null ? {} : data) + '\n\n';
  for (const s of conns.values()) for (const c of s) { try { c.res.write(p); } catch (e) { s.delete(c); } }
}

const online = () => [...conns.keys()];
module.exports = { add, pushUsers, broadcast, online };
