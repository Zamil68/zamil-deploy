import React, { useState, useEffect } from 'react';
import type { LeaderboardData, LeaderboardUser } from '../types';
import { prettyUser } from '../utils/fmt';
import { Card, IconBtn, Seg, Empty } from './Ui';
import { Trophy, Crown, RefreshCw, Search, Users, Zap, Target, Flame, ArrowUp, ArrowDown, Minus, Sparkles } from 'lucide-react';
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
          <circle cx="50" cy="50" r="48" fill="none" stroke={rank === 1 ? '#06b6d4' : rank === 2 ? '#0ea5e9' : '#6366f1'} strokeWidth="3" className="animate-pulse" opacity="0.6" />
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
            <path d="M 32 24 L 38 10 L 46 20 L 50 8 L 54 20 L 62 10 L 68 24 Z" fill="#22d3ee" stroke="#0891b2" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="38" cy="12" r="2" fill="#ef4444" />
            <circle cx="50" cy="10" r="2" fill="#3b82f6" />
            <circle cx="62" cy="12" r="2" fill="#10b981" />
          </g>
        )}
      </svg>
    </div>
  );
};
const Confetti: React.FC = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden">
    {[...Array(8)].map((_, i) => (
      <span key={i} className="confetti-piece absolute text-[10px]" style={{ left: `${10 + i * 12}%`, top: '-10px', animationDelay: `${i * 0.25}s`, color: ['#22d3ee', '#818cf8', '#38bdf8', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#0ea5e9'][i] }}>✦</span>
    ))}
  </div>
);
const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
  if (rank === 1) return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-cyan-600 dark:text-cyan-400"><Crown className="w-3 h-3 fill-cyan-400" />#1</span>;
  if (rank === 2) return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-sky-500">⭐#2</span>;
  if (rank === 3) return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-indigo-500">🌟#3</span>;
  return <span className="text-[9px] font-bold text-slate-400">#{rank}</span>;
};
const ChangeChip: React.FC<{ u: LeaderboardUser }> = ({ u }) => {
  if (u.prevRank == null) return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 text-[8px] font-black uppercase"><Sparkles className="w-2.5 h-2.5" />New</span>;
  const c = u.rankChange || 0;
  if (c > 0) return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[8px] font-black font-mono"><ArrowUp className="w-2.5 h-2.5" />{c}</span>;
  if (c < 0) return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[8px] font-black font-mono"><ArrowDown className="w-2.5 h-2.5" />{Math.abs(c)}</span>;
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20 text-[8px] font-black font-mono"><Minus className="w-2.5 h-2.5" /></span>;
};
const StreakChip: React.FC<{ n?: number }> = ({ n }) => (n && n >= 2 ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 text-[8px] font-black font-mono"><Flame className="w-2.5 h-2.5" />{n}d</span> : null);
// ── Brand-color Top 3 card: cyan/sky/indigo gradients, crown/star icons, trophy, ✨ sparkles, FULL name ──


const TopCard: React.FC<{ u: LeaderboardUser; rank: number; share: number; showMove: boolean }> = ({ u, rank, showMove }) => {
  const t = rank === 1
    ? {
        card: 'bg-[linear-gradient(160deg,#22d3ee_0%,#0ea5e9_38%,#4f46e5_100%)]',
        ring: 'ring-cyan-300/60',
        shadow: 'shadow-cyan-600/30',
        sub: 'OTP Champion',
        medal: '#fbbf24',
        medalDark: '#d97706',
        medalLight: '#fef3c7',
      }
    : rank === 2
      ? {
          card: 'bg-[linear-gradient(160deg,#7dd3fc_0%,#38bdf8_40%,#0369a1_100%)]',
          ring: 'ring-sky-300/60',
          shadow: 'shadow-sky-600/30',
          sub: 'Runner-up',
          medal: '#e2e8f0',
          medalDark: '#94a3b8',
          medalLight: '#ffffff',
        }
      : {
          card: 'bg-[linear-gradient(160deg,#a5b4fc_0%,#818cf8_40%,#4f46e5_100%)]',
          ring: 'ring-indigo-300/60',
          shadow: 'shadow-indigo-600/30',
          sub: 'Third place',
          medal: '#d97706',
          medalDark: '#92400e',
          medalLight: '#fcd34d',
        };

  const name = prettyUser(u.username);
  const streak = u.streak || 0;
  const move = u.rankChange || 0;

  const Medal = () => (
    <svg
      viewBox="0 0 48 48"
      className="w-9 h-9 shrink-0 drop-shadow"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={rank === 1 ? 'Gold medal' : rank === 2 ? 'Silver medal' : 'Bronze medal'}
    >
      <path d="M14 3H23L28 19L19 24L10 13L14 3Z" fill={t.medalDark} stroke="white" strokeOpacity=".3" strokeWidth="1" />
      <path d="M25 3H34L38 13L29 24L20 19L25 3Z" fill={t.medal} stroke="white" strokeOpacity=".3" strokeWidth="1" />
      <circle cx="24" cy="29" r="15" fill={t.medalDark} />
      <circle cx="24" cy="27" r="13" fill={t.medal} stroke={t.medalLight} strokeWidth="1.5" />
      <circle cx="24" cy="27" r="9" fill="none" stroke={t.medalLight} strokeOpacity=".8" strokeWidth="1" />
      <path d="M24 19L26.3 24L32 24.7L27.8 28.5L29 34L24 31.2L19 34L20.2 28.5L16 24.7L21.7 24L24 19Z" fill={t.medalLight} />
    </svg>
  );

  return (
    <div className={`relative flex-1 max-w-[150px] rounded-2xl ${t.card} ring-1 ${t.ring} shadow-xl ${t.shadow} overflow-hidden p-3 flex flex-col gap-2 text-white ${rank === 1 ? 'min-h-[215px]' : 'min-h-[195px] mt-5'} animate-in zoom-in-95 duration-300`}>

      <div className="podium-shine absolute inset-0 opacity-20 pointer-events-none" />

      <span className="lb-spark absolute text-white/80 text-[10px] top-2 left-3 pointer-events-none">✨</span>
      <span className="lb-spark absolute text-white/60 text-[9px] bottom-12 right-2 pointer-events-none" style={{ animationDelay: '1.2s' }}>✨</span>

      {rank === 1 && <Confetti />}

      {/* OTP Count + Avatar */}
      <div className="flex items-start justify-between gap-2 relative">
        <div>
          <div
  className="font-heading font-extrabold leading-none tabular-nums mt-1 drop-shadow-sm whitespace-nowrap"
  style={{
    fontSize: `${Math.max(15, Math.min(30, 120 / Math.max(u.count.toLocaleString().length, 1)))}px`,
  }}
>
  {u.count.toLocaleString('en-US')}
</div>
          <div className="text-[7px] font-bold uppercase tracking-widest text-white/75">
            OTPs
          </div>
        </div>

        <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-white/60 shrink-0 bg-white/20">
          <AnimatedAvatar name={u.username} rank={rank} size="w-10 h-10" />
        </div>
      </div>

      {/* FULL USERNAME - Above the bottom stats */}
      <div className="relative w-full min-w-0 mt-1">
        <div
          className="font-heading font-extrabold leading-tight whitespace-nowrap text-white drop-shadow-sm"
          style={{
            fontSize: `${Math.max(5, Math.min(12, 120 / Math.max(name.length, 1)))}px`,
          }}
          title={name}
        >
          {name}
        </div>
      </div>

      {/* Bottom: Streak + Move + Medal */}
      <div className="mt-auto flex items-center justify-between gap-1 relative">

        {/* Streak icon + number only */}
        <div
          className="flex items-center gap-1 shrink-0"
          title={`Streak: ${streak} days`}
        >
          <Flame className="w-3 h-3 text-orange-200" />
          <span className="font-mono text-[10px] font-black">
            {streak}
          </span>
        </div>

        {/* Position change icon + number only */}
        <div
          className="flex items-center gap-1 shrink-0"
          title={!showMove ? 'Position change unavailable' : u.prevRank == null ? 'New' : `Position change: ${move}`}
        >
          {!showMove ? (
            <Sparkles className="w-3 h-3 text-white" />
          ) : u.prevRank == null ? (
            <Sparkles className="w-3 h-3 text-white" />
          ) : move > 0 ? (
            <ArrowUp className="w-3 h-3 text-emerald-200" />
          ) : move < 0 ? (
            <ArrowDown className="w-3 h-3 text-rose-200" />
          ) : (
            <Minus className="w-3 h-3 text-white/70" />
          )}

          <span className="font-mono text-[10px] font-black">
            {!showMove ? '—' : u.prevRank == null ? '0' : Math.abs(move)}
          </span>
        </div>

        {/* SVG Medal */}
        <Medal />

      </div>

      {/* Rank description */}
      <div className="relative text-[8px] font-bold text-white/75 -mt-1">
        {t.sub}
      </div>

    </div>
  );
};


interface Props { data: LeaderboardData; activeRange: 'today' | 'week' | 'month'; onChangeRange: (r: 'today' | 'week' | 'month') => void; onRefresh: () => Promise<void>; isLoading: boolean; }
export const LeaderboardView: React.FC<Props> = ({ data, activeRange, onChangeRange, onRefresh, isLoading }) => {
  const { username } = useAuth();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'global' | 'team' | 'me'>('global');
  // mode from backend (kv_settings.leaderboard_mode): 'team' hides Global tab; 'global' shows all; Me always
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
  const tabBtn = (id: 'global' | 'team' | 'me', icon: any, label: string) => {
    const Ic = icon;
    const on = tab === id;
    return (
      <button type="button" onClick={() => setTab(id)}
        className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${on ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md shadow-cyan-600/25' : 'text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white'}`}>
        <Ic className="w-3 h-3" /> {label}
      </button>
    );
  };
  return (
    <div className="w-full max-w-full overflow-hidden space-y-2 pb-16">
      {/* ── Hero: brand light-blue / white (night: deep navy) ── */}
      <div className="relative overflow-hidden rounded-3xl border border-cyan-500/20 dark:border-cyan-300/10 bg-[radial-gradient(120%_90%_at_50%_0%,#ffffff_0%,#eaf6ff_45%,#d9edff_100%)] dark:bg-[radial-gradient(120%_90%_at_50%_0%,#0e2233_0%,#0b1626_55%,#0a0f1e_100%)] shadow-xl shadow-cyan-500/10 dark:shadow-black/40 p-3.5 pb-4">
        <span className="lb-spark absolute text-cyan-500/50 dark:text-cyan-200/40 text-[10px] top-6 left-8 pointer-events-none">✦</span>
        <span className="lb-spark absolute text-indigo-500/40 dark:text-indigo-200/30 text-[10px] top-16 right-10 pointer-events-none" style={{ animationDelay: '1.1s' }}>✦</span>
        <span className="lb-spark absolute text-sky-500/40 dark:text-sky-200/30 text-[9px] bottom-24 left-6 pointer-events-none" style={{ animationDelay: '2s' }}>✦</span>
        <div className="flex items-center justify-between gap-2 mb-2 relative z-10">
          <span className="font-heading font-extrabold text-sm flex items-center gap-1.5 text-slate-900 dark:text-white truncate">
            <span className="w-7 h-7 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-cyan-600/30 shrink-0"><Trophy className="w-3.5 h-3.5" /></span>
            Leaderboard
            {mode === 'team' && <span className="text-[9px] px-1.5 py-0.3 rounded-md bg-cyan-500/10 border border-cyan-500/25 font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">team</span>}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <Seg options={[{ id: 'today', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }]} value={activeRange} onChange={(r) => onChangeRange(r as any)} />
            <IconBtn onClick={onRefresh} disabled={isLoading} title="Refresh"><RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-500' : 'text-slate-500 dark:text-slate-300'}`} /></IconBtn>
          </div>
        </div>
        <div className="flex gap-1 mb-3 relative z-10 p-0.5 rounded-2xl bg-white/70 dark:bg-white/5 border border-cyan-500/20 dark:border-cyan-300/10">
          {showGlobalTab && tabBtn('global', Users, 'Global Top 10')}
          {tabBtn('team', Zap, 'Team Wars')}
          {tabBtn('me', Target, 'Me')}
        </div>
        {tab === 'global' && showGlobalTab && (
          !users.length ? <div className="py-8 text-center text-xs font-bold text-slate-500 dark:text-slate-400 relative z-10">No OTP yet — be the first</div> : (
            <div className="flex gap-2 items-stretch justify-center relative z-10">
              {p2 ? <TopCard u={p2} rank={2} share={Math.max(1, Math.round((p2.count / max) * 100))} showMove={activeRange === 'today'} /> : <div className="flex-1 max-w-[150px]" />}
              {p1 ? <TopCard u={p1} rank={1} share={100} showMove={activeRange === 'today'} /> : <div className="flex-1 max-w-[150px]" />}
              {p3 ? <TopCard u={p3} rank={3} share={Math.max(1, Math.round((p3.count / max) * 100))} showMove={activeRange === 'today'} /> : <div className="flex-1 max-w-[150px]" />}
            </div>
          )
        )}
        {tab === 'team' && (
          <div className="relative z-10 space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {!teams.length ? <div className="py-8 text-center text-xs font-bold text-slate-500 dark:text-slate-400">No team data yet</div> : teams.map((t, i) => (
              <div key={t.team} className={`flex items-center gap-2 p-2 rounded-xl border ${i === 0 ? 'bg-[linear-gradient(155deg,rgba(34,211,238,.25),rgba(79,70,229,.15))] border-cyan-500/40 shadow-md shadow-cyan-500/10' : 'bg-white/70 dark:bg-white/5 border-cyan-500/15 dark:border-cyan-300/10'}`}>
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${i === 0 ? 'bg-cyan-600 text-white' : i === 1 ? 'bg-sky-500 text-white' : i === 2 ? 'bg-indigo-500 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'}`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate text-slate-800 dark:text-white">{t.label || t.team}</div>
                  <div className="text-[9px] text-cyan-700 dark:text-cyan-300 truncate">Top: {t.top ? prettyUser(t.top.username) : '—'}</div>
                </div>
                <span className="font-mono text-xs font-extrabold tabular-nums text-slate-900 dark:text-white">{t.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'me' && data.me && (
          <div className="relative z-10 p-3 rounded-2xl bg-white/70 dark:bg-white/5 border border-cyan-500/25 dark:border-cyan-300/10 space-y-2">
            <div className="flex items-center gap-3">
              <AnimatedAvatar name={data.me.username} rank={data.me.rank} size="w-14 h-14" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate text-slate-900 dark:text-white">{prettyUser(data.me.username)}</div>
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[9px] font-black font-mono">#{data.me.rank}</span>
                  <StreakChip n={data.me.streak} />
                  {activeRange === 'today' && <ChangeChip u={data.me as LeaderboardUser} />}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-lg font-extrabold text-cyan-700 dark:text-cyan-300 tabular-nums">{data.me.count.toLocaleString()}</div>
                <div className="text-[8px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">otps</div>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-cyan-900/10 dark:bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500" style={{ width: `${data.me.percentile || 0}%` }} />
            </div>
            <div className="text-[9px] font-bold text-slate-500 dark:text-slate-400">Better than {data.me.percentile || 0}% of operators</div>
          </div>
        )}
        {tab === 'me' && !data.me && (<div className="relative z-10 py-8 text-center text-xs font-bold text-slate-500 dark:text-slate-400">No data yet — start sending OTPs!</div>)}
      </div>
      {/* ── Ranks 4–10 + your position ── */}
      {tab === 'global' && showGlobalTab && (<>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search user…" className="w-full pl-9 pr-3 py-2 rounded-full glass-card text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-1 focus:ring-cyan-500/40" />
        </div>
        {users.length === 0 ? <Empty icon={Trophy} text="No rankings yet" /> : (
          <Card className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {list.map((u, i) => {
              const rank = i + 4;
              return (
                <div key={u.username} className="px-3 py-2.5 flex items-center gap-2.5 hover:bg-cyan-500/5 dark:hover:bg-cyan-300/5 transition-colors">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center font-mono text-[10px] font-black shrink-0 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">{rank}</span>
                  <AnimatedAvatar name={u.username} size="w-8 h-8" delay={rank} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold truncate text-slate-900 dark:text-white">{prettyUser(u.username)}</span>
                      <RankBadge rank={rank} />
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {activeRange === 'today' && <ChangeChip u={u} />}
                      <StreakChip n={u.streak} />
                      <span className="text-[8px] font-bold text-slate-400 font-mono">{Math.max(1, Math.round((u.count / max) * 100))}% of lead</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[12px] font-extrabold text-slate-900 dark:text-white tabular-nums">{u.count.toLocaleString()}</div>
                    <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">otps</div>
                  </div>
                </div>
              );
            })}
            {s && !list.length && <div className="px-3 py-6 text-center text-[11px] font-bold text-slate-400">No user "{q}" in Top 10</div>}
          </Card>
        )}
        {data.me && !meIn && (
          <div className="px-3 py-2.5 flex items-center gap-2.5 rounded-xl border border-dashed border-cyan-600/40 dark:border-cyan-300/25 bg-cyan-500/5 dark:bg-cyan-300/5">
            <span className="w-7 h-7 rounded-full bg-gradient-to-r from-cyan-600 to-indigo-600 text-white flex items-center justify-center font-mono text-[9px] font-black shrink-0">#{data.me.rank}</span>
            <AnimatedAvatar name={data.me.username} size="w-8 h-8" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold truncate text-slate-900 dark:text-white">{prettyUser(data.me.username)}</span>
                <span className="text-[8px] px-1 py-0.2 rounded bg-cyan-600 text-white font-black">YOU</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                {activeRange === 'today' && <ChangeChip u={data.me as LeaderboardUser} />}
                <StreakChip n={data.me.streak} />
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-[12px] font-extrabold text-cyan-700 dark:text-cyan-300 tabular-nums">{data.me.count.toLocaleString()}</div>
              <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">your spot</div>
            </div>
          </div>
        )}
      </>)}
    </div>
  );
};
export default LeaderboardView;
// === EOF: LeaderboardView.tsx ===
