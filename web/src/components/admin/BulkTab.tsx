import React, { useEffect, useState } from "react";
import { postApi } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import ConfirmModal from "../ConfirmModal";
export default function BulkTab(){
  const { toast } = useToast();
  const [allR, setAllR] = useState<any[]>([]); const [allU, setAllU] = useState<string[]>([]);
  const [selR, setSelR] = useState<string[]>([]); const [selU, setSelU] = useState<string[]>([]);
  const [qr, setQr] = useState(""); const [qu, setQu] = useState("");
  const [per, setPer] = useState(1000);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(0);
  const load = async () => {
    const r = await postApi("/api/admin/bulk-ranges"); if (r?.ok) setAllR(r.ranges || []);
    const c = await postApi("/api/admin/my-clients"); if (c?.ok) { const us: string[] = []; (c.teams || []).forEach((t: any) => (t.clients || []).forEach((x: any) => us.push(x.username))); setAllU(us); }
    const q = await postApi("/api/alloc/queue-status"); if (q?.ok) setPending(q.totalBatches || 0);
  };
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, []);
  const fR = allR.filter(r => !qr || r.name.toLowerCase().includes(qr.toLowerCase()));
  const fU = allU.filter(u => !qu || u.toLowerCase().includes(qu.toLowerCase()));
  const toggle = (arr: string[], set: any, id: string) => set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  return <div>
    <div className="card p-3.5 mb-3 flex items-center gap-2" style={{ borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))" }}>
      <span className="text-xl">🚢</span>
      <div className="flex-1"><div className="text-sm font-extrabold">Shipping Dock</div>
        <div className="text-[10px] text-[var(--muted)] font-semibold">{pending} pending batch(es) · worker delivers at ~38/min</div></div>
      {pending > 0 && <button className="btn btn-danger !py-1.5 !px-2.5 !text-[10px]" onClick={() => setConfirm(false) || undefined} style={{ display: "none" }} />}
      <button className="btn btn-ghost !py-1.5 !px-2.5 !text-[10px]" onClick={load}>↻</button>
    </div>
    <div className="card p-4 mb-3">
      <div className="micro mb-2">1 · Pick ranges (free numbers)</div>
      <input className="input mb-2" placeholder="Filter ranges…" value={qr} onChange={e => setQr(e.target.value)} />
      <div className="max-h-[180px] overflow-y-auto flex flex-col gap-1.5 mb-1">
        <label className="flex items-center gap-2 p-2 rounded-xl border border-dashed border-[var(--border)] text-[11px] font-extrabold text-[var(--accent)] cursor-pointer">
          <input type="checkbox" checked={fR.every(r => selR.includes(r.range_id)) && fR.length > 0} onChange={e => setSelR(e.target.checked ? [...new Set([...selR, ...fR.map(r => r.range_id)])] : selR.filter(id => !fR.some(r => r.range_id === id)))} style={{ accentColor: "var(--accent)" }} />
          Select all visible
        </label>
        {fR.map(r => <label key={r.range_id} className="flex items-center gap-2 p-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] cursor-pointer">
          <input type="checkbox" checked={selR.includes(r.range_id)} onChange={() => toggle(selR, setSelR, r.range_id)} style={{ accentColor: "var(--accent)" }} />
          <span className="flex-1 text-xs font-bold truncate">{r.name}</span>
          <span className="mono text-[10px] font-extrabold text-[var(--green)]">{r.unassigned} free</span>
        </label>)}
        {!fR.length && <div className="text-[11px] text-[var(--muted)] font-semibold text-center py-3">No ranges with free numbers</div>}
      </div>
    </div>
    <div className="card p-4 mb-3">
      <div className="micro mb-2">2 · Pick target users</div>
      <input className="input mb-2" placeholder="Filter users…" value={qu} onChange={e => setQu(e.target.value)} />
      <div className="max-h-[160px] overflow-y-auto flex flex-col gap-1.5">
        <label className="flex items-center gap-2 p-2 rounded-xl border border-dashed border-[var(--border)] text-[11px] font-extrabold text-[var(--accent)] cursor-pointer">
          <input type="checkbox" checked={fU.every(u => selU.includes(u)) && fU.length > 0} onChange={e => setSelU(e.target.checked ? [...new Set([...selU, ...fU])] : selU.filter(x => !fU.includes(x)))} style={{ accentColor: "var(--accent)" }} />
          Select all visible
        </label>
        {fU.map(u => <label key={u} className="flex items-center gap-2 p-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] cursor-pointer">
          <input type="checkbox" checked={selU.includes(u)} onChange={() => toggle(selU, setSelU, u)} style={{ accentColor: "var(--accent)" }} />
          <span className="flex-1 text-xs font-bold truncate">{u}</span>
        </label>)}
      </div>
    </div>
    <div className="card p-4">
      <div className="micro mb-2">3 · Numbers per user per range (1–1000)</div>
      <input className="input mono mb-3" type="number" min={1} max={1000} value={per} onChange={e => setPer(Math.max(1, Math.min(1000, +e.target.value || 1)))} />
      <div className="text-[11px] font-bold text-[var(--muted)] mb-3">{selR.length} range(s) · {selU.length} user(s) · {per} each per range</div>
      <button className="btn btn-primary w-full" disabled={!selR.length || !selU.length} onClick={() => setConfirm(true)}>⚡ Queue Bulk Allocation</button>
    </div>
    <ConfirmModal open={confirm} danger={false} title="Confirm bulk queue" confirmText="Queue Bulk"
      body={<><b>{selU.length}</b> target(s): {selU.slice(0, 3).join(", ")}{selU.length > 3 ? ` +${selU.length - 3} more` : ""}<br />Each receives <b className="mono">{per}</b> numbers from EACH of <b>{selR.length}</b> range(s).</>}
      onClose={() => setConfirm(false)} onConfirm={async () => {
        const d = await postApi("/api/admin/bulk-queue", { rangeIds: selR, users: selU, perRange: per });
        if (d?.ok) { toast(`${d.queued} batches → Shipping Dock`, "ok"); setSelR([]); setSelU([]); load(); }
        else toast(d?.error || "Queue failed", "err");
      }} />
  </div>;
}