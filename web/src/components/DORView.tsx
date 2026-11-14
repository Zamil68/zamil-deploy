import React, { useState, useMemo } from 'react';
import type { SmsMessage } from '../types';
import { PageHead, IconBtn, Empty, SearchBox, Seg, Card } from './Ui';
import { FileSpreadsheet, RefreshCw, Search, Smartphone, User, Sparkles } from 'lucide-react';
interface DORViewProps { messages: SmsMessage[]; onRefresh: () => Promise<void>; isLoading: boolean; }
export const DORView: React.FC<DORViewProps> = ({ messages, onRefresh, isLoading }) => {
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState('25');
  const code = (m: string) => { const x = String(m || '').match(/\b(\d{4,8})\b/); return x ? x[1] : null; };
  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return messages;
    return messages.filter((m) => String(m.client || '').toLowerCase().includes(s) || String(m.number || '').includes(s) || String(m.cli || '').toLowerCase().includes(s) || String(m.message || '').toLowerCase().includes(s));
  }, [messages, q]);
  const visible = useMemo(() => (limit === '0' ? filtered : filtered.slice(0, parseInt(limit, 10))), [filtered, limit]);
  return (
    <div className="w-full max-w-full overflow-hidden space-y-2 pb-16">
      <PageHead title="DOR" chip={messages.length} sub="Global OTP feed"
        right={<IconBtn onClick={async () => { setBusy(true); await onRefresh(); setBusy(false); }} disabled={busy || isLoading} title="Refresh">
          <RefreshCw className={`w-3.5 h-3.5 ${busy || isLoading ? 'animate-spin text-cyan-500' : ''}`} />
        </IconBtn>} />
      <div className="flex items-center gap-1.5">
        <SearchBox value={q} onChange={setQ} placeholder="Search client, app, number…" icon={Search} />
        <Seg options={[{ id: '25', label: '25' }, { id: '50', label: '50' }, { id: '0', label: 'All' }]} value={limit} onChange={setLimit} />
      </div>
      <div className="space-y-1.5">
        {visible.length === 0 ? <Empty icon={FileSpreadsheet} text="No records today" /> : visible.map((m, i) => {
          const c = code(m.message);
          return (
            <Card key={i} className="px-3 py-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-md border border-indigo-500/20 font-mono text-[10px] truncate">{m.cli || 'GW'}</span>
                  {m.client && <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate"><User className="w-3 h-3" />{m.client}</span>}
                </div>
                <span className="font-mono text-[10px] text-slate-400 shrink-0">{m.time}</span>
              </div>
              <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug line-clamp-2 break-words">
                {c ? (<><span className="font-mono font-extrabold text-white bg-gradient-to-r from-cyan-600 to-indigo-600 px-1.5 py-0.2 rounded-md mr-1 tracking-wider">{c}</span>{String(m.message).split(c).join('')}</>) : m.message}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-slate-400 flex items-center gap-1 truncate"><Smartphone className="w-3 h-3" />{m.number}</span>
                {m.range && <span className="text-[9px] font-bold text-cyan-600 dark:text-cyan-400 truncate flex items-center gap-1"><Sparkles className="w-3 h-3" />{m.range}</span>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
export default DORView;
