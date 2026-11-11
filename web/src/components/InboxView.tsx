import React, { useState, useMemo } from 'react';
import { SmsMessage } from '../types';
import { useToast } from '../context/ToastContext';
import { PageHead, IconBtn, StatStrip, Empty, SearchBox, Seg } from './Ui';
import { Inbox, RefreshCw, Search, Sparkles, Smartphone } from 'lucide-react';
interface InboxViewProps {
messages: SmsMessage[]; todayCount: number; weekCount: number; monthCount: number;
onRefresh: () => Promise<void>; isLoading: boolean;
}
export const InboxView: React.FC<InboxViewProps> = ({ messages, todayCount, weekCount, monthCount, onRefresh, isLoading }) => {
const { showToast } = useToast();
const [q, setQ] = useState('');
const [busy, setBusy] = useState(false);
const [limit, setLimit] = useState('10');
const code = (m: string) => { const x = String(m || '').match(/\b(\d{4,8})\b/); return x ? x[1] : null; };
const copy = async (c: string) => { try { await navigator.clipboard.writeText(c); showToast(`✓ ${c}`, 'success'); } catch { showToast('Copy failed', 'error'); } };
const filtered = useMemo(() => {
const s = q.toLowerCase().trim();
if (!s) return messages;
return messages.filter((m) => m.message.toLowerCase().includes(s) || m.cli.toLowerCase().includes(s) || m.number.includes(s) || (m.range && m.range.toLowerCase().includes(s)));
}, [messages, q]);
const visible = useMemo(() => (limit === '0' ? filtered : filtered.slice(0, parseInt(limit, 10))), [filtered, limit]);
return (
<div className="w-full max-w-full overflow-hidden space-y-2 pb-16">
<PageHead title="Live OTP" chip={todayCount.toLocaleString()}
right={<IconBtn onClick={async () => { setBusy(true); await onRefresh(); setBusy(false); }} disabled={busy || isLoading} title="Sync">
<RefreshCw className={`w-3.5 h-3.5 ${busy || isLoading ? 'animate-spin text-cyan-500' : ''}`} />
</IconBtn>} />
<StatStrip items={[
{ label: 'Today', value: todayCount.toLocaleString(), tone: 'text-cyan-600 dark:text-cyan-400' },
{ label: 'Week', value: weekCount.toLocaleString(), tone: 'text-indigo-600 dark:text-indigo-400' },
{ label: 'Month', value: monthCount.toLocaleString(), tone: 'text-purple-600 dark:text-purple-400' }
]} />
<div className="flex items-center gap-1.5">
<SearchBox value={q} onChange={setQ} placeholder="Search app, number, text…" icon={Search} />
<Seg options={[{ id: '10', label: '10' }, { id: '25', label: '25' }, { id: '0', label: 'All' }]} value={limit} onChange={setLimit} />
</div>
<div className="space-y-1.5">
{visible.length === 0 ? <Empty icon={Inbox} text="No OTP yet" /> : visible.map((msg, i) => {
const c = code(msg.message);
return (
<div key={i} className="px-3 py-2 rounded-xl glass-card border border-slate-200/70 dark:border-slate-800 hover:border-cyan-500/40 transition-colors space-y-1 select-none">
<div className="flex items-center justify-between gap-2">
{/* FIX: solid light-blue pill + non-selectable → no more selection "color leak" half-fill */}
<span className="font-bold text-cyan-700 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-500/10 px-1.5 py-0.5 rounded-md border border-cyan-500/20 font-mono text-[10px] truncate select-none">{msg.cli || 'OTP'}</span>
{msg.range && <span className="text-[10px] text-slate-400 truncate flex-1 text-center">{msg.range}</span>}
<span className="font-mono text-[10px] text-slate-400 shrink-0">{msg.time}</span>
</div>
<p className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug line-clamp-2 break-words">{msg.message}</p>
<div className="flex items-center justify-between gap-2">
<span className="font-mono text-[10px] text-slate-400 flex items-center gap-1 truncate"><Smartphone className="w-3 h-3" />{msg.number}</span>
{c && (
<button type="button" onClick={() => copy(c)}
className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold font-mono transition-all cursor-pointer active:scale-95 shrink-0 select-none">
<Sparkles className="w-3 h-3" />{c}
</button>
)}
</div>
</div>
);
})}
{limit !== '0' && filtered.length > parseInt(limit, 10) && (
<button type="button" onClick={() => setLimit(String(parseInt(limit, 10) + 25))}
className="w-full py-2 rounded-xl glass-card border border-cyan-500/30 text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 transition-colors cursor-pointer">
More ({filtered.length - parseInt(limit, 10)})
</button>
)}
</div>
</div>
);
};
export default InboxView;
// === EOF: InboxView.tsx ===
