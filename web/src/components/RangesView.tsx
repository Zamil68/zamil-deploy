import React, { useState, useMemo, useEffect } from 'react';
import { RangeItem } from '../types';
import { splitRangeName, getCountryFlag } from '../utils/countryCodes';
import { postApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card, PageHead, IconBtn, StatStrip, Empty, SearchBox } from './Ui';
import { Search, RefreshCw, Layers, Folder, ChevronRight, Trash2, Inbox, AlertTriangle } from 'lucide-react';

interface RangesViewProps {
  ranges: RangeItem[]; smsCountToday: number; smsCountWeek?: number; smsCountMonth?: number;
  onRefresh?: () => Promise<void>; onRefreshRanges?: () => Promise<void>; isLoading: boolean;
  onSelectRange: (range: RangeItem) => void;
  onUnassignRange: (rangeId: string, rangeTitle: string, count: number) => Promise<void>;
}

export const RangesView: React.FC<RangesViewProps> = ({ ranges, smsCountToday, onRefresh, onRefreshRanges, isLoading, onSelectRange, onUnassignRange }) => {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const { username } = useAuth();
  const [grouped, setGrouped] = useState<boolean>(() => { try { const v = localStorage.getItem('zamil_grp_' + (localStorage.getItem('app_username') || '')); return v === null ? true : v === '1'; } catch { return true; } });
  const [openCountry, setOpenCountry] = useState<string | null>(null);
  const [modal, setModal] = useState<{ rangeId: string; title: string; count: number } | null>(null);
  const [liveToday, setLiveToday] = useState(smsCountToday || 0);
  const [liveBusy, setLiveBusy] = useState(false);

  useEffect(() => { setLiveToday(smsCountToday || 0); }, [smsCountToday]);

  const refreshLive = async () => { setLiveBusy(true); const d = await postApi<any>('/api/smscount'); if (d?.ok) setLiveToday(d.count || 0); setLiveBusy(false); };
  const refresh = async () => { setBusy(true); if (onRefreshRanges) await onRefreshRanges(); else if (onRefresh) await onRefresh(); setBusy(false); };

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return ranges;
    return ranges.filter((r) => { const { country } = splitRangeName(r.title); return r.title.toLowerCase().includes(s) || country.toLowerCase().includes(s); });
  }, [ranges, q]);

  const groups = useMemo(() => {
    const m: Record<string, { list: RangeItem[]; total: number }> = {};
    filtered.forEach((r) => { const { country } = splitRangeName(r.title); if (!m[country]) m[country] = { list: [], total: 0 }; m[country].list.push(r); m[country].total += r.count; });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const total = useMemo(() => ranges.reduce((s, r) => s + r.count, 0), [ranges]);
  const countries = useMemo(() => new Set(ranges.map((r) => splitRangeName(r.title).country)).size, [ranges]);

  const row = (r: RangeItem) => {
    const { country } = splitRangeName(r.title);
    return (
      <div key={r.id} onClick={() => onSelectRange(r)}
        className="px-3 py-2 rounded-xl glass-card border border-slate-200/70 dark:border-slate-800 hover:border-cyan-500/40 cursor-pointer transition-all flex items-center gap-2.5 group">
        <span className="text-2xl shrink-0 leading-none" title={country}>{getCountryFlag(country)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">{r.title}</div>
          <div className="text-[10px] text-slate-400 truncate">{country}</div>
        </div>
        <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 font-mono text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400 tabular-nums shrink-0">{r.count.toLocaleString()}</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); setModal({ rangeId: r.id, title: r.title, count: r.count }); }}
          className="p-1 rounded-md text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer shrink-0" title="Free numbers">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-cyan-500 transition-colors shrink-0" />
      </div>
    );
  };

  return (
    <div className="w-full max-w-full overflow-hidden space-y-2 pb-16">
      <PageHead title="Ranges" chip={ranges.length} />

      {/* ── Live OTP Banner ── */}
<div className="relative overflow-hidden rounded-2xl p-2 flex items-center gap-3 bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-500 shadow-lg shadow-blue-500/25 text-white">
  <span className="lb-spark absolute text-white/70 text-[10px] top-2 right-8 pointer-events-none">✦</span>
  {/* 📬 icon block beside the counter */}
  <div className="w-11 h-11 rounded-2xl bg-white/20 border border-white/30 backdrop-blur-sm flex items-center justify-center shrink-0 text-[26px] leading-none">📬</div>
  <div className="flex-1 min-w-0">
    <div className="text-[9px] font-bold uppercase tracking-wider text-white/80">Today's OTPs</div>
    <div className="font-heading font-extrabold text-2xl leading-none tabular-nums">{liveToday.toLocaleString()}</div>
    <div className="flex items-center gap-1.5 mt-1 text-[9px] font-bold text-white/85">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 dot-live" /> Live · auto-updating
    </div>
  </div>
  <button type="button" onClick={refreshLive} disabled={liveBusy}
    className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 flex items-center justify-center active:scale-95 transition-all cursor-pointer shrink-0" title="Refresh live count">
    <RefreshCw className={`w-3.5 h-3.5 ${liveBusy ? 'animate-spin' : ''}`} />
  </button>
</div>

      {/* ── Stat Strip ── */}
      <StatStrip items={[
        { label: 'Ranges', value: ranges.length, tone: 'text-cyan-600 dark:text-cyan-400' },
        { label: 'My Numbers', value: total.toLocaleString(), tone: 'text-indigo-600 dark:text-indigo-400' },
        { label: 'Countries', value: countries, tone: 'text-emerald-600 dark:text-emerald-400' }
      ]} />

      {/* ── Search Row: Search + Filter Toggle + Refresh ── */}
      <div className="flex items-center gap-1.5">
        <SearchBox value={q} onChange={setQ} placeholder="Search country or range…" icon={Search} />
        <IconBtn active={grouped} onClick={() => { const nv = !grouped; setGrouped(nv); setOpenCountry(null); try { localStorage.setItem('zamil_grp_' + username, nv ? '1' : '0'); } catch {} }} title={grouped ? 'Switch to flat list' : 'Group by country'}>
          {grouped ? <Layers className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
        </IconBtn>
        <IconBtn onClick={refresh} disabled={busy || isLoading} title="Sync ranges">
          <RefreshCw className={`w-3.5 h-3.5 ${busy || isLoading ? 'animate-spin text-cyan-500' : ''}`} />
        </IconBtn>
      </div>

      {/* ── Grouped View (Countries) ── */}
      {grouped && !openCountry ? (
        <div className="space-y-1.5">
          {groups.length === 0 ? <Empty icon={Inbox} text="No ranges yet" /> : groups.map(([country, g]) => (
            <div key={country} onClick={() => setOpenCountry(country)}
              className="px-3 py-2 rounded-xl glass-card border border-slate-200/70 dark:border-slate-800 hover:border-cyan-500/40 cursor-pointer transition-all flex items-center gap-2.5 group">
             <span className="text-2xl shrink-0 leading-none" title={country}>{getCountryFlag(country)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">{country}</div>
                <div className="text-[10px] text-slate-400 font-semibold">{g.list.length} range{g.list.length > 1 ? 's' : ''}</div>
              </div>
              <span className="font-mono text-xs font-extrabold text-cyan-600 dark:text-cyan-400 tabular-nums">{g.total.toLocaleString()}</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-cyan-500 transition-colors shrink-0" />
            </div>
          ))}
        </div>
      ) : (
        /* ── Flat / Country-Drill View ── */
        <div className="space-y-1.5">
          {openCountry && (
            <div className="flex items-center justify-between px-1">
              <button type="button" onClick={() => setOpenCountry(null)} className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer">← All countries</button>
              <span className="text-[10px] font-semibold text-slate-400 font-mono">{openCountry}</span>
            </div>
          )}
          {(openCountry ? filtered.filter((r) => splitRangeName(r.title).country === openCountry) : filtered).map(row)}
          {filtered.length === 0 && <Empty icon={Inbox} text="No ranges found" />}
        </div>
      )}

      {/* ── Unassign Modal ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md">
          <Card className="w-full max-w-sm p-5 shadow-2xl">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-500 flex items-center justify-center mb-3"><AlertTriangle className="w-5 h-5" /></div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1.5">Free numbers?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              Release <strong className="text-slate-800 dark:text-slate-200">{modal.count.toLocaleString()}</strong> from <strong className="text-slate-800 dark:text-slate-200">{modal.title}</strong>?
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setModal(null)} className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">Cancel</button>
              <button type="button" onClick={async () => { const t = modal; setModal(null); await onUnassignRange(t.rangeId, t.title, t.count); }}
                className="flex-1 px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors cursor-pointer shadow-sm shadow-rose-600/20">Free</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
export default RangesView;
// === EOF: RangesView.tsx ===
