import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { RangeItem } from '../types';
import { stripCC, stripPlus, getCountryFlag, splitRangeName } from '../utils/countryCodes';
import { OTP_CAP, ensureOtpDay } from '../utils/otpCounter';
import { useToast } from '../context/ToastContext';
import { postApi } from '../services/api';
import { ArrowLeft, Copy, Check, Search, RefreshCw, Eye, EyeOff, Filter, PhoneCall, X } from 'lucide-react';

interface NumbersViewProps {
  range: RangeItem;
  numbers: string[];
  liveTick?: number; // bumps when a new OTP arrives or the day rolls over
  onBack: () => void;
  onRefresh: () => Promise<void>;
}

export const NumbersView: React.FC<NumbersViewProps> = ({ range, numbers, liveTick = 0, onBack, onRefresh }) => {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [isStrippedCC, setIsStrippedCC] = useState(true);
  const [territoryFilter, setTerritoryFilter] = useState<'all' | '970' | '972'>('all');

  // USED marks — persisted per range, NEVER reset by the daily counter
  const [copiedNumbers, setCopiedNumbers] = useState<Set<string>>(() => {
    try { const stored = localStorage.getItem(`zamil_copied_${range.id}`); return stored ? new Set(JSON.parse(stored)) : new Set(); } catch { return new Set(); }
  });

  const [numberDetailsModal, setNumberDetailsModal] = useState<{ number: string; count: number; recent: any[] } | null>(null);
  const [isCopyingAll, setIsCopyingAll] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [detailsBusy, setDetailsBusy] = useState<string | null>(null);

  // ── Daily OTP counters: server truth + instant live bumps ──
  const [serverCounts, setServerCounts] = useState<Record<string, number>>({});
  const numbersRef = useRef<string[]>(numbers);
  const countReq = useRef(0);
  const lastCountAt = useRef(0);

  // local day store (empty automatically once the UTC day changes)
  const dayCounts = useMemo(() => ensureOtpDay().store.counts, [liveTick]);

  const loadCounts = useCallback(async (force = false) => {
    const list = numbersRef.current;
    if (!list.length) { setServerCounts({}); return; }
    const now = Date.now();
    if (!force && now - lastCountAt.current < 5000) return;
    lastCountAt.current = now;
    const id = ++countReq.current;
    const r = await postApi<any>('/api/numbers/otp-today', { numbers: list, rangeId: range.id });
    if (id !== countReq.current) return;
    if (r?.ok && r.counts && typeof r.counts === 'object') setServerCounts(r.counts);
  }, [range.id]);

  useEffect(() => { numbersRef.current = numbers; loadCounts(true); }, [numbers, loadCounts]);
  useEffect(() => { if (liveTick > 0) loadCounts(false); }, [liveTick, loadCounts]);

  const countFor = (n: string) => Math.min(OTP_CAP, Math.max(serverCounts[n] || 0, dayCounts[n] || 0));

  const hasTerritorySplit = useMemo(
    () => numbers.some((n) => { const p = stripPlus(n); return p.startsWith('970') || p.startsWith('972'); }),
    [numbers]
  );

  const filteredNumbers = useMemo(() => {
    const q = searchQuery.trim();
    return numbers.filter((num) => {
      const stripped = stripCC(num);
      const rawPlus = stripPlus(num);
      if (territoryFilter === '970' && !rawPlus.startsWith('970')) return false;
      if (territoryFilter === '972' && !rawPlus.startsWith('972')) return false;
      if (!q) return true;
      return num.includes(q) || stripped.includes(q);
    });
  }, [numbers, searchQuery, territoryFilter]);

  // Copying ONLY marks USED + records usage. It never touches the OTP counter.
  const handleCopySingle = async (numDisplay: string, numRaw: string) => {
    try {
      await navigator.clipboard.writeText(numDisplay);
      setCopiedNumbers((prev) => {
        const next = new Set(prev).add(numRaw);
        try { localStorage.setItem(`zamil_copied_${range.id}`, JSON.stringify(Array.from(next))); } catch {}
        return next;
      });
      showToast(`✓ ${numDisplay}`, 'success');
      postApi('/api/numbers/mark-used', { number: numRaw }).catch(() => {});
    } catch { showToast('Clipboard blocked', 'error'); }
  };

  const handleCopyAll = async () => {
    const listToCopy = filteredNumbers.map((n) => (isStrippedCC ? stripCC(n) : n));
    if (!listToCopy.length) return;
    try {
      setIsCopyingAll(true);
      await navigator.clipboard.writeText(listToCopy.join('\n'));
      setCopiedNumbers((prev) => {
        const next = new Set(prev);
        filteredNumbers.forEach((n) => next.add(n));
        try { localStorage.setItem(`zamil_copied_${range.id}`, JSON.stringify(Array.from(next))); } catch {}
        return next;
      });
      postApi('/api/numbers/mark-used-bulk', { numbers: filteredNumbers, rangeId: range.id, rangeTitle: range.title }).catch(() => {});
      showToast(`✓ ${listToCopy.length} copied`, 'success');
    } catch { showToast('Copy failed', 'error'); }
    finally { setTimeout(() => setIsCopyingAll(false), 1200); }
  };

  const openNumberDetails = async (rawNum: string) => {
    if (detailsBusy) return;
    setDetailsBusy(rawNum);
    const res = await postApi<any>('/api/number-smscount', { number: rawNum });
    setDetailsBusy(null);
    if (res?.ok) setNumberDetailsModal({ number: rawNum, count: res.count || 0, recent: Array.isArray(res.recent) ? res.recent : [] });
    else showToast(res?.error || 'Details unavailable for this number', 'error');
  };

  const rangeCountry = splitRangeName(range.title).country;

  return (
    <div className="w-full max-w-full overflow-hidden space-y-3 pb-20">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={onBack} className="w-8 h-8 rounded-xl glass-panel flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors shrink-0 cursor-pointer" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">
              <span className="text-2xl shrink-0 leading-none">{getCountryFlag(rangeCountry)}</span>
              <span>{range.title}</span>
              <span className="text-[10px] px-2 py-0.2 rounded-full font-mono font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shrink-0">{numbers.length}</span>
            </h2>
            <p className="text-[10px] text-slate-400">{isStrippedCC ? 'Prefix removed' : 'Full international'} · OTP count resets 5:00 AM PKT</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => setIsStrippedCC(!isStrippedCC)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold glass-panel text-slate-700 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors cursor-pointer" title="Toggle Country Code">
            {isStrippedCC ? <EyeOff className="w-3.5 h-3.5 text-cyan-500" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline text-[11px]">{isStrippedCC ? 'Restore CC' : 'Strip CC'}</span>
          </button>
          <button type="button" onClick={async () => { setIsRefreshing(true); await onRefresh(); loadCounts(true); setIsRefreshing(false); }} disabled={isRefreshing}
            className="w-8 h-8 rounded-xl glass-panel flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-cyan-600 transition-transform active:scale-95 cursor-pointer shrink-0" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-500' : ''}`} />
          </button>
        </div>
      </div>

      {hasTerritorySplit && (
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl glass-card">
          <span className="text-[10px] font-bold text-slate-400 px-1.5 flex items-center gap-1"><Filter className="w-3 h-3" /> Filter:</span>
          <button type="button" onClick={() => setTerritoryFilter('all')}
            className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${territoryFilter === 'all' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>All</button>
          <button type="button" onClick={() => setTerritoryFilter('970')}
            className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${territoryFilter === '970' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600'}`}>🇵🇸 970</button>
          <button type="button" onClick={() => setTerritoryFilter('972')}
            className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${territoryFilter === '972' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-blue-600'}`}>🇮🇱 972</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search within this range..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl glass-card text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-1 focus:ring-cyan-500/40" />
        </div>
        <button type="button" onClick={handleCopyAll} disabled={isCopyingAll || filteredNumbers.length === 0}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-sm shadow-cyan-600/20 active:scale-95 cursor-pointer shrink-0">
          {isCopyingAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span>Copy All ({filteredNumbers.length})</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {filteredNumbers.map((rawNum, idx) => {
          const displayNum = isStrippedCC ? stripCC(rawNum) : rawNum;
          const isCopied = copiedNumbers.has(rawNum);
          const cv = countFor(rawNum);
          return (
            <div key={rawNum} onClick={() => handleCopySingle(displayNum, rawNum)}
              className={`p-2.5 rounded-xl transition-all flex items-center justify-between gap-2 cursor-pointer group border ${
                isCopied ? 'bg-rose-50/70 dark:bg-rose-950/25 border-rose-200 dark:border-rose-900/40 text-rose-900 dark:text-rose-200'
                : 'glass-card border-slate-200/80 dark:border-slate-800 hover:border-cyan-500/40 hover:shadow-sm text-slate-800 dark:text-slate-100'}`}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="font-mono text-[10px] text-slate-400 font-bold shrink-0 w-5 text-right">{idx + 1}</span>
                <span className={`font-mono text-xs font-bold tracking-tight truncate ${isCopied ? 'line-through decoration-rose-400 text-rose-600 dark:text-rose-400' : ''}`}>{displayNum}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span title={`OTPs received today · resets 5:00 AM PKT`}
                  className={`px-1.5 py-0.2 rounded text-[8px] font-bold font-mono border ${
                    cv >= OTP_CAP ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                    : cv > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-slate-500/5 text-slate-400 border-slate-200 dark:border-slate-700'}`}>{cv}/{OTP_CAP}</span>
                {isCopied && <span className="px-1.5 py-0.2 rounded text-[8px] font-bold uppercase bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">USED</span>}
                <button type="button" onClick={(e) => { e.stopPropagation(); openNumberDetails(rawNum); }}
                  className="p-1 rounded text-slate-400 hover:text-cyan-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer" title="SMS stats">
                  {detailsBusy === rawNum ? <RefreshCw className="w-3 h-3 animate-spin text-cyan-500" /> : <PhoneCall className="w-3 h-3" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {numberDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl glass-card p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><PhoneCall className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /><h3 className="text-xs font-bold text-slate-900 dark:text-white font-mono">{numberDetailsModal.number}</h3></div>
              <button type="button" onClick={() => setNumberDetailsModal(null)} className="w-6 h-6 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
              <span className="text-xs text-slate-500">Total SMS today:</span>
              <span className="text-sm font-bold font-mono text-cyan-600 dark:text-cyan-400">{numberDetailsModal.count}</span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Recent OTP Logs</span>
              {numberDetailsModal.recent.length === 0 ? <p className="text-xs text-slate-400 italic">No messages</p> : numberDetailsModal.recent.map((msg: any, i: number) => (
                <div key={i} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-[11px] space-y-0.5">
                  <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300"><span>{msg.cli || 'OTP'}</span><span className="text-[10px] text-slate-400">{msg.time}</span></div>
                  <p className="text-slate-600 dark:text-slate-400 truncate">{msg.message}</p>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setNumberDetailsModal(null)} className="w-full py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:bg-slate-800 cursor-pointer">Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NumbersView;
