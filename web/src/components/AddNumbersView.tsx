import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { postApi } from '../services/api';
import { getCountryFlag } from '../utils/countryCodes';
import { Card, PageHead, IconBtn, Empty } from './Ui';
import { Ship, Search, RefreshCw, ChevronDown, ChevronUp, Anchor, AlertCircle, Sparkles, TrendingUp, Package, CheckCircle2, Loader2 } from 'lucide-react';

interface FreeRange { id: string; range: string; country: string; available: number; total: number; }

// Popular countries for quick suggestions (based on typical OTP demand)
const POPULAR_COUNTRIES = [
  { name: 'Tunisia', emoji: '🇹🇳', tag: 'Hot' },
  { name: 'Angola', emoji: '🇦🇴', tag: 'Popular' },
  { name: 'Palestine', emoji: '🇵🇸', tag: 'Trending' },
];

export const AddNumbersView: React.FC = () => {
  const { username } = useAuth();
  const { showToast } = useToast();
  const [q, setQ] = useState('');
  const [ranges, setRanges] = useState<FreeRange[]>([]);
  const [sel, setSel] = useState<FreeRange | null>(null);
  const [qty, setQty] = useState('5');
  const [limits, setLimits] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [dock, setDock] = useState<any[]>([]);
  const [dockOpen, setDockOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ range: FreeRange; qty: number } | null>(null);
  const [searched, setSearched] = useState(false);
  const [shippingAnim, setShippingAnim] = useState(false);

  const loadRanges = async (query = '') => {
    setSearched(true);
    const r = await postApi<any>('/api/alloc/search-ranges', { query });
    if (r?.ok) {
      const mapped = (r.ranges || []).map((x: any) => ({
        id: x.id, range: x.title || x.range, country: x.country,
        available: x.available ?? 0, total: x.total ?? 0
      }));
      setRanges(mapped);
    } else {
      setRanges([]);
    }
  };

  const loadDock = async () => {
    const r = await postApi<any>('/api/alloc/queue-list');
    if (r?.ok) setDock(r.items || []);
  };

  useEffect(() => { loadRanges(); loadDock(); const t = setInterval(loadDock, 8000); return () => clearInterval(t); }, []);

  const pick = async (r: FreeRange) => {
    setSel(r);
    setQty(String(Math.min(5, r.available || 5)));
    const d = await postApi<any>('/api/alloc/daily-used', { rangeId: r.id, rangeTitle: r.range });
    if (d?.ok) setLimits(d);
  };

  const allocate = async () => {
    if (!confirm) return;
    const { range, qty: n } = confirm;
    setConfirm(null);
    setBusy(true);
    setShippingAnim(true);

    const d = await postApi<any>('/api/alloc/allocate', { rangeId: range.id, rangeTitle: range.range, quantity: n, payout: '0.01' });
    setBusy(false);

    setTimeout(() => setShippingAnim(false), 2500);

    if (d?.ok) {
      showToast(d.queued ? `⛵ Queued ${n} · ETA ~1m` : `✓ ${d.allocated || n} allocated`, 'success');
      setSel(null);
      loadRanges(q);
      loadDock();
    } else if (d?.limitReached) {
      showToast(`🚫 ${d.message || 'Limit reached'}`, 'error');
    } else {
      showToast(d?.error || 'Alloc failed', 'error');
    }
  };

  const pending = dock.filter((d) => d.status === 'pending').length;
  const visibleDock = dockOpen ? dock : dock.slice(0, 3);

  const handleSuggestionClick = (country: string) => {
    setQ(country);
    loadRanges(country);
  };

  return (
    <div className="w-full max-w-full overflow-hidden space-y-2 pb-16">
      <PageHead title="Ship" chip={pending || undefined} sub={`to ${username}`}
        right={<IconBtn onClick={() => { loadRanges(q); loadDock(); }} disabled={busy} title="Refresh"><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin text-cyan-500' : ''}`} /></IconBtn>} />

      {/* ── Search Card ── */}
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
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadRanges(q)}
            placeholder="Country (e.g., Tunisia, Angola)"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50 transition-all"
          />
        </div>

        <button
          type="button"
          onClick={() => loadRanges(q)}
          disabled={busy || !q.trim()}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-cyan-600/20 active:scale-[.98] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <Search className="w-3.5 h-3.5" />
          {busy ? 'Searching…' : 'Search Pool'}
        </button>

        {/* ── Popular Suggestions ── */}
        {!searched && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3 h-3 text-amber-500" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Popular right now</span>
            </div>
            <div className="flex gap-1.5">
              {POPULAR_COUNTRIES.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => handleSuggestionClick(c.name)}
                  className="flex-1 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-cyan-500/40 hover:bg-cyan-50 dark:hover:bg-cyan-950/20 transition-all cursor-pointer group"
                >
                  <div className="text-lg leading-none mb-0.5">{c.emoji}</div>
                  <div className="text-[9px] font-bold text-slate-700 dark:text-slate-300 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 truncate">{c.name}</div>
                  <div className="text-[7px] font-bold text-amber-500 uppercase">{c.tag}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── Search Results ── */}
      {searched && (
        <Card className="p-2.5 space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              {ranges.length > 0 ? `${ranges.length} range${ranges.length > 1 ? 's' : ''} found` : 'No results'}
            </span>
            {q && <span className="text-[9px] font-bold text-cyan-600 dark:text-cyan-400">"{q}"</span>}
          </div>

          {ranges.length === 0 ? (
            <div className="py-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2">
                <Package className="w-7 h-7 text-slate-400" />
              </div>
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">No ranges available</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Try a different country or keyword</div>
            </div>
          ) : (
            <div className="max-h-44 overflow-y-auto space-y-1">
              {ranges.map((r) => (
                <div
                  key={r.id}
                  onClick={() => pick(r)}
                  className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                    sel?.id === r.id
                      ? 'bg-cyan-500/10 border-cyan-500/50 shadow-sm shadow-cyan-500/10'
                      : 'border-slate-200/70 dark:border-slate-800 hover:border-cyan-500/40 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
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

      {/* ── Selected Range + Allocate ── */}
      {sel && (
        <Card className="p-3 space-y-2.5 border-cyan-500/30">
          <div className="flex items-center gap-2">
            <span className="text-2xl shrink-0 leading-none">{getCountryFlag(sel.country)}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate text-slate-900 dark:text-white">{sel.range}</div>
              <div className="text-[9px] text-slate-400">{sel.available} free · {sel.country}</div>
            </div>
            <button type="button" onClick={() => setSel(null)} className="text-slate-400 hover:text-rose-500 cursor-pointer">
              <AlertCircle className="w-4 h-4" />
            </button>
          </div>

          {limits && (
            <div className="flex gap-2 text-[9px] font-mono font-bold text-slate-400">
              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">R {limits.rangeUsed}/{limits.rangeLimit}</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">C {limits.countryUsed}/{limits.countryLimit}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="text-[9px] font-bold text-slate-400 mb-1">QUANTITY</div>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-center outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm({ range: sel, qty: Math.max(1, parseInt(qty, 10) || 1) })}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50 shrink-0 flex items-center gap-1.5 shadow-lg shadow-cyan-600/20 active:scale-[.98]"
            >
              <Ship className="w-3.5 h-3.5" />
              Allocate
            </button>
          </div>
        </Card>
      )}

      {/* ── Shipping Dock ── */}
      <Card className="p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Anchor className="w-3.5 h-3.5 text-cyan-500" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Dock · {dock.length}</span>
            {pending > 0 && (
              <span className="px-1.5 py-0.3 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[8px] font-bold">
                {pending} pending
              </span>
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
              <div key={i} className="p-2 rounded-xl border border-slate-200/70 dark:border-slate-800 flex items-center gap-2.5">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  it.status === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                  it.status === 'done' ? 'bg-emerald-500/10 text-emerald-500' :
                  'bg-rose-500/10 text-rose-500'
                }`}>
                  {it.status === 'pending' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                   it.status === 'done' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                   <AlertCircle className="w-3.5 h-3.5" />}
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
                  'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                }`}>
                  {it.status === 'pending' ? 'Sailing' : it.status === 'done' ? 'Done' : 'Failed'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Shipping Animation Overlay ── */}
      {shippingAnim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md">
          <div className="text-center space-y-4 animate-in zoom-in-95 duration-300">
            {/* Animated Ship */}
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center mx-auto shadow-2xl shadow-cyan-500/40 animate-bounce">
                <Ship className="w-10 h-10 text-white" />
              </div>
              {/* Orbiting dots */}
              <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s' }}>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 w-3 h-3 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/60" />
              </div>
              <div className="absolute inset-0 animate-spin" style={{ animationDuration: '4s', animationDirection: 'reverse' }}>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-2 w-2 h-2 rounded-full bg-indigo-400 shadow-lg shadow-indigo-400/60" />
              </div>
              <div className="absolute inset-0 animate-spin" style={{ animationDuration: '2.5s' }}>
                <div className="absolute top-1/2 right-0 translate-x-2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/60" />
              </div>
            </div>

            {/* Text */}
            <div>
              <div className="text-sm font-bold text-white">Dispatching Numbers…</div>
              <div className="text-[10px] text-cyan-300 font-semibold mt-1">Allocating from pool to your account</div>
            </div>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-cyan-400"
                  style={{
                    animation: 'pulse 1.4s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Modal ── */}
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
                <Sparkles className="w-3.5 h-3.5" />
                Dispatch
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
export default AddNumbersView;
// === EOF: AddNumbersView.tsx ===