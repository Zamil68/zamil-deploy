import React, { useState, useEffect } from 'react';
import type { LeaderboardData, LeaderboardUser } from '../types';
import { prettyUser } from '../utils/fmt';
import { Card, IconBtn, Seg, Empty } from './Ui';
import { Trophy, Crown, RefreshCw, Search, Users, Zap, TrendingUp, TrendingDown, Minus, Target } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
const hue = (s: string) => { let h = 0; for (let i = 0; i < String(s).length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 360; };
// ── Cute Animated Mascot Avatar ──
const AnimatedAvatar: React.FC<{ name: string; rank?: number; size: string; delay?: number }> = ({ name, rank, size, delay = 0 }) => {
const h = hue(name);
const bg = `hsl(${h}, 70%, 85%)`;
const bgDark = `hsl(${h}, 60%, 75%)`;
return (
<div className={`${size} relative avatar-float`} style={{ animationDelay: `${delay * 0.2}s` }}>
<svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
<defs>
<radialGradient id={`bg-${name}`} cx="50%" cy="40%">
<stop offset="0%" stopColor={bg} />
<stop offset="100%" stopColor={bgDark} />
</radialGradient>
</defs>
{rank && rank <= 3 && (
<circle cx="50" cy="50" r="48" fill="none" stroke={rank === 1 ? '#fbbf24' : rank === 2 ? '#cbd5e1' : '#d97706'} strokeWidth="3" className="animate-pulse" opacity="0.6" />
)}
<circle cx="50" cy="50" r="46" fill={`url(#bg-${name})`} />
<ellipse cx="50" cy="54" rx="26" ry="24" fill="#ffffff" opacity="0.9" />
<g className="avatar-eyes" style={{ transformOrigin: '50px 54px' }}>
<circle cx="40" cy="50" r="4" fill="#0f172a" />
<circle cx="41.5" cy="48.5" r="1.5" fill="#ffffff" />
<circle cx="60" cy="50" r="4" fill="#0f172a" />
<circle cx="61.5" cy="48.5" r="1.5" fill="#ffffff" />
</g>
<ellipse cx="34" cy="58" rx="4" ry="2.5" fill="#fda4af" opacity="0.6" />
<ellipse cx="66" cy="58" rx="4" ry="2.5" fill="#fda4af" opacity="0.6" />
<path d="M 42 62 Q 50 68 58 62" stroke="#0f172a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
{rank === 1 && (
<g className="avatar-crown" style={{ transformOrigin: '50px 20px' }}>
<path d="M 32 24 L 38 10 L 46 20 L 50 8 L 54 20 L 62 10 L 68 24 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="2" strokeLinejoin="round" />
<circle cx="38" cy="12" r="2" fill="#ef4444" />
<circle cx="50" cy="10" r="2" fill="#3b82f6" />
<circle cx="62" cy="12" r="2" fill="#10b981" />
</g>
)}
{(rank === 2 || rank === 3) && (
<g>
<path d="M 42 78 L 50 88 L 58 78" fill="none" stroke={rank === 2 ? '#94a3b8' : '#b45309'} strokeWidth="2" />
<circle cx="50" cy="86" r="7" fill={rank === 2 ? '#e2e8f0' : '#f59e0b'} stroke={rank === 2 ? '#94a3b8' : '#d97706'} strokeWidth="1.5" />
<text x="50" y="89" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#0f172a">{rank}</text>
</g>
)}
</svg>
</div>
);
};
const Confetti: React.FC = () => (
<div className="absolute inset-0 pointer-events-none overflow-hidden">
{[...Array(8)].map((_, i) => (
<span key={i} className="confetti-piece absolute text-[10px]" style={{ left: `${10 + i * 12}%`, top: '-10px', animationDelay: `${i * 0.25}s`, color: ['#fbbf24', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'][i] }}>✦</span>
))}
</div>
);
const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
if (rank === 1) return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-500"><Crown className="w-3 h-3 fill-amber-400" />#1</span>;
if (rank === 2) return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-slate-400">🥈#2</span>;
if (rank === 3) return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700">🥉#3</span>;
return <span className="text-[9px] font-bold text-slate-400">#{rank}</span>;
};
const Pod: React.FC<{ u: LeaderboardUser; rank: number; height: string }> = ({ u, rank, height }) => {
const gradients: Record<number, string> = { 1: 'from-amber-400/30 via-yellow-500/20 to-transparent', 2: 'from-slate-300/30 via-slate-400/20 to-transparent', 3: 'from-orange-400/30 via-amber-600/20 to-transparent' };
return (
<div className="flex flex-col items-center gap-1.5 flex-1 max-w-[120px] animate-in zoom-in-95 duration-300 relative">
{rank === 1 && <Confetti />}
<div className="relative">
<AnimatedAvatar name={u.username} rank={rank} size={rank === 1 ? 'w-16 h-16' : 'w-12 h-12'} delay={rank} />
</div>
<span className="text-[10px] font-bold truncate max-w-full text-white/90">{prettyUser(u.username)}</span>
<span className="font-mono text-[10px] font-extrabold text-cyan-200 tabular-nums">{u.count.toLocaleString()}</span>
<div className={`w-full ${height} rounded-t-xl bg-gradient-to-t ${gradients[rank]} backdrop-blur-sm border border-white/20 border-b-0 flex items-start justify-center pt-1.5 relative overflow-hidden`}>
<div className="absolute inset-0 podium-shine opacity-40" />
<span className={`font-heading font-extrabold relative z-10 ${rank === 1 ? 'text-amber-300 text-sm' : rank === 2 ? 'text-slate-200 text-xs' : 'text-orange-300 text-xs'}`}>
{rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd'}
</span>
</div>
</div>
);
};
interface Props { data: LeaderboardData; activeRange: 'today' | 'week' | 'month'; onChangeRange: (r: 'today' | 'week' | 'month') => void; onRefresh: () => Promise<void>; isLoading: boolean; }
export const LeaderboardView: React.FC<Props> = ({ data, activeRange, onChangeRange, onRefresh, isLoading }) => {
const { username } = useAuth();
const [q, setQ] = useState('');
const [tab, setTab] = useState<'global' | 'team' | 'me'>('global');
// FIX: mode now comes from the backend (kv_settings.leaderboard_mode):
// 'team' → Global tab hidden (Team + Me only) · 'global' → Global + Team + Me · Me always works
const [mode, setMode] = useState<string>((data as any).mode || 'global');
useEffect(() => {
const m = (data as any).mode || 'global';
setMode(m);
if (m === 'team') setTab((t) => (t === 'global' ? 'team' : t));
}, [(data as any).mode]);
const showGlobalTab = mode !== 'team';
const users = (data.users || []) as LeaderboardUser[];
const teams = data.secondary || [];
const [p1, p2, p3] = [users[0], users[1], users[2]];
const rest = users.slice(3, 10);
const max = p1 ? Math.max(p1.count, 1) : 1;
const meIn = users.slice(0, 10).some((u) => u.username === data.me?.username);
const s = q.toLowerCase().trim();
const list = s ? rest.filter((u) => u.username.toLowerCase().includes(s)) : rest;
return (
<div className="w-full max-w-full overflow-hidden space-y-2 pb-16">
<div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-600 via-indigo-600 to-indigo-900 dark:from-cyan-800 dark:via-indigo-950 dark:to-slate-950 p-3.5 pb-0 text-white shadow-lg shadow-indigo-600/25">
{[[8, 14], [24, 6], [50, 4], [72, 9], [90, 16], [12, 42], [92, 40], [40, 12]].map((p, i) => (<span key={i} className="lb-spark absolute text-cyan-200 text-[10px] pointer-events-none" style={{ top: `${p[1]}%`, left: `${p[0]}%`, animationDelay: `${i * 0.45}s` }}>✦</span>))}
<div className="flex items-center justify-between gap-2 mb-2 relative z-10">
<span className="font-heading font-extrabold text-sm flex items-center gap-1.5"><Trophy className="w-4 h-4 text-amber-300 fill-amber-300" /> Leaderboard{mode !== 'auto' && <span className="text-[9px] px-1.5 py-0.3 rounded-md bg-white/15 border border-white/20 font-bold uppercase tracking-wider">{mode}</span>}</span>
<div className="flex items-center gap-1.5">
<Seg options={[{ id: 'today', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }]} value={activeRange} onChange={(r) => onChangeRange(r as any)} />
<IconBtn onClick={onRefresh} disabled={isLoading} title="Refresh"><RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} /></IconBtn>
</div>
</div>
<div className="flex gap-1 mb-3 relative z-10">
{showGlobalTab && (
<button onClick={() => setTab('global')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${tab === 'global' ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}><Users className="w-3 h-3 inline mr-1" /> Global Top 10</button>
)}
<button onClick={() => setTab('team')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${tab === 'team' ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}><Zap className="w-3 h-3 inline mr-1" /> Team Wars</button>
<button onClick={() => setTab('me')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${tab === 'me' ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}><Target className="w-3 h-3 inline mr-1" /> Me</button>
</div>
{tab === 'global' && showGlobalTab && (!users.length ? <div className="py-8 text-center text-xs font-bold text-white/80 relative z-10">No OTP yet today</div> : <div className="flex items-end justify-center gap-3 pt-2 relative z-10">{p2 ? <Pod u={p2} rank={2} height="h-14" /> : <div className="flex-1 max-w-[110px]" />}{p1 ? <Pod u={p1} rank={1} height="h-20" /> : <div className="flex-1 max-w-[110px]" />}{p3 ? <Pod u={p3} rank={3} height="h-10" /> : <div className="flex-1 max-w-[110px]" />}</div>)}
{tab === 'team' && (<div className="relative z-10 pb-4">{!teams.length ? <div className="py-8 text-center text-xs font-bold text-white/80">No team data yet</div> : (<div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">{teams.map((t, i) => (<div key={t.team} className="flex items-center gap-2 p-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10"><span className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${i === 0 ? 'bg-amber-400 text-amber-950' : i === 1 ? 'bg-slate-200 text-slate-700' : i === 2 ? 'bg-amber-700 text-amber-100' : 'bg-white/20 text-white'}`}>{i + 1}</span><div className="flex-1 min-w-0"><div className="text-xs font-bold text-white truncate">{t.label || t.team}</div><div className="text-[9px] text-cyan-200">Top: {t.top ? prettyUser(t.top.username) : '—'}</div></div><span className="font-mono text-xs font-extrabold text-white tabular-nums">{t.count.toLocaleString()}</span></div>))}</div>)}</div>)}
{tab === 'me' && data.me && (<div className="relative z-10 pb-4"><div className="p-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 space-y-2"><div className="flex items-center gap-3"><AnimatedAvatar name={data.me.username} rank={data.me.rank} size="w-14 h-14" /><div className="flex-1 min-w-0"><div className="text-sm font-bold text-white truncate">{prettyUser(data.me.username)}</div><div className="text-[10px] text-cyan-200">Rank #{data.me.rank} · {data.me.count.toLocaleString()} OTPs</div></div></div></div></div>)}
{tab === 'me' && !data.me && (<div className="relative z-10 py-8 text-center text-xs font-bold text-white/80">No data yet — start sending OTPs!</div>)}
</div>
{tab === 'global' && showGlobalTab && (<>
<div className="relative"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" /><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search user…" className="w-full pl-9 pr-3 py-2 rounded-full glass-card text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-1 focus:ring-cyan-500/40" /></div>
{users.length === 0 ? <Empty icon={Trophy} text="No rankings yet" /> : (<Card className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">{list.map((u, i) => { const rank = i + 4; return (<div key={u.username} className="px-3 py-2.5 flex items-center gap-2.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"><span className="font-mono text-[11px] font-extrabold text-slate-400 w-5 text-center shrink-0">{rank}</span><AnimatedAvatar name={u.username} size="w-8 h-8" delay={rank} /><div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><span className="text-[11px] font-bold truncate text-slate-900 dark:text-white">{prettyUser(u.username)}</span><RankBadge rank={rank} /></div><div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 mt-1 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500" style={{ width: `${Math.max(4, Math.round((u.count / max) * 100))}%` }} /></div></div><span className="font-mono text-[11px] font-extrabold text-slate-900 dark:text-white tabular-nums w-14 text-right shrink-0">{u.count.toLocaleString()}</span></div>); })}{s && !list.length && <div className="px-3 py-6 text-center text-[11px] font-bold text-slate-400">No user "{q}" in Top 10</div>}{data.me && !meIn && (<div className="px-3 py-2.5 flex items-center gap-2.5 bg-cyan-500/10"><span className="font-mono text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400 w-5 text-center shrink-0">#{data.me.rank}</span><AnimatedAvatar name={data.me.username} size="w-8 h-8" /><span className="flex-1 min-w-0 text-[11px] font-bold truncate text-cyan-900 dark:text-cyan-100">{prettyUser(data.me.username)} <span className="text-[8px] px-1 py-0.2 rounded bg-cyan-600 text-white font-bold ml-1">YOU</span></span><span className="font-mono text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400 tabular-nums shrink-0">{data.me.count.toLocaleString()}</span></div>)}</Card>)}
</>)}
</div>
);
};
export default LeaderboardView;
// === EOF: LeaderboardView.tsx ===
