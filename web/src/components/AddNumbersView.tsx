import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { postApi } from '../services/api';
import { getCountryFlag } from '../utils/countryCodes';
import { Card, PageHead, IconBtn } from './Ui';
import { Ship, Search, RefreshCw, ChevronDown, ChevronUp, Anchor, AlertCircle, Sparkles, TrendingUp, Package, CheckCircle2, Loader2 } from 'lucide-react';

interface FreeRange { id: string; range: string; country: string; available: number; total: number; }
interface TrendItem { name: string; flag: string; metric: string; tone: 'hot' | 'free'; qty: number; free: number; }

const DOCK_POLL_MS = 8000;
const POOL_POLL_MS = 15000;
const TREND_POOL_MS = 30000;
const TREND_SLOTS = 3;

// "970 + 972 - Palestine" → "Palestine"
const cleanCountry = (s: string) => {
  const t = String(s || '').replace(/^[\d+\s\-]+/, '').trim();
  return t || String(s || '').trim();
};
// fallback when a dock range is no longer in the free pool
const countryFromRange = (t: string) => {
  const s = String(t || '');
  const m = s.match(/^(.+?)[\s-](?:LX|MX|RX|DC)\b/i) || s.match(/^([A-Za-z\s]+?)\d/);
  return (m && m[1] ? m[1] : s).trim();
};
const kfmt = (n: number) => {
  const v = Math.max(0, Math.round(n || 0));
  if (v >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(v);
};

export const AddNumbersView: React.FC = () => {
  const { username } = useAuth();
  const { showToast } = useToast();

  const [q, setQ] = useState('');
  const [ranges, setRanges] = useState<FreeRange[]>([]);
  const [pool, setPool] = useState<FreeRange[]>([]);   // full free pool → trending fallback + country lookup
  const [sel, setSel] = useState<FreeRange | null>(null);
  const [qty, setQty] = useState('5');
  const [limits, setLimits] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);   // FIRST search only → no empty-state flash
  const [refreshing, setRefreshing] = useState(false); // silent refresh → icon only
  const [searched, setSearched] = useState(false);
  const [err, setErr] = useState('');
  const [dock, setDock] = useState<any[]>([]);
  const [dockIsAdmin, setDockIsAdmin] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ range: FreeRange; qty: number } | null>(null);
  const [shippingAnim, setShippingAnim] = useState(false);
  const [shipQty, setShipQty] = useState(0);

  const shipTimer = useRef<any>(null);
  const reqId = useRef(0);
  const poolReqId = useRef(0);
  const poolSig = useRef('');
  const freeSig = useRef('');
  const dockSig = useRef('');
  const qRef = useRef('');
  const selRef = useRef<FreeRange | null>(null);
  const busyRef = useRef(false);

  useEffect(() => { selRef.current = sel; }, [sel]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => () => clearTimeout(shipTimer.current), []);

  // Silent = keep the current list on screen, swap only when the data actually changed.
  const loadRanges = useCallback(async (query: string, silent = false) => {
    const id = ++reqId.current;
    if (silent) setRefreshing(true); else setSearching(true);
    const r = await postApi<any>('/api/alloc/search-ranges', { query });
    if (id !== reqId.current) return;                 // stale response → discard
    if (silent) setRefreshing(false); else setSearching(false);

    if (!r?.ok) { if (!silent) setErr(r?.error || 'Search failed'); return; }

    const mapped: FreeRange[] = (r.ranges || []).map((x: any) => ({
      id: x.id, range: x.title || x.range, country: x.country,
      available: x.available ?? 0, total: x.total ?? 0
    }));
    const sig = mapped.map((x) => x.id + ':' + x.available).join('|');
    if (sig !== poolSig.current) { poolSig.current = sig; setRanges(mapped); }
    setSearched(true);
    setErr('');

    // keep the selected card truthful without remounting it
    const cur = selRef.current;
    if (cur) {
      const fresh = mapped.find((x) => x.id === cur.id);
      if (!fresh) { setSel(null); setLimits(null); }
      else if (fresh.available !== cur.available) setSel(fresh);
    }
  }, []);

  // whole free pool, never touches `searched` → powers trending without opening the results card
  const loadPool = useCallback(async () => {
    const id = ++poolReqId.current;
    const r = await postApi<any>('/api/alloc/search-ranges', { query: '' });
    if (id !== poolReqId.current || !r?.ok) return;
    const mapped: FreeRange[] = (r.ranges || []).map((x: any) => ({
      id: x.id, range: x.title || x.range, country: x.country,
      available: x.available ?? 0, total: x.total ?? 0
    }));
    const sig = mapped.map((x) => x.id + ':' + x.available).join('|');
    if (sig !== freeSig.current) { freeSig.current = sig; setPool(mapped); }
  }, []);

  const loadDock = useCallback(async () => {
    const r = await postApi<any>('/api/alloc/queue-list');
    if (!r?.ok) return;
    setDockIsAdmin(!!r.admin);
    const items = r.items || [];
    const sig = items.map((x: any) => x.id + ':' + x.status).join('|');
    if (sig !== dockSig.current) { dockSig.current = sig; setDock(items); }
  }, []);

  useEffect(() => {
    loadDock();
    loadPool();
    const t = setInterval(() => { if (!document.hidden) loadDock(); }, DOCK_POLL_MS);
    const p = setInterval(() => { if (!document.hidden) loadPool(); }, TREND_POOL_MS);
    return () => { clearInterval(t); clearInterval(p); };
  }, [loadDock, loadPool]);

  // after the first successful search, keep the pool fresh in the background
  useEffect(() => {
    if (!searched) return;
    const t = setInterval(() => {
      if (document.hidden || busyRef.current) return;
      loadRanges(qRef.current, true);
    }, POOL_POLL_MS);
    return () => clearInterval(t);
  }, [searched, loadRanges]);

  // ── TRENDING: real demand from the Dock, filled with the biggest free stock ──
  const trending = useMemo<TrendItem[]>(() => {
    const byId = new Map<string, FreeRange>();
    const byTitle = new Map<string, FreeRange>();
    const freeByCountry = new Map<string, { name: string; available: number }>();

    pool.forEach((r) => {
      byId.set(String(r.id), r);
      byTitle.set(String(r.range || '').toLowerCase(), r);
      const name = cleanCountry(r.country);
      if (!name) return;
      const k = name.toLowerCase();
      const cur = freeByCountry.get(k);
      if (cur) cur.available += r.available;
      else freeByCountry.set(k, { name, available: r.available });
    });

    // most-added countries today (pending + done; failed never delivered)
    const demand = new Map<string, { name: string; qty: number; batches: number }>();
    dock.forEach((it) => {
      if (it.status === 'failed') return;
      const hit = byId.get(String(it.range_id || '')) || byTitle.get(String(it.range_name || '').toLowerCase());
      const name = cleanCountry(hit ? hit.country : countryFromRange(it.range_name));
      if (!name) return;
      const k = name.toLowerCase();
      const n = Math.max(0, parseInt(it.qty, 10) || 0);
      const cur = demand.get(k);
      if (cur) { cur.qty += n; cur.batches += 1; }
      else demand.set(k, { name, qty: n, batches: 1 });
    });

    const ranked = [...demand.values()].sort((a, b) => b.qty - a.qty || b.batches - a.batches);
    const out: TrendItem[] = [];
    const used = new Set<string>();

    for (const d of ranked) {
      if (out.length >= TREND_SLOTS) break;
      const k = d.name.toLowerCase();
      if (used.has(k)) continue;
      used.add(k);
      out.push({
        name: d.name, flag: getCountryFlag(d.name),
        metric: kfmt(d.qty) + ' added', tone: 'hot',
        qty: d.qty, free: freeByCountry.get(k)?.available ?? 0
      });
    }

    if (out.length < TREND_SLOTS) {
      const fill = [...freeByCountry.values()].sort((a, b) => b.available - a.available);
      for (const f of fill) {
        if (out.length >= TREND_SLOTS) break;
        const k = f.name.toLowerCase();
        if (used.has(k) || f.available <= 0) continue;
        used.add(k);
        out.push({
          name: f.name, flag: getCountryFlag(f.name),
          metric: kfmt(f.available) + ' free', tone: 'free',
          qty: 0, free: f.available
        });
      }
    }
    return out;
  }, [dock, pool]);

  const trendSource = trending.some((t) => t.tone === 'hot')
    ? (dockIsAdmin ? "today's dock" : 'your dock today')
    : 'most free stock';

  const runSearch = (value: string) => {
    setQ(value); qRef.current = value;
    loadRanges(value, false);
  };

  const pick = async (r: FreeRange) => {
    setSel(r); setLimits(null);
    setQty(String(Math.max(1, Math.min(5, r.available || 5))));
    const d = await postApi<any>('/api/alloc/daily-used', { rangeId: r.id, rangeTitle: r.range });
    if (d?.ok) setLimits(d);
  };

  const allocate = async () => {
    if (!confirm) return;
    const { range, qty: n } = confirm;
    setConfirm(null);
    setBusy(true);
    setShipQty(n);
    setShippingAnim(true);
    clearTimeout(shipTimer.current);
    shipTimer.current = setTimeout(() => setShippingAnim(false), 1400);

    const d = await postApi<any>('/api/alloc/allocate', { rangeId: range.id, rangeTitle: range.range, quantity: n, payout: '0.01' });
    setBusy(false);
    if (d?.ok) {
      showToast(d.queued ? `⛵ Queued ${n} · ETA ~1m` : `✓ ${d.allocated || n} allocated`, 'success');
      setSel(null); setLimits(null);
      loadRanges(qRef.current, true);
      loadDock();
      loadPool();
      window.dispatchEvent(new Event('zamil:ranges-dirty'));
    } else if (d?.limitReached) {
      showToast(`🚫 ${d.message || 'Limit reached'}`, 'error');
    } else {
      showToast(d?.error || 'Alloc failed', 'error');
    }
  };

  const pending = dock.filter((d) => d.status === 'pending').length;
  const visibleDock = dockOpen ? dock : dock.slice(0, 3);
  const cap = sel ? Math.max(1, Math.min(sel.available || 1, limits?.remaining ?? (sel.available || 1))) : 1;

  return (
    <div className="w-full max-w-full overflow-hidden space-y-2 pb-16">
      <PageHead title="Ship" chip={pending || undefined} sub={`to ${username}`}
        right={<IconBtn onClick={() => { loadRanges(qRef.current, true); loadDock(); loadPool(); }} disabled={busy || refreshing} title="Refresh">
          <RefreshCw className={`w-3.5 h-3.5 ${busy || refreshing ? 'animate-spin text-cyan-500' : ''}`} />
        </IconBtn>} />

      {/* ── Search ── */}
      <Card className="p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-white shrink-0">
            <Search className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold text-slate-900 dark:text-white">Search Ranges</div>
            <div className="text-[9px] text-slate-400 font-semibold">Find available numbers by country</div>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input type="text" value={q}
            onChange={(e) => { setQ(e.target.value); qRef.current = e.target.value; }}
            onKeyDown={(e) => e.key === 'Enter' && q.trim() && runSearch(q)}
            placeholder="Search a country or range…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50 transition-all" />
        </div>

        <button type="button" onClick={() => runSearch(q)} disabled={busy || searching || !q.trim()}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-cyan-600/20 active:scale-[.98] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5">
          {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          {searching ? 'Searching…' : 'Search Pool'}
        </button>

        {err && <p className="text-[10px] font-bold text-rose-500">{err}</p>}

        {/* ── Trending: live demand from the Dock, else biggest free stock ── */}
        {!searching && (!searched || ranges.length === 0) && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Trending now</span>
              <span className="text-[8px] font-semibold text-slate-400/80 truncate">· {trendSource}</span>
            </div>

            {trending.length === 0 ? (
              <div className="flex items-center justify-center gap-1.5 py-3 text-[10px] font-bold text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Reading demand…
              </div>
            ) : (
              <div className="flex gap-1.5">
                {trending.map((c) => (
                  <button key={c.name} type="button" onClick={() => runSearch(c.name)}
                    title={`${c.name} · ${c.free} free${c.tone === 'hot' ? ` · ${c.qty} added today` : ''}`}
                    className="flex-1 min-w-0 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-cyan-500/40 hover:bg-cyan-50 dark:hover:bg-cyan-950/20 transition-colors cursor-pointer group">
                    <div className="text-lg leading-none mb-0.5">{c.flag}</div>
                    <div className="px-1 text-[9px] font-bold text-slate-700 dark:text-slate-300 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 truncate">{c.name}</div>
                    <div className={`px-1 text-[7px] font-bold uppercase truncate ${c.tone === 'hot' ? 'text-amber-500' : 'text-emerald-500'}`}>{c.metric}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Results: mounted once, never blanked on refresh ── */}
      {searched && (
        <Card className="p-2.5 space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              {ranges.length > 0 ? `${ranges.length} range${ranges.length > 1 ? 's' : ''} found` : 'No results'}
              {refreshing && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 dot-live" />}
            </span>
            {q && <span className="text-[9px] font-bold text-cyan-600 dark:text-cyan-400">"{q}"</span>}
          </div>

          {ranges.length === 0 ? (
            <div className="py-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2">
                <Package className="w-7 h-7 text-slate-400" />
              </div>
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">No ranges available</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Pick a trending country above</div>
            </div>
          ) : (
            <div className="max-h-44 overflow-y-auto space-y-1">
              {ranges.map((r) => (
                <div key={r.id} onClick={() => pick(r)}
                  className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-colors ${
                    sel?.id === r.id
                      ? 'bg-cyan-500/10 border-cyan-500/50 shadow-sm shadow-cyan-500/10'
                      : 'border-slate-200/70 dark:border-slate-800 hover:border-cyan-500/40 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}>
                  <span className="text-2xl shrink-0 leading-none">{getCountryFlag(r.country)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold truncate text-slate-900 dark:text-white">{r.range}</div>
                    <div className="text-[9px] text-slate-400 truncate">{r.country}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 font-mono text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 shrink-0 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />{r.available}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Selected range ── */}
      {sel && (
        <Card className="p-3 space-y-2.5 border-cyan-500/30">
          <div className="flex items-center gap-2">
            <span className="text-2xl shrink-0 leading-none">{getCountryFlag(sel.country)}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate text-slate-900 dark:text-white">{sel.range}</div>
              <div className="text-[9px] text-slate-400">{sel.available} free · {sel.country}</div>
            </div>
            <button type="button" onClick={() => { setSel(null); setLimits(null); }} className="text-slate-400 hover:text-rose-500 cursor-pointer">
              <AlertCircle className="w-4 h-4" />
            </button>
          </div>

          {limits && (
            <div className="flex gap-2 flex-wrap text-[9px] font-mono font-bold text-slate-400">
              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">R {limits.rangeUsed}/{limits.rangeLimit}</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">C {limits.countryUsed}/{limits.countryLimit}</span>
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">left {limits.remaining ?? '—'}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="text-[9px] font-bold text-slate-400 mb-1">QUANTITY · max {cap}</div>
              <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-center outline-none focus:ring-2 focus:ring-cyan-500/40" />
            </div>
            <button type="button" disabled={busy}
              onClick={() => { const n = Math.max(1, Math.min(cap, parseInt(qty, 10) || 1)); setQty(String(n)); setConfirm({ range: sel, qty: n }); }}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50 shrink-0 flex items-center gap-1.5 shadow-lg shadow-cyan-600/20 active:scale-[.98]">
              <Ship className="w-3.5 h-3.5" /> Allocate
            </button>
          </div>
        </Card>
      )}

      {/* ── Dock ── */}
      <Card className="p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Anchor className="w-3.5 h-3.5 text-cyan-500" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Dock · {dock.length}</span>
            {pending > 0 && (
              <span className="px-1.5 py-0.3 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[8px] font-bold">{pending} pending</span>
            )}
          </div>
          {dock.length > 3 && (
            <button type="button" onClick={() => setDockOpen(!dockOpen)} className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 cursor-pointer flex items-center gap-1">
              {dockOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}{dockOpen ? 'Less' : `+${dock.length - 3}`}
            </button>
          )}
        </div>

        {dock.length === 0 ? (
          <div className="py-4 text-center">
            <Ship className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600 mb-1" />
            <p className="text-[11px] font-bold text-slate-400">Dock idle</p>
          </div>
        ) : (
          <div className="space-y-1">
            {visibleDock.map((it, i) => (
              <div key={it.id ?? i} className="p-2 rounded-xl border border-slate-200/70 dark:border-slate-800 flex items-center gap-2.5">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  it.status === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                  it.status === 'done' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                  {it.status === 'pending' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                   it.status === 'done' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold truncate text-slate-800 dark:text-slate-200">
                    {it.range_name} <span className="text-cyan-600 dark:text-cyan-400 font-mono">×{it.qty}</span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-400 truncate">
                    {new Date(it.created_at).toLocaleTimeString()} · <span className="text-cyan-600 dark:text-cyan-400 font-bold">@{it.username}</span>
                  </div>
                </div>
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                  it.status === 'pending' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                  it.status === 'done' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                  'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                  {it.status === 'pending' ? 'Sailing' : it.status === 'done' ? 'Done' : 'Failed'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Dispatch animation ── */}
      {shippingAnim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none ship-overlay">
          <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" />
          <div className="relative flex flex-col items-center gap-3 ship-card">
            <div className="relative w-28 h-20 flex items-center justify-center">
              <span className="ship-ring" /><span className="ship-ring ship-ring-b" />
              <span className="ship-wake ship-wake-1" /><span className="ship-wake ship-wake-2" /><span className="ship-wake ship-wake-3" />
              <div className="ship-boat"><Ship className="w-8 h-8 text-white" /></div>
            </div>
            <div className="px-4 py-1.5 rounded-full bg-slate-900/85 backdrop-blur-md border border-cyan-400/30 text-[11px] font-bold text-cyan-200 tracking-wide ship-label">
              ⛵ Dispatching {shipQty} numbers…
            </div>
            <div className="w-28 h-1 rounded-full bg-white/15 overflow-hidden ship-bar"><i /></div>
          </div>
        </div>
      )}

      {/* ── Confirm ── */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md">
          <Card className="w-full max-w-sm p-5 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-cyan-500/30">
              <Ship className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 text-center">Dispatch {confirm.qty} numbers?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4 text-center">
              From <strong className="text-slate-800 dark:text-slate-200">{confirm.range.range}</strong> to <strong className="text-slate-800 dark:text-slate-200">{username}</strong>
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">Cancel</button>
              <button type="button" onClick={allocate} className="flex-1 px-3 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-cyan-600/20 active:scale-[.98] flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Dispatch
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AddNumbersView;
