import React, { useState, useEffect, useMemo } from 'react';
import type { CliInsightsItem, CliStats } from '../types';
import { postApi } from '../services/api';
import { PageHead, IconBtn, StatStrip, Empty, SearchBox, Card } from './Ui';
import { Radio, Search, RefreshCw, ChevronDown, ChevronUp, Lock } from 'lucide-react';
interface Props { onBack?: () => void; }
export const CliInsightsView: React.FC<Props> = ({ onBack }) => {
  const [gate, setGate] = useState<boolean | null>(null);
  const [list, setList] = useState<CliInsightsItem[]>([]);
  const [stats, setStats] = useState<CliStats | null>(null);
  const [q, setQ] = useState('');
  const [openCli, setOpenCli] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    const g = await postApi<any>('/api/cli/gate');
    setGate(!!g?.insights);
    if (g?.insights) { const d = await postApi<any>('/api/cli/analysis'); if (d?.ok) { setList(d.list || []); setStats(d.stats || null); } }
    setBusy(false);
  };
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return list;
    return list.filter((x) => x.cli.toLowerCase().includes(s) || x.countries.map((c) => c.name).join(' ').toLowerCase().includes(s));
  }, [list, q]);
  if (gate === false) return (
    <div className="w-full max-w-full overflow-hidden space-y-2 pb-16">
      <PageHead title="CLI Insights" onBack={onBack} />
      <Empty icon={Lock} text="Not enabled for you" />
    </div>
  );
  return (
    <div className="w-full max-w-full overflow-hidden space-y-2 pb-16">
      <PageHead title="CLI Insights" chip={list.length} sub="App traffic · from DB" onBack={onBack}
        right={<IconBtn onClick={load} disabled={busy} title="Refresh"><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin text-cyan-500' : ''}`} /></IconBtn>} />
      <StatStrip items={[
        { label: 'SMS Today', value: (stats?.totalSms ?? 0).toLocaleString(), tone: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'Apps', value: (stats?.totalCli ?? 0).toLocaleString(), tone: 'text-cyan-600 dark:text-cyan-400' },
        { label: 'Top Region', value: stats?.topCountry?.name || '—', tone: 'text-indigo-600 dark:text-indigo-400' }
      ]} />
      <SearchBox value={q} onChange={setQ} placeholder="Search app or country…" icon={Search} />
      <div className="space-y-1.5">
        {filtered.length === 0 ? <Empty icon={Radio} text="No CLI traffic yet" /> : filtered.map((x, i) => (
          <Card key={x.cli} className="overflow-hidden">
            <div onClick={() => setOpenCli(openCli === x.cli ? null : x.cli)} className="px-3 py-2 flex items-center gap-2.5 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-extrabold shrink-0 ${i === 0 ? 'bg-amber-400 text-amber-950' : i === 1 ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : i === 2 ? 'bg-amber-700 text-amber-100' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'}`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate text-slate-900 dark:text-white">{x.cli}</div>
                <div className="text-[10px] text-slate-400 truncate">{x.countries.slice(0, 4).map((c) => c.flag).join(' ')}</div>
              </div>
              <span className="font-mono text-xs font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">{x.count.toLocaleString()}</span>
              {openCli === x.cli ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
            </div>
            {openCli === x.cli && (
              <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 space-y-1 bg-slate-50/60 dark:bg-slate-800/40">
                {x.countries.map((c) => (
                  <div key={c.name} className="flex items-center gap-2 text-[11px] py-0.5">
                    <span className="text-sm">{c.flag}</span>
                    <span className="flex-1 truncate font-semibold text-slate-700 dark:text-slate-300">{c.name}</span>
                    <span className="font-mono text-[10px] font-bold text-cyan-600 dark:text-cyan-400 truncate max-w-[40%]">{c.range}</span>
                    <span className="font-mono text-[10px] font-bold text-slate-500 w-10 text-right">{c.n.toLocaleString()}</span>
                  </div>
                ))}
                {x.samples?.map((s, j) => (
                  <div key={j} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
                    <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 mr-1">{s.t}</span>{s.text}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};
export default CliInsightsView;