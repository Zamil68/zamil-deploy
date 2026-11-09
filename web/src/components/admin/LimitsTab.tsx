import React, { useEffect, useState } from "react";
import { postApi } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import ConfirmModal from "../ConfirmModal";
export default function LimitsTab(){
  const { role } = useAuth(); const { toast } = useToast();
  const [lim, setLim] = useState<any>(null);
  const [f, setF] = useState<any>({});
  const [u, setU] = useState(""); const [status, setStatus] = useState<any>(null);
  const [freeRow, setFreeRow] = useState<any>(null);
  const load = async () => { const d = await postApi("/api/admin/limits-get"); if (d?.ok) { setLim(d.limits); setF({ qm: d.limits.qty_max, rd: d.limits.range_daily, cd: d.limits.country_daily }); } };
  useEffect(() => { load(); }, []);
  const search = async () => {
    if (!u.trim()) return toast("Enter a username", "err");
    const d = await postApi("/api/admin/limit-status", { username: u });
    if (d?.ok) setStatus(d); else toast(d?.error || "Failed", "err");
  };
  return <div>
    <div className="card p-4 mb-3">
      <div className="micro mb-2">Global allocation limits (per user / day)</div>
      <div className="text-[11px] text-[var(--muted)] font-semibold mb-3">Applies instantly to every non-super user: max per single allocation, per range/day, per country/day.</div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div><label className="micro block mb-1">Qty max</label><input className="input mono" type="number" disabled={role !== "super"} value={f.qm || ""} onChange={e => setF({ ...f, qm: e.target.value })} /></div>
        <div><label className="micro block mb-1">Range/day</label><input className="input mono" type="number" disabled={role !== "super"} value={f.rd || ""} onChange={e => setF({ ...f, rd: e.target.value })} /></div>
        <div><label className="micro block mb-1">Country/day</label><input className="input mono" type="number" disabled={role !== "super"} value={f.cd || ""} onChange={e => setF({ ...f, cd: e.target.value })} /></div>
      </div>
      {role === "super" && <button className="btn btn-primary w-full" onClick={async () => {
        const d = await postApi("/api/admin/limits-set", { qtyMax: f.qm, rangeDaily: f.rd, countryDaily: f.cd });
        toast(d?.ok ? "Limits saved — live now" : d?.error || "Failed", d?.ok ? "ok" : "err"); if (d?.ok) load();
      }}>Save Limits</button>}
    </div>
    <div className="card p-4">
      <div className="micro mb-2">Free a try (max +3/user/day)</div>
      <div className="flex gap-2 mb-3">
        <input className="input flex-1" placeholder="LaMix username" value={u} onChange={e => setU(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} />
        <button className="btn btn-primary" onClick={search}>Search</button>
      </div>
      {status && !(status.ranges || []).length && !(status.countries || []).length &&
        <div className="card p-5 text-center text-xs text-[var(--muted)] font-semibold border-dashed">✅ <b>{status.username}</b> has nothing at limit right now.</div>}
      {(status?.ranges || []).map((r: any) => <div key={"r" + r.rangeId} className="card p-3 mb-2 flex items-center gap-2">
        <div className="flex-1 min-w-0"><div className="text-xs font-bold truncate">{r.rangeTitle}</div>
          <div className="text-[10px] text-[var(--muted)] font-semibold">{r.country} · <span className="text-[var(--red)] font-extrabold">{r.used}/{r.limit}</span> used</div></div>
        <button className="btn btn-primary !py-1.5 !px-3 !text-[10px]" onClick={() => setFreeRow({ id: r.ids[r.ids.length - 1], label: r.rangeTitle })}>🎁 +1 try</button>
      </div>)}
      {(status?.countries || []).map((c: any) => <div key={"c" + c.country} className="card p-3 mb-2 flex items-center gap-2">
        <div className="flex-1 min-w-0"><div className="text-xs font-bold">{c.country}</div>
          <div className="text-[10px] text-[var(--muted)] font-semibold"><span className="text-[var(--red)] font-extrabold">{c.used}/{c.limit}</span> used today</div></div>
        <button className="btn btn-primary !py-1.5 !px-3 !text-[10px]" onClick={() => setFreeRow({ id: c.ids[c.ids.length - 1], label: c.country })}>🎁 +1 try</button>
      </div>)}
    </div>
    <ConfirmModal open={!!freeRow} danger={false} title="Free 1 try?" confirmText="Free try"
      body={<>Remove one attempt row for <b>{status?.username}</b> on <b>{freeRow?.label}</b>?</>}
      onClose={() => setFreeRow(null)} onConfirm={async () => {
        const d = await postApi("/api/admin/free-try", { username: status.username, rowId: freeRow.id });
        toast(d?.ok ? "Freed 1 try for " + status.username : d?.error || "Failed", d?.ok ? "ok" : "err");
        if (d?.ok) search();
      }} />
  </div>;
}