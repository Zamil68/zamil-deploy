import React, { useEffect, useState } from "react";
import { postApi } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import ConfirmModal from "../ConfirmModal";
export default function TeamTab(){
  const { role, user } = useAuth(); const { toast } = useToast();
  const [teams, setTeams] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [prefixes, setPrefixes] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [f, setF] = useState<any>({ promo: "", pf: "", pfAdmin: "", pfLabel: "", suffix: "", prefix: "", name: "", pinUser: "", pinPrefix: "" });
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [pwTarget, setPwTarget] = useState<{ u: string; pw: string } | null>(null);
  const [report, setReport] = useState<any>(null);
  const load = async () => {
    const t = await postApi("/api/admin/my-clients"); if (t?.ok) setTeams(t.teams || []);
    if (role === "super") { const a = await postApi("/api/admin/admins"); if (a?.ok) setAdmins(a.admins || []); }
    const p = await postApi("/api/admin/team-prefixes"); if (p?.ok) setPrefixes(p.prefixes || []);
    const r = await postApi("/api/admin/team-report"); if (r?.ok) setReport(r);
  };
  useEffect(() => { load(); }, []);
  const act = async (ep: string, body: any, okMsg: string, after?: () => void) => {
    const d = await postApi(ep, body);
    toast(d?.ok ? okMsg : d?.error || "Failed", d?.ok ? "ok" : "err");
    if (d?.ok) { after ? after() : load(); }
    return d;
  };
  return <div>
    {role === "super" && <div className="card p-4 mb-3">
      <div className="micro mb-2">Promote / Demote admins</div>
      <div className="flex gap-2 mb-3">
        <input className="input flex-1" placeholder="LaMix username" value={f.promo} onChange={e => setF({ ...f, promo: e.target.value })} />
        <button className="btn btn-primary" onClick={() => act("/api/admin/promote", { username: f.promo }, f.promo + " is now admin", () => { setF({ ...f, promo: "" }); load(); })}>Promote</button>
      </div>
      {admins.map(a => <div key={a.username} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
        <span className="text-xs font-extrabold flex-1 truncate">{a.username}</span>
        <span className="chip !text-[9px]">{a.role}</span>
        {a.username !== user?.username && <button className="btn btn-danger !py-1 !px-2 !text-[10px]" onClick={() => act("/api/admin/demote", { username: a.username }, "Removed " + a.username)}>Remove</button>}
      </div>)}
    </div>}
    {role === "super" && <div className="card p-4 mb-3">
      <div className="micro mb-2">Team prefixes</div>
      <div className="flex gap-2 mb-2 flex-wrap">
        <input className="input flex-1 min-w-[90px]" placeholder="Prefix e.g. ZML_" value={f.pf} onChange={e => setF({ ...f, pf: e.target.value })} />
        <input className="input flex-1 min-w-[90px]" placeholder="admin username" value={f.pfAdmin} onChange={e => setF({ ...f, pfAdmin: e.target.value })} />
        <input className="input flex-1 min-w-[90px]" placeholder="Display name" value={f.pfLabel} onChange={e => setF({ ...f, pfLabel: e.target.value })} />
        <button className="btn btn-primary" onClick={() => act("/api/admin/set-prefix", { prefix: f.pf, admin: f.pfAdmin, label: f.pfLabel }, "Prefix assigned")}>Assign</button>
      </div>
      {prefixes.map(p => <div key={p.prefix} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
        <span className="mono text-xs font-extrabold">{p.prefix}</span>
        <span className="text-[10px] text-[var(--muted)] font-semibold flex-1">{p.admin_username}{p.label ? " · " + p.label : ""}</span>
        <button className="btn btn-danger !py-1 !px-2 !text-[10px]" onClick={() => act("/api/admin/del-prefix", { prefix: p.prefix }, "Removed " + p.prefix)}>✕</button>
      </div>)}
    </div>}
    <div className="card p-4 mb-3">
      <div className="micro mb-2">Create a new ID</div>
      <div className="flex gap-2 mb-2 flex-wrap">
        <select className="input !w-auto flex-1 min-w-[110px]" value={f.prefix} onChange={e => setF({ ...f, prefix: e.target.value })}>
          <option value="">Prefix…</option>{prefixes.map(p => <option key={p.prefix} value={p.prefix}>{p.prefix}</option>)}
        </select>
        <input className="input flex-1 min-w-[110px]" placeholder="Suffix e.g. Ahsan" value={f.suffix} onChange={e => setF({ ...f, suffix: e.target.value })} />
        <input className="input flex-1 min-w-[110px]" placeholder="Display name (opt)" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      </div>
      <div className="text-[10px] text-[var(--muted)] font-semibold mb-2">Full ID = prefix + suffix · 6–15 chars · queued to LaMix</div>
      <button className="btn btn-primary w-full" onClick={() => act("/api/admin/create-client", { prefix: f.prefix, suffix: f.suffix, name: f.name }, "⛵ Queued client creation", () => { setF({ ...f, suffix: "", name: "" }); load(); })}>Create ID</button>
    </div>
    <div className="card p-4 mb-3">
      <div className="micro mb-2">Pin existing user to a team</div>
      <div className="flex gap-2">
        <select className="input !w-auto flex-1" value={f.pinPrefix} onChange={e => setF({ ...f, pinPrefix: e.target.value })}>
          <option value="">Team…</option>{prefixes.map(p => <option key={p.prefix} value={p.prefix}>{p.prefix}</option>)}
        </select>
        <input className="input flex-1" placeholder="Exact username" value={f.pinUser} onChange={e => setF({ ...f, pinUser: e.target.value })} />
        <button className="btn btn-primary" onClick={() => act("/api/admin/pin-client", { username: f.pinUser, prefix: f.pinPrefix }, "Pinned " + f.pinUser, () => { setF({ ...f, pinUser: "" }); load(); })}>Pin</button>
      </div>
    </div>
    <div className="micro mb-1.5">Teams · {teams.reduce((s, t) => s + t.count, 0)} clients</div>
    {teams.map(t => <div key={t.prefix || "__sys"} className="card mb-2 overflow-hidden">
      <div className="flex items-center gap-2 p-3 cursor-pointer" onClick={() => setOpen(o => o === (t.prefix || "__sys") ? null : (t.prefix || "__sys"))}>
        <span className="text-[13px] font-extrabold flex-1 truncate">{t.prefix ? t.prefix + (t.label ? " · " + t.label : "") : "System Generated"} <span className="text-[10px] text-[var(--muted)] font-semibold">{t.prefix ? t.admin : "—"}</span></span>
        <span className="chip mono !text-[10px] text-[var(--accent)]">{t.count}</span>
        <span className="text-[var(--muted)]" style={{ transform: open === (t.prefix || "__sys") ? "rotate(180deg)" : "" }}>▾</span>
      </div>
      {open === (t.prefix || "__sys") && <div className="border-t border-[var(--border)] p-2 a-fade">
        {!t.clients.length && <div className="text-[11px] text-[var(--muted)] font-semibold p-2">No clients yet</div>}
        {t.clients.map((c: any) => <div key={c.username} className="flex items-center gap-2 py-2 px-1 border-b border-[var(--border)] last:border-0 flex-wrap">
          <div className="flex-1 min-w-[120px]"><div className="text-xs font-bold truncate">{c.username} {c.pinned && <span className="chip !text-[8px] text-[var(--accent)]">📌 pinned</span>}</div>
            <div className="text-[10px] text-[var(--muted)] font-semibold">ID {c.id}</div></div>
          {!t.prefix && <button className="btn btn-ghost !py-1 !px-2 !text-[10px]" onClick={() => setF({ ...f, pinUser: c.username })}>📌 Pin</button>}
          {c.pinned && <button className="btn btn-ghost !py-1 !px-2 !text-[10px]" onClick={() => act("/api/admin/unpin-client", { username: c.username }, "Unpinned")}>Unpin</button>}
          <button className="btn btn-ghost !py-1 !px-2 !text-[10px]" onClick={() => setResetTarget(c.username)}>🔑 Wipe</button>
          {role === "super" && <button className="btn btn-ghost !py-1 !px-2 !text-[10px]" onClick={() => setPwTarget({ u: c.username, pw: "" })}>Set PW</button>}
        </div>)}
      </div>}
    </div>)}
    {report && <div className="card p-4 mt-3">
      <div className="micro mb-2">Team OTP Report · {report.date}</div>
      {report.hottest && <div className="card p-2.5 mb-2 text-xs font-bold" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--amber) 14%, var(--card)), color-mix(in srgb, var(--red) 10%, var(--card)))" }}>🔥 Hottest today: {report.hottest.prefix || report.hottest.label} · {report.hottest.otpToday} OTPs</div>}
      {(report.teams || []).map((t: any) => <div key={t.prefix || "sys"} className="py-1.5 border-b border-[var(--border)] last:border-0 flex items-center gap-2">
        <span className="text-xs font-extrabold flex-1 truncate">{t.prefix || "System Generated"}</span>
        <span className="mono text-[11px] font-bold text-[var(--accent)]">{t.otpToday} today</span>
        <span className="mono text-[10px] text-[var(--muted)]">{t.otpWeek} wk · {t.clients} clients</span>
      </div>)}
    </div>}
    <ConfirmModal open={!!resetTarget} title="Wipe credentials?" confirmText="Reset Credentials"
      body={<>Removes the password for <b>{resetTarget}</b>. They must activate a new password on next login.</>}
      onClose={() => setResetTarget(null)} onConfirm={() => act("/api/admin/reset-credentials", { username: resetTarget }, "Credentials wiped for " + resetTarget)} />
    {pwTarget && <div className="fixed inset-0 z-[900] flex items-center justify-center p-5" onClick={() => setPwTarget(null)}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      <div className="card a-zoom relative w-full max-w-[320px] p-5" onClick={e => e.stopPropagation()}>
        <div className="font-display font-bold text-sm mb-3">Set password · {pwTarget.u}</div>
        <input className="input mb-3" placeholder="New password (min 6)" value={pwTarget.pw} onChange={e => setPwTarget({ ...pwTarget, pw: e.target.value })} />
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => setPwTarget(null)}>Cancel</button>
          <button className="btn btn-primary flex-1" onClick={async () => { const d = await act("/api/admin/reset-password", { username: pwTarget.u, password: pwTarget.pw }, "Password set for " + pwTarget.u); if (d?.ok) setPwTarget(null); }}>Set</button>
        </div>
      </div>
    </div>}
  </div>;
}