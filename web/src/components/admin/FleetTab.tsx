import React, { useEffect, useState } from "react";
import { postApi } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { getFlag, splitRangeName } from "../../utils/countryCodes";
import { ago, pct } from "../../utils/fmt";
import { GrowBar } from "../Charts";
import ConfirmModal from "../ConfirmModal";
export default function FleetTab(){
  const { toast } = useToast();
  const [ranges, setRanges] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [prog, setProg] = useState<any>(null);
  const [recon, setRecon] = useState<any>(null);
  const [askSync, setAskSync] = useState(false);
  const load = async () => {
    const d = await postApi("/api/admin/fleet-ranges"); if (d?.ok) setRanges(d.ranges || []);
    const p = await postApi("/api/admin/sync-progress"); if (p?.ok) setProg(p.prog);
    const r = await postApi("/api/admin/reconcile-status"); if (r?.ok) setRecon(r);
  };
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, []);
  const ql = q.toLowerCase().trim();
  const list = ql ? ranges.filter(r => (r.name + " " + r.country).toLowerCase().includes(ql)) : ranges;
  const st = String(prog?.status || "idle").toUpperCase();
  return <div>
    <div className="card p-3.5 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="micro flex-1">LaMix ↔ DB Sync</div>
        <span className="chip !text-[10px] font-extrabold" style={{ color: st === "RUNNING" ? "var(--amber)" : st === "DONE" ? "var(--green)" : "var(--muted)" }}>● {st}</span>
        <button className="btn btn-ghost !py-1 !px-2 !text-[10px]" onClick={load}>↻</button>
        <button className="btn btn-primary !py-1 !px-2.5 !text-[10px]" onClick={() => setAskSync(true)}>Run Full Sync</button>
      </div>
      <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden mb-1.5">
        <div className="h-full rounded-full transition-all" style={{ width: pct(prog?.fetched || 0, prog?.expected || 0) + "%", background: "linear-gradient(90deg,var(--accent),var(--accent2))" }} />
      </div>
      <div className="mono text-[11px] font-bold text-[var(--muted)]">
        {(prog?.fetched || 0).toLocaleString()} / {(prog?.expected || 0).toLocaleString()}
        {st === "RUNNING" && prog?.etaSecs ? ` · ETA ~${Math.floor(prog.etaSecs / 60)}m ${prog.etaSecs % 60}s` : ""}
        {st === "DONE" ? " · pool matches LaMix" : ""} · 38 req/min
      </div>
      {recon && <div className="flex flex-wrap gap-1.5 mt-2">
        <span className="chip !text-[10px]">pool {recon.mirror_total?.toLocaleString?.()}</span>
        <span className="chip !text-[10px] text-[var(--green)]">db active {recon.db_assigned?.toLocaleString?.()}</span>
        <span className="chip !text-[10px]" style={{ color: recon.orphans ? "var(--red)" : "var(--muted)" }}>orphans {recon.orphans}</span>
        <span className="chip !text-[10px]" style={{ color: recon.missing ? "var(--amber)" : "var(--muted)" }}>missing {recon.missing}</span>
        <span className="chip !text-[10px]">last {ago(recon.last_sync)}</span>
      </div>}
    </div>
    <input className="input mb-3" placeholder="Filter fleet ranges…" value={q} onChange={e => setQ(e.target.value)} />
    <div className="flex flex-col gap-2">
      {list.map(r => { const sp = splitRangeName(r.name);
        return <div key={r.id} className="card p-3 a-fade">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="text-xl">{getFlag(sp.country)}</span>
            <div className="flex-1 min-w-0"><div className="text-[13px] font-bold truncate">{r.name}</div>
              <div className="text-[10px] font-semibold text-[var(--muted)]">{r.inGateway ? "🟢 in gateway" : "🔴 NOT in gateway"} · {r.activeUsersCount} user(s) · last OTP {ago(r.lastOtpAt)}</div></div>
            <button className="btn btn-ghost !p-1.5 !rounded-lg !text-[11px]" title="Refresh this range from LaMix now"
              onClick={async () => { const d = await postApi("/api/admin/range-refresh", { rangeId: r.id }); toast(d?.ok ? `Refreshed ${r.name} (${d.seen} rows)` : "Refresh failed", d?.ok ? "ok" : "err"); load(); }}>↻</button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><div className="mono text-sm font-extrabold">{r.totalDbRows.toLocaleString()}</div><div className="micro">db rows</div></div>
            <div><div className="mono text-sm font-extrabold text-[var(--accent)]">{r.allocatedToUsers.toLocaleString()}</div><div className="micro">allocated</div></div>
            <div><div className="mono text-sm font-extrabold text-[var(--green)]">{r.freeInPool.toLocaleString()}</div><div className="micro">free</div></div>
          </div>
        </div>; })}
      {!list.length && <div className="card p-8 text-center text-xs text-[var(--muted)] font-semibold border-dashed">No ranges match</div>}
    </div>
    <ConfirmModal open={askSync} danger={false} title="Run FULL LaMix sync?" confirmText="Run Sync"
      body="Takes ~2–3 min at 38 req/min. Continuous reconcile keeps running — nothing is paused."
      onClose={() => setAskSync(false)} onConfirm={async () => { const d = await postApi("/api/admin/numsync-run"); toast(d?.ok ? "Full sync queued" : "Failed", d?.ok ? "ok" : "err"); }} />
  </div>;
}