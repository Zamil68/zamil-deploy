import React, { useEffect, useState } from "react";
import { postApi } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { ago } from "../../utils/fmt";
import { LineChart, BarPair, GrowBar } from "../Charts";
import ConfirmModal from "../ConfirmModal";

export default function SccTab(){
  const { toast } = useToast();
  const [d, setD] = useState<any>(null);
  const [ask, setAsk] = useState<"" | "broadcast" | "stopdock">("");
  const load = async () => { const r = await postApi("/api/scc/status"); if (r?.ok) setD(r); };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  if (!d) return <div className="text-center text-sm text-[var(--muted)] font-semibold py-10">Loading telemetry…</div>;
  const st = d.system || {}, q = d.queue || {}, c = d.cdr || {}, b = d.boats || {}, u = d.users || {}, l = d.load || {}, dy = d.daily || {}, n = d.numbers || {};
  const dotCls = st.status === "critical" ? "var(--red)" : st.status === "warning" ? "var(--amber)" : "var(--green)";
  const card = (v: any, k: string, sub?: React.ReactNode) =>
    <div className="card p-3"><div className="mono text-xl font-extrabold leading-none">{v}</div><div className="micro mt-1">{k}</div>{sub && <div className="text-[10px] font-bold text-[var(--muted)] mt-1">{sub}</div>}</div>;
  return <div>
    <div className="card p-3.5 mb-3 flex items-center gap-3">
      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: dotCls, boxShadow: `0 0 10px ${dotCls}`, animation: "pulseDot 2s infinite" }} />
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold text-sm">System Command Center <span className="chip mono !text-[10px] ml-1">Health {st.score ?? "—"}/100</span></div>
        <div className="text-[10px] font-bold text-[var(--muted)]">Live · updated {ago(d.timestamp)}</div>
      </div>
      <button className="btn btn-ghost !p-2 !rounded-lg" onClick={load}>↻</button>
    </div>
    {(d.alerts || []).length > 0 && <div className="card p-3 mb-3 flex items-center gap-2" style={{ borderColor: "color-mix(in srgb, var(--red) 40%, var(--border))", background: "color-mix(in srgb, var(--red) 6%, var(--card))" }}>
      <span className="flex-1 text-xs font-bold">⚠️ {(d.alerts || []).map((a: any) => a.message).join(" · ")}</span>
      <button className="btn btn-danger !py-1.5 !px-2.5 !text-[10px]" onClick={() => setAsk("broadcast")}>📣 Send to All</button>
      <button className="btn btn-danger !py-1.5 !px-2.5 !text-[10px]" onClick={() => setAsk("stopdock")}>⛔ Stop Dock</button>
    </div>}
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
      {card(q.size, "Alloc Queue", q.size ? `oldest ${q.oldestMin}m · ETA ~${q.etaMins}m` : "clear")}
      {card(c.status === "live" ? "LIVE" : c.status === "sleep" ? "SLEEP" : "DEAD", "CDR Stream", `${c.perMin ?? 0} OTP/min · lag ${c.lagMin ?? "?"}m`)}
      {card(`${b.active ?? 0}/${b.total ?? 0}`, "Daemons", b.active === b.total ? "all nominal" : (b.total - b.active) + " stale")}
      {card(l.perMin, "API Load / min", `${l.lastHour} calls last hour`)}
      {card(u.online, "Users Online", (u.list || []).slice(0, 2).map((x: any) => x.u).join(", ") || "—")}
      {card(q.avgDoneMin + "m", "Avg Queue Clear", q.size ? "processing now" : "dock idle")}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
      <div className="card p-3"><div className="micro mb-1.5">API Traffic (5-min buckets)</div><LineChart vals={l.buckets || []} color="#22d3ee" /></div>
      <div className="card p-3"><div className="micro mb-1.5">OTP Intake (5-min buckets)</div><LineChart vals={c.buckets || []} color="#10b981" /></div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
      <div className="card p-3"><div className="micro mb-1">Daily OTP Comparison <span className="mono text-[var(--accent)] font-extrabold ml-1">{(dy.growthPct >= 0 ? "+" : "") + (dy.growthPct ?? 0)}%</span></div><BarPair a={dy.yesterday || 0} b={dy.today || 0} /></div>
      <div className="card p-3"><div className="micro mb-2">Growth Metrics</div>
        <GrowBar label="Pool utilization" text={`${n.utilPct ?? 0}% (${(n.assigned || 0).toLocaleString()}/${(n.total || 0).toLocaleString()})`} p={n.utilPct || 0} color="linear-gradient(90deg,#10b981,#34d399)" />
        <GrowBar label="Fleet health" text={`${b.active ?? 0}/${b.total ?? 0} daemons`} p={b.total ? (b.active / b.total) * 100 : 0} color="linear-gradient(90deg,#f59e0b,#fbbf24)" />
        <div className="text-[10px] font-bold text-[var(--muted)] mt-1">Last full reconcile: {n.lastReconcile || "never"}</div>
      </div>
    </div>
    <div className="micro mb-1.5">Daemon Heartbeats</div>
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
      {(b.list || []).map((x: any) => <div key={x.id} className="card p-2.5 flex items-center gap-2" style={!x.ok ? { borderColor: "color-mix(in srgb, var(--red) 40%, var(--border))" } : {}}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: x.ok ? "var(--green)" : "var(--red)", boxShadow: `0 0 8px ${x.ok ? "var(--green)" : "var(--red)"}` }} />
        <span className="text-[11px] font-extrabold flex-1 truncate">{x.name}</span>
        <span className="mono text-[10px] font-bold text-[var(--muted)]">{x.agoMin == null ? "no hb" : x.agoMin + "m"}</span>
      </div>)}
    </div>
    <div className="micro mb-1.5">Live Incidents</div>
    {(d.incidents || []).length === 0 && <div className="card p-6 text-center text-xs text-[var(--muted)] font-semibold border-dashed">✅ System nominal — no pending incidents</div>}
    {(d.incidents || []).map((inc: any) => <div key={inc.id} className="card p-3 mb-2 flex items-center gap-2" style={{ borderLeft: `3px solid ${inc.severity === "critical" ? "var(--red)" : "var(--amber)"}` }}>
      <div className="flex-1 min-w-0"><div className="text-xs font-extrabold truncate">{inc.severity === "critical" ? "🚨 " : "⚠️ "}{inc.title}</div>
      <div className="text-[10px] text-[var(--muted)] font-semibold truncate">{inc.message} · {ago(inc.created_at)}</div></div>
      <button className="btn btn-ghost !py-1 !px-2 !text-[10px]" onClick={async () => { await postApi("/api/scc/broadcast", { id: inc.id, title: inc.title, message: inc.message }); toast("Broadcasted to all users", "ok"); load(); }}>📣</button>
      <button className="btn btn-ghost !py-1 !px-2 !text-[10px]" onClick={async () => { await postApi("/api/scc/dismiss-all", { type: inc.type }); load(); }}>✕</button>
    </div>)}
    <ConfirmModal open={ask === "broadcast"} title="Broadcast system alert?" body="Sends the current alert text as a notification to ALL users." confirmText="Send to All"
      onClose={() => setAsk("")} onConfirm={async () => { const r = await postApi("/api/scc/broadcast", { id: "", title: "System Alert", message: (d.alerts || []).map((a: any) => a.message).join(". ") }); toast(r?.ok ? "Alert sent to all users" : "Failed", r?.ok ? "ok" : "err"); }} />
    <ConfirmModal open={ask === "stopdock"} title="TERMINATE all dock batches?" body="Pending allocation batches are cancelled instantly. Done/failed history is kept." confirmText="Stop All Dock"
      onClose={() => setAsk("")} onConfirm={async () => { const r = await postApi("/api/admin/queue-clear"); toast(r?.ok ? `Cancelled ${r.cancelled || 0} batches` : "Failed", r?.ok ? "ok" : "err"); load(); }} />
  </div>;
}
