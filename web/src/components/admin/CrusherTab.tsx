import React, { useEffect, useState } from "react";
import { postApi } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import ConfirmModal from "../ConfirmModal";
export default function CrusherTab(){
  const { toast } = useToast();
  const [opts, setOpts] = useState<any[]>([]);
  const [sugs, setSugs] = useState<any[]>([]);
  const [sel, setSel] = useState(""); const [hard, setHard] = useState(false);
  const [ask, setAsk] = useState<null | { name: string; hard: boolean; orphans?: boolean }>(null);
  const load = async () => { const d = await postApi("/api/admin/crush-options"); if (d?.ok) { setOpts(d.options || []); setSugs(d.suggestions || []); } };
  useEffect(() => { load(); }, []);
  const run = async () => {
    if (!ask) return;
    const d = ask.orphans ? await postApi("/api/admin/crush-orphans") : await postApi("/api/admin/range-crush", { rangeName: ask.name, hard: ask.hard });
    toast(d?.ok ? `Crushed ${d.crushed ?? d.deleted ?? 0} rows` : d?.error || "Failed", d?.ok ? "ok" : "err");
    load();
  };
  return <div>
    {sugs.length > 0 && <div className="card p-3.5 mb-3" style={{ borderColor: "color-mix(in srgb, var(--amber) 45%, var(--border))", background: "color-mix(in srgb, var(--amber) 7%, var(--card))" }}>
      <div className="micro mb-2" style={{ color: "var(--amber)" }}>Vanished from LaMix — auto-suggested</div>
      {sugs.map(s => <div key={s.id} className="flex items-center gap-2 py-1.5">
        <span className="flex-1 text-xs font-bold truncate">{s.range_name} · {s.rows_alive} rows</span>
        <button className="btn btn-primary !py-1 !px-2.5 !text-[10px]" onClick={() => setAsk({ name: s.range_name, hard: false })}>Crush</button>
        <button className="btn btn-ghost !py-1 !px-2 !text-[10px]" onClick={async () => { await postApi("/api/admin/crush-dismiss", { id: s.id }); load(); }}>✕</button>
      </div>)}
    </div>}
    <div className="card p-4 mb-3">
      <div className="micro mb-2">Crush a range (local DB rows)</div>
      <div className="text-[11px] text-[var(--muted)] font-semibold mb-3">Deletes our ledger rows for a range name. Safe mode deletes ONLY idle/vanished rows; LaMix itself is untouched — sync re-heals anything still live.</div>
      <select className="input mb-3" value={sel} onChange={e => setSel(e.target.value)}>
        <option value="">Select range…</option>
        {opts.map(o => <option key={o.range_name} value={o.range_name}>{o.range_name} — {o.count} rows · {o.users} user(s)</option>)}
      </select>
      <label className="flex items-center gap-2 text-xs font-bold text-[var(--muted)] mb-3 cursor-pointer">
        <input type="checkbox" checked={hard} onChange={e => setHard(e.target.checked)} style={{ accentColor: "var(--red)" }} />
        Hard delete ALL rows (skip idle-only safety)
      </label>
      <button className="btn btn-danger w-full" disabled={!sel} onClick={() => setAsk({ name: sel, hard })}>🗑 Crush Range</button>
    </div>
    <div className="card p-4">
      <div className="micro mb-2">Orphan sweeper</div>
      <div className="text-[11px] text-[var(--muted)] font-semibold mb-3">Deletes ONLY rows proven absent from the LaMix pool (status junk). Zero risk to live numbers.</div>
      <button className="btn w-full" style={{ background: "linear-gradient(135deg,#ef4444,#b91c1c)", color: "#fff" }} onClick={() => setAsk({ name: "", hard: false, orphans: true })}>🧹 Crush All Orphans</button>
    </div>
    <ConfirmModal open={!!ask} title={ask?.orphans ? "Delete ALL orphan rows?" : `Crush ${ask?.name}?`} confirmText="Yes, Crush"
      body={ask?.orphans ? "Rows present in our DB but NOT in LaMix will be removed." : <>All matching ledger rows will be removed and every user notified. {ask?.hard && <b className="text-[var(--red)]">HARD mode — includes active rows!</b>}</>}
      onClose={() => setAsk(null)} onConfirm={run} />
  </div>;
}