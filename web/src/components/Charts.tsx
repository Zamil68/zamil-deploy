import React from "react";
export function LineChart({ vals, color = "var(--accent)" }: { vals: number[]; color?: string }){
  const v = vals && vals.length ? vals : [0, 0];
  const W = 300, H = 80, L = 8, R = 8, T = 8, B = 6;
  const max = Math.max(...v, 1); const iw = W - L - R, ih = H - T - B, n = v.length;
  const X = (i: number) => L + i * (iw / Math.max(1, n - 1));
  const Y = (x: number) => T + ih - (x / max) * ih;
  const d = v.map((x, i) => (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(x).toFixed(1)).join(" ");
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
    <path d={d + ` L${X(n - 1)},${T + ih} L${X(0)},${T + ih} Z`} fill={color} opacity=".12" />
    <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <text x={L} y={H - 1} fontSize="7" fill="var(--muted)">-60m</text>
    <text x={W - R} y={H - 1} fontSize="7" textAnchor="end" fill="var(--muted)">now · max {max}</text>
  </svg>;
}
export function BarPair({ a, b, la = "Yesterday", lb = "Today" }: { a: number; b: number; la?: string; lb?: string }){
  const max = Math.max(a, b, 1);
  return <div className="flex items-end justify-center gap-6 h-[86px] pt-2">
    {[{ v: a, l: la, c: "var(--border)" }, { v: b, l: lb, c: "var(--accent)" }].map((x, i) =>
      <div key={i} className="flex flex-col items-center gap-1">
        <span className="mono text-xs font-extrabold" style={{ color: i ? "var(--accent)" : "var(--muted)" }}>{x.v.toLocaleString()}</span>
        <div className="w-12 rounded-t-lg" style={{ height: Math.max(6, (x.v / max) * 52) + "px", background: x.c }} />
        <span className="micro">{x.l}</span>
      </div>)}
  </div>;
}
export function GrowBar({ label, text, p, color = "linear-gradient(90deg,var(--accent),var(--accent2))" }: { label: string; text: string; p: number; color?: string }){
  return <div className="mb-2">
    <div className="flex justify-between text-[11px] font-bold mb-1"><span className="text-[var(--muted)]">{label}</span><span className="mono">{text}</span></div>
    <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden"><div className="h-full rounded-full" style={{ width: Math.max(2, Math.min(100, p)) + "%", background: color }} /></div>
  </div>;
}