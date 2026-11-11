import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { postApi } from '../services/api';
import { getCountryFlag } from '../utils/countryCodes';
import { Card, PageHead, IconBtn, Empty, SearchBox, StatStrip } from './Ui';
import { RefreshCw, Server, Users, Zap, Database, AlertTriangle, Megaphone, KeyRound, UserPlus, Gift, Trash2, Search, Check, X, Ship, Clock, BarChart3, CalendarRange, Crown, TrendingUp, Activity, UserX, Pin, PinOff } from 'lucide-react';
interface Props { initialTab?: string; onBack: () => void; }
const pu = (s: string): string => String(s || '').split(/(_|[\s-]+)/).map((seg) => { if (!seg || /[_\s-]+/.test(seg)) return seg; const l = seg.toLowerCase(); if (['sms','otp','api','lm','uk','us','pk','tv','hq'].includes(l)) return l.toUpperCase(); if (l.length <= 4) return l.toUpperCase(); return l.charAt(0).toUpperCase() + l.slice(1); }).join('');
const Mini: React.FC<{ v: React.ReactNode; l: string; tone?: string; live?: boolean }> = ({ v, l, tone, live }) => (
  <div className="px-1 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center min-w-0 relative">
    {live && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 dot-live" />}
    <div className={`font-heading font-extrabold text-[14px] leading-none tabular-nums truncate ${tone || 'text-slate-900 dark:text-white'}`}>{v}</div>
    <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mt-1 truncate">{l}</div>
  </div>
);
const Spark: React.FC<{ vals: number[]; color: string }> = ({ vals, color }) => {
  const v = vals && vals.length ? vals : [0, 0];
  const W = 300, H = 56, P = 5, max = Math.max(...v, 1);
  const pts = v.map((x, i) => `${P + (i * (W - 2 * P)) / Math.max(1, v.length - 1)},${H - P - (x / max) * (H - 2 * P)}`).join(' ');
  return (<svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12"><polyline points={`${P},${H - P} ${pts} ${W - P},${H - P}`} fill={color} opacity=".1" stroke="none" /><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>);
};
const Bars: React.FC<{ vals: number[]; labels: string[] }> = ({ vals, labels }) => {
  const max = Math.max(...vals, 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {vals.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5 min-w-0 h-full">
          <span className="text-[7px] font-bold text-slate-400 font-mono">{v || ''}</span>
          <div className="w-full rounded-t-md bg-gradient-to-t from-cyan-500 to-indigo-400" style={{ height: `${Math.max(4, (v / max) * 100)}%` }} />
          <span className="text-[7px] font-bold text-slate-400 uppercase">{labels[i] || ''}</span>
        </div>
      ))}
    </div>
  );
};
const TAB_ICON: Record<string, any> = { scc: Server, fleet: Database, team: Users, limits: Gift, bulk: Ship, crush: Trash2, otp: CalendarRange, trep: BarChart3 };
const TABS = [{ id: 'scc', label: 'SCC' }, { id: 'fleet', label: 'Fleet' }, { id: 'team', label: 'Team' }, { id: 'limits', label: 'Limits' }, { id: 'bulk', label: 'Bulk' }, { id: 'crush', label: 'Crush' }, { id: 'otp', label: 'OTP Rep' }, { id: 'trep', label: 'Team Rep' }];
export const AdminConsoleView: React.FC<Props> = ({ initialTab = 'scc', onBack }) => {
  const { role } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState(initialTab);
  const [confirm, setConfirm] = useState<{ title: string; body: string; danger?: boolean; fn: () => Promise<void> } | null>(null);
  const [scc, setScc] = useState<any>(null); const [sccBusy, setSccBusy] = useState(false); const [alertHidden, setAlertHidden] = useState(false);
  const [fleet, setFleet] = useState<any[]>([]); const [fleetQ, setFleetQ] = useState(''); const [fleetF, setFleetF] = useState('all');
  const [prog, setProg] = useState<any>(null); const [fleetBusy, setFleetBusy] = useState(false);
  const [teams, setTeams] = useState<any[]>([]); const [prefixes, setPrefixes] = useState<any[]>([]); const [report, setReport] = useState<any>(null); const [teamBusy, setTeamBusy] = useState(false);
  const [admins, setAdmins] = useState<any[]>([]);
  const [pf, setPf] = useState({ prefix: '', admin: '', suffix: '', name: '', pinPrefix: '', pinUser: '' });
  // FIX: Team-prefix input now has its OWN state (was sharing pf.prefix with the Create-ID select)
  const [tpPrefix, setTpPrefix] = useState('');
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [pw, setPw] = useState({ u: '', p: '', promo: '' });
  const [limF, setLimF] = useState<any>({ qm: '', rd: '', cd: '' });
  const [limUser, setLimUser] = useState(''); const [limStatus, setLimStatus] = useState<any>(null); const [limBusy, setLimBusy] = useState(false);
  const [bulkR, setBulkR] = useState<any[]>([]); const [bulkU, setBulkU] = useState<string[]>([]);
  const [selR, setSelR] = useState<string[]>([]); const [selU, setSelU] = useState<string[]>([]);
  const [bulkQ, setBulkQ] = useState(''); const [bulkUQ, setBulkUQ] = useState(''); const [bulkQty, setBulkQty] = useState('50');
  const [dockPending, setDockPending] = useState(0); const [bulkBusy, setBulkBusy] = useState(false);
  const [crushOpts, setCrushOpts] = useState<any[]>([]); const [crushSugs, setCrushSugs] = useState<any[]>([]);
  const [crushSel, setCrushSel] = useState(''); const [hard, setHard] = useState(false); const [crushBusy, setCrushBusy] = useState(false);
  const [lbMode, setLbModeState] = useState('team');
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  const loadScc = async () => { setSccBusy(true); const r = await postApi<any>('/api/scc/status'); if (r?.ok) setScc(r); setSccBusy(false); };
  const loadFleet = async () => { setFleetBusy(true); const [f, p] = await Promise.all([postApi<any>('/api/admin/fleet-ranges'), postApi<any>('/api/admin/sync-progress')]); if (f?.ok) setFleet(f.ranges || []); if (p?.ok) setProg(p.prog); setFleetBusy(false); };
  const loadTeam = async () => {
    setTeamBusy(true);
    const [t, px, rp, a] = await Promise.all([
      postApi<any>('/api/admin/my-clients'),
      postApi<any>('/api/admin/team-prefixes'),
      postApi<any>('/api/admin/team-report'),
      postApi<any>('/api/admin/admins')
    ]);
    if (t?.ok) setTeams(t.teams || []);
    if (px?.ok) setPrefixes(px.prefixes || []);
    if (rp?.ok) setReport(rp);
    if (a?.ok) setAdmins(a.admins || []);
    const st = await postApi<any>('/api/admin/settings-get');
    if (st?.ok) setLbModeState(st.settings?.leaderboard_mode || 'team');
    setTeamBusy(false);
  };
  const loadLimits = async () => { setLimBusy(true); const r = await postApi<any>('/api/admin/limits-get'); if (r?.ok && r.limits) setLimF({ qm: r.limits.qty_max, rd: r.limits.range_daily, cd: r.limits.country_daily }); setLimBusy(false); };
  const loadBulk = async () => {
    setBulkBusy(true);
    const [r, c, q] = await Promise.all([
      postApi<any>('/api/admin/bulk-ranges'),
      postApi<any>('/api/admin/my-clients'),
      postApi<any>('/api/alloc/queue-status')
    ]);
    if (r?.ok) setBulkR(r.ranges || []);
    if (c?.ok) {
      const us: string[] = [];
      (c.teams || []).forEach((t: any) => (t.clients || []).forEach((x: any) => { if (x.username) us.push(x.username); }));
      setBulkU([...new Set(us)]);
    }
    if (q?.ok) setDockPending(q.totalBatches || 0);
    setBulkBusy(false);
  };
  const loadCrush = async () => { setCrushBusy(true); const r = await postApi<any>('/api/admin/crush-options'); if (r?.ok) { setCrushOpts(r.options || []); setCrushSugs(r.suggestions || []); if (!crushSel && r.options?.[0]) setCrushSel(r.options[0].range_name); } setCrushBusy(false); };
  useEffect(() => {
    const run = () => { if (tab === 'scc' || tab === 'otp' || tab === 'trep') loadScc(); if (tab === 'fleet') loadFleet(); if (tab === 'team' || tab === 'trep') loadTeam(); if (tab === 'limits') loadLimits(); if (tab === 'bulk') loadBulk(); if (tab === 'crush') loadCrush(); };
    run();
    const iv = setInterval(run, tab === 'scc' ? 10000 : tab === 'fleet' ? 8000 : 20000);
    return () => clearInterval(iv);
  }, [tab]);
  const fFleet = useMemo(() => fleet.filter((r) => (fleetF === 'gateway' ? r.inGateway : fleetF === 'vanished' ? !r.inGateway : true) && (!fleetQ || (r.name + r.country).toLowerCase().includes(fleetQ.toLowerCase()))), [fleet, fleetF, fleetQ]);
  const fBulkR = useMemo(() => bulkR.filter((r) => !bulkQ || r.name.toLowerCase().includes(bulkQ.toLowerCase())), [bulkR, bulkQ]);
  const fBulkU = useMemo(() => bulkU.filter((u) => !bulkUQ || u.toLowerCase().includes(bulkUQ.toLowerCase())), [bulkU, bulkUQ]);
  // FIX: pinned members collected from all teams for the dedicated section
  const pinnedList = useMemo(() => {
    const out: any[] = [];
    (teams || []).forEach((t: any) => (t.clients || []).forEach((c: any) => { if (c.pinned) out.push({ username: c.username, prefix: t.prefix || 'SYS' }); }));
    return out;
  }, [teams]);
  const batches = selR.length * selU.length;
  const etaMin = batches ? Math.max(1, Math.ceil(batches / 38)) : 0;
  const ask = (title: string, body: string, fn: () => Promise<void>, danger = true) => setConfirm({ title, body, fn, danger });
  const setLbMode = async (m: string) => { setLbModeState(m); const d = await postApi<any>('/api/admin/settings-set', { key: 'leaderboard_mode', value: m }); showToast(d?.ok ? `✓ Leaderboard: ${m}` : 'Save failed', d?.ok ? 'success' : 'error'); };
  const inp = 'w-full px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-cyan-500/40';
  const btnP = 'px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold transition-all cursor-pointer shrink-0 disabled:opacity-40';
  const btnD = 'px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition-all cursor-pointer shrink-0 disabled:opacity-40';
  if (role !== 'super' && role !== 'admin') return (<div className="w-full max-w-full overflow-hidden space-y-2 pb-16"><PageHead title="Admin Hub" onBack={onBack} /><Empty icon={Server} text="Admins only" /></div>);
  const otp = scc?.otp || {};
  const wb = scc?.weekBuckets || [0, 0, 0, 0, 0, 0, 0];
  const dayLbl = wb.map((_: any, i: number) => new Date(Date.now() - (6 - i) * 86400000).toLocaleDateString(undefined, { weekday: 'narrow' }));
  const dayFull = wb.map((_: any, i: number) => new Date(Date.now() - (6 - i) * 86400000).toLocaleDateString(undefined, { weekday: 'short' }));
  const bestI = wb.indexOf(Math.max(...wb, 0));
  const avgDay = Math.round(wb.reduce((a: number, b: number) => a + b, 0) / 7);
  const sccTeams = scc?.teams || [];
  const queueSize = scc?.queue?.size ?? 0;
  const repTeams = report?.teams || [];
  const topMap: Record<string, any> = {}; sccTeams.forEach((t: any) => { topMap[t.prefix] = t.top; });
  // FIX: Team Report counts keyed by prefix → Team tab cards show REAL today/week numbers
  const repMap: Record<string, any> = {}; repTeams.forEach((t: any) => { repMap[String(t.prefix || '')] = t; });
  const onlineList = scc?.users?.list || [];
  return (
    <div className="w-full max-w-full overflow-hidden space-y-2 pb-16">
      <PageHead title="Admin Hub" chip={role === 'super' ? 'SUPER' : 'ADMIN'} onBack={onBack}
        right={<IconBtn onClick={() => { if (tab === 'scc' || tab === 'otp' || tab === 'trep') loadScc(); else if (tab === 'fleet') loadFleet(); else if (tab === 'team' || tab === 'trep') loadTeam(); else if (tab === 'limits') loadLimits(); else if (tab === 'bulk') loadBulk(); else loadCrush(); }} title="Refresh"><RefreshCw className="w-3.5 h-3.5" /></IconBtn>} />
      <Card className="p-1.5 grid grid-cols-4 gap-1">
        {TABS.map((t) => {
          const Ic = TAB_ICON[t.id] || Server;
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[9px] font-bold transition-all cursor-pointer border ${tab === t.id ? 'bg-cyan-600 border-cyan-600 text-white shadow-sm' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
              <Ic className="w-4 h-4" />{t.label}
            </button>
          );
        })}
      </Card>
      {tab === 'scc' && scc && (
        <div className="space-y-2">
          {(scc.alerts || []).length > 0 && !alertHidden && (
            <Card className="p-2.5 border-rose-500/30 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="flex-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 truncate">{scc.alerts.map((a: any) => a.message).join(' · ')}</span>
              <button type="button" className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer shrink-0"
                onClick={() => ask('Send alert to all users?', scc.alerts.map((a: any) => a.message).join('. '), async () => { await postApi('/api/scc/broadcast', { title: 'System Alert', message: scc.alerts.map((a: any) => a.message).join('. ') }); showToast('✓ Sent to all', 'success'); setAlertHidden(true); }, false)}>Send</button>
              {queueSize > 0 && (
                <button type="button" className="px-2.5 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-[10px] font-bold cursor-pointer shrink-0"
                  onClick={() => ask('Stop all dock batches?', `${queueSize} pending batches will be cancelled.`, async () => { const r = await postApi<any>('/api/admin/queue-clear'); showToast(`✓ ${r?.cancelled || 0} stopped`, 'success'); loadScc(); })}>Stop</button>
              )}
            </Card>
          )}
          <Card className="p-1.5 grid grid-cols-4 gap-1">
            <Mini v={queueSize} l="Queue" tone={queueSize ? 'text-amber-500' : 'text-emerald-500'} />
            <Mini v={(scc.cdr?.status || 'dead').toUpperCase()} l="CDR" tone={scc.cdr?.status === 'live' ? 'text-emerald-500' : 'text-rose-500'} live={scc.cdr?.status === 'live'} />
            <Mini v={`${scc.boats?.active ?? 0}/${scc.boats?.total ?? 0}`} l="Daemons" />
            <Mini v={`${scc.load?.perMin ?? 0}/m`} l="API" live />
            <Mini v={scc.users?.online ?? 0} l="Online" />
            <Mini v={`${scc.daily?.growthPct >= 0 ? '+' : ''}${scc.daily?.growthPct ?? 0}%`} l="Growth" tone={scc.daily?.growthPct >= 0 ? 'text-emerald-500' : 'text-rose-500'} />
            <Mini v={(scc.daily?.today ?? 0).toLocaleString()} l="OTP Today" tone="text-cyan-600 dark:text-cyan-400" />
            <Mini v={(otp.total ?? 0).toLocaleString()} l="OTP All" tone="text-indigo-600 dark:text-indigo-400" />
          </Card>
          <div className="grid grid-cols-2 gap-2">
            <Card className="p-2.5 space-y-1">
              <div className="flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500 dot-live" />API · 5m</span><span className="font-mono text-[10px] font-bold text-cyan-500">{scc.load?.perMin ?? 0}/m</span></div>
              <Spark vals={scc.load?.buckets || []} color="#06b6d4" />
              <div className="text-[9px] text-slate-400 font-mono">{scc.load?.lastHour ?? 0}/hr · cap 38</div>
            </Card>
            <Card className="p-2.5 space-y-1">
              <div className="flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dot-live" />OTP · 5m</span><span className="font-mono text-[10px] font-bold text-emerald-500">{scc.cdr?.perMin ?? 0}/m</span></div>
              <Spark vals={scc.cdr?.buckets || []} color="#10b981" />
              <div className="text-[9px] text-slate-400 font-mono">lag {scc.cdr?.lagMin ?? '?'}m</div>
            </Card>
          </div>
          <Card className="p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold"><span className="text-slate-400 uppercase tracking-wider">Pool</span><span className="font-mono text-indigo-500">{scc.numbers?.assigned ?? 0}/{scc.numbers?.total ?? 0} · {scc.numbers?.utilPct ?? 0}%</span></div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500" style={{ width: `${scc.numbers?.utilPct ?? 0}%` }} /></div>
          </Card>
          <Card className="p-2 flex flex-wrap gap-1">
            {(scc.boats?.list || []).map((b: any, i: number) => (
              <span key={i} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold border ${b.ok ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${b.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />{b.name}<span className="font-mono opacity-70">{b.agoMin == null ? '—' : b.agoMin + 'm'}</span>
              </span>
            ))}
          </Card>
          {/* ── Online members — names shown, max 5, expand for all ── */}
          <Card className="p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dot-live" />Online · {scc.users?.online ?? 0}</span>
              {onlineList.length > 5 && (
                <button type="button" className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 cursor-pointer" onClick={() => setOnlineOpen(!onlineOpen)}>
                  {onlineOpen ? 'Show less' : `+${onlineList.length - 5} more`}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {(onlineOpen ? onlineList : onlineList.slice(0, 5)).map((x: any, i: number) => (
                <span key={x.u + i} className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold font-mono truncate max-w-[140px]">{pu(x.u)}</span>
              ))}
              {!onlineList.length && <span className="text-[10px] text-slate-400 font-semibold">Nobody online right now</span>}
            </div>
          </Card>
          {(scc.incidents || []).length === 0 ? <Empty icon={Check} text="System nominal" /> : (
            <Card className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {(scc.incidents || []).map((inc: any) => (
                <div key={inc.id} className="p-2.5 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${inc.severity === 'critical' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0"><div className="text-[11px] font-bold truncate text-slate-900 dark:text-white">{inc.title}</div><div className="text-[10px] text-slate-400 truncate">{inc.message}</div></div>
                  <IconBtn title="Broadcast" onClick={() => ask('Broadcast incident?', inc.title, async () => { await postApi('/api/scc/broadcast', { id: inc.id, title: inc.title, message: inc.message }); showToast('✓ Sent', 'success'); loadScc(); })}><Megaphone className="w-3.5 h-3.5" /></IconBtn>
                  <IconBtn title="Dismiss" onClick={async () => { await postApi('/api/scc/dismiss-all', { type: inc.type }); loadScc(); }}><X className="w-3.5 h-3.5" /></IconBtn>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
      {tab === 'otp' && scc && (
        <div className="space-y-2">
          <StatStrip items={[
            { label: 'Today', value: (scc.daily?.today ?? 0).toLocaleString(), tone: 'text-cyan-600 dark:text-cyan-400' },
            { label: 'Week', value: (otp.week ?? 0).toLocaleString(), tone: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'Month', value: (otp.month ?? 0).toLocaleString(), tone: 'text-purple-600 dark:text-purple-400' },
            { label: 'All Time', value: (otp.total ?? 0).toLocaleString(), tone: 'text-slate-600 dark:text-slate-300' }
          ]} />
          <Card className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><TrendingUp className="w-3 h-3 text-emerald-500" /> Today vs Yesterday</span>
              <span className={`font-mono text-[11px] font-extrabold ${(scc.daily?.growthPct ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{(scc.daily?.growthPct ?? 0) >= 0 ? '+' : ''}{scc.daily?.growthPct ?? 0}%</span>
            </div>
            <div className="space-y-1.5">
              <div><div className="flex justify-between text-[8px] font-bold text-slate-400 mb-0.5"><span>YESTERDAY</span><span className="font-mono">{(scc.daily?.yesterday ?? 0).toLocaleString()}</span></div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-slate-300 dark:bg-slate-600" style={{ width: `${Math.max(3, Math.round(((scc.daily?.yesterday ?? 0) / Math.max(scc.daily?.today ?? 0, scc.daily?.yesterday ?? 0, 1)) * 100))}%` }} /></div></div>
              <div><div className="flex justify-between text-[8px] font-bold text-cyan-500 mb-0.5"><span>TODAY</span><span className="font-mono">{(scc.daily?.today ?? 0).toLocaleString()}</span></div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500" style={{ width: `${Math.max(3, Math.round(((scc.daily?.today ?? 0) / Math.max(scc.daily?.today ?? 0, scc.daily?.yesterday ?? 0, 1)) * 100))}%` }} /></div></div>
            </div>
          </Card>
          <Card className="p-3 space-y-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><CalendarRange className="w-3 h-3 text-cyan-500" /> Last 7 days</span>
            <Bars vals={wb} labels={dayLbl} />
          </Card>
          <Card className="p-1.5 grid grid-cols-3 gap-1">
            <Mini v={(wb[bestI] ?? 0).toLocaleString()} l={`Best · ${dayFull[bestI] || '-'}`} tone="text-amber-500" />
            <Mini v={avgDay.toLocaleString()} l="Avg / day" tone="text-cyan-600 dark:text-cyan-400" />
            <Mini v={`${wb.filter((x: number) => x > 0).length}/7`} l="Active days" tone="text-emerald-500" />
          </Card>
        </div>
      )}
      {tab === 'trep' && (
        <div className="space-y-2">
          {report?.hottest && (
            <Card className="p-2.5 border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">Hottest: {report.hottest.prefix || report.hottest.label} · {report.hottest.otpToday} OTP today</span>
            </Card>
          )}
          {repTeams.length === 0 ? <Empty icon={Users} text="No team traffic yet" /> : repTeams.map((t: any) => {
            const top = topMap[t.prefix] || null;
            const avg = Math.round((t.otpWeek || 0) / 7);
            const delta = avg ? Math.round(((t.otpToday - avg) / avg) * 100) : (t.otpToday ? 100 : 0);
            return (
              <Card key={t.prefix || 'sys'} className="p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">{t.prefix || 'SYS'}</span>
                  <span className="flex-1 text-[11px] font-bold truncate text-slate-900 dark:text-white">{t.label || t.admin || 'System'}</span>
                  {report?.hottest?.prefix === t.prefix && <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
                  <span className="font-mono text-[12px] font-extrabold text-slate-900 dark:text-white tabular-nums shrink-0">{(t.otpToday || 0).toLocaleString()}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-400" style={{ width: `${Math.max(4, Math.round(((t.otpToday || 0) / Math.max(...repTeams.map((x: any) => x.otpToday || 0), 1)) * 100))}%` }} /></div>
                <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400">
                  <span>{t.admin || '—'}</span><span>·</span><span>{t.clients ?? 0} clients</span><span>·</span><span>wk {(t.otpWeek || 0).toLocaleString()}</span><span>·</span><span>avg {avg}/d</span>
                  <span className={`ml-auto font-mono ${delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}%</span>
                </div>
                {top && (
                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <Crown className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 truncate">Top: {pu(top.username)}</span>
                    <span className="font-mono text-[9px] font-bold text-amber-500 shrink-0">{top.count.toLocaleString()}</span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {tab === 'fleet' && (
        <div className="space-y-2">
          <Card className="p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${(prog?.status || '') === 'running' ? 'bg-amber-500 dot-live' : 'bg-emerald-500'}`} />LaMix ↔ DB auto-sync</span>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold font-mono ${(prog?.status || '').toUpperCase() === 'RUNNING' ? 'text-amber-500' : 'text-emerald-500'}`}>{(prog?.status || 'idle').toUpperCase()}</span>
                <button type="button" className={btnP} onClick={() => ask('Run full sync?', '~2-3 min @38 req/min.', async () => { await postApi('/api/admin/numsync-run'); showToast('✓ Queued', 'success'); })}>Run Sync</button>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all" style={{ width: `${prog?.expected ? Math.round((prog.fetched / prog.expected) * 100) : 0}%` }} /></div>
            <div className="font-mono text-[10px] font-bold text-slate-400">{(prog?.fetched || 0).toLocaleString()} / {(prog?.expected || 0).toLocaleString()}{prog?.etaSecs ? ` · ETA ~${Math.ceil(prog.etaSecs / 60)}m` : ''} · new=auto-add · removed=auto-truncate</div>
          </Card>
          <div className="flex items-center gap-1.5">
            <SearchBox value={fleetQ} onChange={setFleetQ} placeholder="Search range…" icon={Search} />
            <div className="flex items-center gap-0.5 p-0.5 rounded-xl glass-card shrink-0">
              {[{ id: 'all', l: 'All' }, { id: 'gateway', l: 'Live' }, { id: 'vanished', l: 'Gone' }].map((o) => (
                <button key={o.id} type="button" onClick={() => setFleetF(o.id)} className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${fleetF === o.id ? 'bg-cyan-600 text-white' : 'text-slate-500'}`}>{o.l}</button>
              ))}
            </div>
            <IconBtn onClick={loadFleet} disabled={fleetBusy} title="Refresh"><RefreshCw className={`w-3.5 h-3.5 ${fleetBusy ? 'animate-spin text-cyan-500' : ''}`} /></IconBtn>
          </div>
          {fFleet.length === 0 ? <Empty icon={Database} text="No ranges" /> : fFleet.map((r) => (
            <Card key={r.id} className="p-2.5 flex items-center gap-2.5">
              <span className="text-2xl shrink-0 leading-none" title={r.country}>{getCountryFlag(r.country)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5"><span className="text-xs font-bold truncate text-slate-900 dark:text-white">{r.name}</span>
                  <span className={`text-[8px] px-1 py-0.2 rounded font-bold uppercase font-mono shrink-0 ${r.inGateway ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>{r.inGateway ? 'live' : 'gone'}</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">+{r.prefix} · {r.activeUsersCount} users</div>
              </div>
              <div className="flex items-center gap-1 shrink-0 text-center">
                <div className="px-1.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60"><div className="font-mono text-[11px] font-extrabold text-slate-700 dark:text-slate-300">{r.totalDbRows}</div><div className="text-[8px] font-bold uppercase text-slate-400">rows</div></div>
                <div className="px-1.5 py-1 rounded-lg bg-cyan-500/10"><div className="font-mono text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400">{r.allocatedToUsers}</div><div className="text-[8px] font-bold uppercase text-cyan-500">alloc</div></div>
                <div className="px-1.5 py-1 rounded-lg bg-emerald-500/10"><div className="font-mono text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">{r.freeInPool}</div><div className="text-[8px] font-bold uppercase text-emerald-500">free</div></div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {tab === 'team' && (
        <div className="space-y-2">
          {/* ── Admin List ── */}
          <Card className="p-3 space-y-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Crown className="w-3 h-3 text-amber-500" /> Admins ({admins.length})</span>
            {admins.length === 0 ? <p className="text-[10px] text-slate-400">No admins yet</p> : admins.map((a: any) => (
              <div key={a.username} className="flex items-center gap-2 py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <span className="flex-1 text-[11px] font-bold truncate text-slate-900 dark:text-white">{pu(a.username)}</span>
                <span className={`text-[9px] px-1.5 py-0.3 rounded-md font-bold ${a.role === 'super' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'}`}>{a.role}</span>
                {role === 'super' && a.username !== 'super' && (
                  <button type="button" onClick={() => ask('Demote ' + a.username + '?', 'Remove admin role from ' + a.username + '?', async () => { const d = await postApi<any>('/api/admin/demote', { username: a.username }); showToast(d?.ok ? '✓ Demoted' : d?.error || 'Failed', d?.ok ? 'success' : 'error'); if (d?.ok) loadTeam(); })}
                    className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer" title="Demote">
                    <UserX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </Card>
          {/* ── Promote ── */}
          {(role === 'super' || role === 'admin') && (
            <Card className="p-3 space-y-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><UserPlus className="w-3 h-3 text-cyan-500" /> Promote to Admin</span>
              <div className="flex gap-1.5">
                <input value={pw.promo} onChange={(e) => setPw({ ...pw, promo: e.target.value })} placeholder="username to promote" className={inp} />
                <button type="button" className={btnP} onClick={async () => {
                  const d = await postApi<any>('/api/admin/promote', { username: pw.promo });
                  showToast(d?.ok ? `✓ ${pw.promo} is now admin` : d?.error || 'Failed', d?.ok ? 'success' : 'error');
                  if (d?.ok) setPw({ ...pw, promo: '' });
                }}>Promote</button>
              </div>
            </Card>
          )}
          {/* ── Create ID ── */}
          {(role === 'super' || role === 'admin') && (
            <Card className="p-3 space-y-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><UserPlus className="w-3 h-3 text-cyan-500" /> Create ID</span>
              <div className="flex gap-1.5">
                <select value={pf.prefix} onChange={(e) => setPf({ ...pf, prefix: e.target.value })} className={inp + ' w-24'}>
                  <option value="">Prefix…</option>{prefixes.map((p) => <option key={p.prefix} value={p.prefix}>{p.prefix}</option>)}
                </select>
                <input value={pf.suffix} onChange={(e) => setPf({ ...pf, suffix: e.target.value })} placeholder="Suffix" className={inp} />
                <button type="button" className={btnP} onClick={async () => { const d = await postApi<any>('/api/admin/create-client', { prefix: pf.prefix, suffix: pf.suffix, name: pf.name || pf.suffix }); showToast(d?.ok ? '⛵ Queued' : d?.error || 'Failed', d?.ok ? 'success' : 'error'); if (d?.ok) setPf({ ...pf, suffix: '' }); }}>Create</button>
              </div>
            </Card>
          )}
          {/* ── Team prefix (own state — no clash with Create ID) ── */}
          {(role === 'super' || role === 'admin') && (
            <Card className="p-3 space-y-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Server className="w-3 h-3 text-indigo-500" /> Team prefix</span>
              <div className="flex gap-1.5">
                <input value={tpPrefix} onChange={(e) => setTpPrefix(e.target.value)} placeholder="ZML_" className={inp + ' font-mono'} />
                <input value={pf.admin} onChange={(e) => setPf({ ...pf, admin: e.target.value })} placeholder="admin" className={inp} />
                <button type="button" className={btnP} onClick={async () => { const d = await postApi<any>('/api/admin/set-prefix', { prefix: tpPrefix, admin: pf.admin }); showToast(d?.ok ? '✓ Assigned' : d?.error || 'Failed', d?.ok ? 'success' : 'error'); if (d?.ok) setTpPrefix(''); loadTeam(); }}>Assign</button>
              </div>
              {prefixes.map((p) => (
                <div key={p.prefix} className="flex items-center gap-2 py-1">
                  <span className="font-mono text-[11px] font-extrabold text-slate-900 dark:text-white">{p.prefix}</span>
                  <span className="flex-1 text-[10px] text-slate-400 truncate">{p.admin_username}</span>
                  <button type="button" className="text-rose-500 cursor-pointer p-1" onClick={() => ask('Delete prefix?', p.prefix, async () => { await postApi('/api/admin/del-prefix', { prefix: p.prefix }); showToast('✓ Removed', 'success'); loadTeam(); })}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </Card>
          )}
          {/* ── Reset password ── */}
          {(role === 'super' || role === 'admin') && (
            <Card className="p-3 space-y-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><KeyRound className="w-3 h-3 text-amber-500" /> Reset password</span>
              <div className="flex gap-1.5">
                <input value={pw.u} onChange={(e) => setPw({ ...pw, u: e.target.value })} placeholder="username" className={inp} />
                <button type="button" className={btnP} onClick={async () => { const d = await postApi<any>('/api/admin/reset-credentials', { username: pw.u }); showToast(d?.ok ? '✓ Wiped — user sets new password' : d?.error || 'Failed', d?.ok ? 'success' : 'error'); if (d?.ok) setPw({ ...pw, u: '' }); }}>Reset</button>
              </div>
            </Card>
          )}
          {/* ── Pin User (backend verifies DB/LaMix) ── */}
          {(role === 'super' || role === 'admin') && (
            <Card className="p-3 space-y-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Users className="w-3 h-3 text-emerald-500" /> Pin User to Team</span>
              <div className="flex gap-1.5">
                <select value={pf.pinPrefix} onChange={(e) => setPf({ ...pf, pinPrefix: e.target.value })} className={inp + ' w-28'}>
                  <option value="">Team…</option>
                  {prefixes.map((p) => <option key={p.prefix} value={p.prefix}>{p.prefix}</option>)}
                </select>
                <input value={pf.pinUser} onChange={(e) => setPf({ ...pf, pinUser: e.target.value })} placeholder="Exact username" className={inp} />
                <button type="button" className={btnP} onClick={async () => {
                  const d = await postApi<any>('/api/admin/pin-client', { username: pf.pinUser, prefix: pf.pinPrefix });
                  showToast(d?.ok ? '✓ Pinned' : d?.error || 'Failed', d?.ok ? 'success' : 'error');
                  if (d?.ok) { setPf({ ...pf, pinUser: '' }); loadTeam(); }
                }}>Pin</button>
              </div>
              <p className="text-[9px] text-slate-400 font-semibold">User must exist in DB or LaMix — fake names are rejected.</p>
            </Card>
          )}
          {/* ── Pinned Members with unpin ── */}
          {pinnedList.length > 0 && (
            <Card className="p-3 space-y-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Pin className="w-3 h-3 text-rose-500" /> Pinned Members ({pinnedList.length})</span>
              <div className="space-y-1">
                {pinnedList.map((p: any) => (
                  <div key={p.username} className="flex items-center gap-2 py-1.5 px-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0"><Pin className="w-3 h-3" /></span>
                    <span className="flex-1 text-[11px] font-bold font-mono truncate text-slate-900 dark:text-white">{pu(p.username)}</span>
                    <span className="font-mono text-[9px] font-black px-1.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shrink-0">{p.prefix}</span>
                    <button type="button" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0" title="Unpin"
                      onClick={() => ask('Unpin ' + p.username + '?', 'They will fall back to normal prefix matching.', async () => { const d = await postApi<any>('/api/admin/unpin-client', { username: p.username }); showToast(d?.ok ? '✓ Unpinned' : d?.error || 'Failed', d?.ok ? 'success' : 'error'); if (d?.ok) loadTeam(); }, false)}>
                      <PinOff className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {/* ── Leaderboard control (super only) ── */}
          {role === 'super' && (
            <Card className="p-3 space-y-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Crown className="w-3 h-3 text-amber-500" /> Leaderboard control</span>
              <div className="flex items-center gap-0.5 p-0.5 rounded-xl glass-card">
                <button type="button" onClick={() => setLbMode('team')} className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer ${lbMode === 'team' ? 'bg-cyan-600 text-white' : 'text-slate-500'}`}>Team-isolated</button>
                <button type="button" onClick={() => setLbMode('global')} className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer ${lbMode === 'global' ? 'bg-cyan-600 text-white' : 'text-slate-500'}`}>Global for all</button>
              </div>
            </Card>
          )}
          {/* ── Teams List — FIX: real today/week counts merged from Team Report ── */}
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Teams · {teams.reduce((s, t) => s + (t.count || 0), 0)} clients</span>
            <IconBtn onClick={loadTeam} disabled={teamBusy} title="Refresh"><RefreshCw className={`w-3.5 h-3.5 ${teamBusy ? 'animate-spin text-cyan-500' : ''}`} /></IconBtn>
          </div>
          {teams.length === 0 ? <Empty icon={Users} text="No teams" /> : teams.map((t) => {
            const rt = repMap[t.prefix || ''] || {};
            return (
              <Card key={t.prefix || 'sys'} className="p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-black px-1.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">{t.prefix || 'SYS'}</span>
                  <span className="flex-1 text-[11px] font-bold truncate text-slate-900 dark:text-white">{t.label || t.admin}</span>
                  <span className="font-mono text-[10px] font-bold text-emerald-500 shrink-0">{(rt.otpToday ?? 0).toLocaleString()} today · <span className="text-slate-400">wk {(rt.otpWeek ?? 0).toLocaleString()}</span></span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(t.clients || []).map((c: any) => (
                    <span key={c.id || c.username} className="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">{pu(c.username)}{c.pinned ? ' 📌' : ''}</span>
                  ))}
                  {!t.clients?.length && <span className="text-[10px] text-slate-400">no clients</span>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {tab === 'limits' && (
        <div className="space-y-2">
          <Card className="p-3 space-y-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Global limits / user / day</span>
            <div className="grid grid-cols-3 gap-1.5">
              <div><div className="text-[9px] font-bold text-slate-400 mb-1">QTY MAX</div><input type="number" disabled={role !== 'super'} value={limF.qm} onChange={(e) => setLimF({ ...limF, qm: e.target.value })} className={inp + ' font-mono'} /></div>
              <div><div className="text-[9px] font-bold text-slate-400 mb-1">RANGE/DAY</div><input type="number" disabled={role !== 'super'} value={limF.rd} onChange={(e) => setLimF({ ...limF, rd: e.target.value })} className={inp + ' font-mono'} /></div>
              <div><div className="text-[9px] font-bold text-slate-400 mb-1">COUNTRY/DAY</div><input type="number" disabled={role !== 'super'} value={limF.cd} onChange={(e) => setLimF({ ...limF, cd: e.target.value })} className={inp + ' font-mono'} /></div>
            </div>
            {role === 'super' && <button type="button" disabled={limBusy} className={btnP + ' w-full'} onClick={async () => { const d = await postApi<any>('/api/admin/limits-set', { qtyMax: limF.qm, rangeDaily: limF.rd, countryDaily: limF.cd }); showToast(d?.ok ? '✓ Saved' : 'Failed', d?.ok ? 'success' : 'error'); }}>Save Limits</button>}
          </Card>
          <Card className="p-3 space-y-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Gift className="w-3 h-3 text-emerald-500" /> Free a try · max +3/day</span>
            <div className="flex gap-1.5">
              <input value={limUser} onChange={(e) => setLimUser(e.target.value)} placeholder="username" className={inp} onKeyDown={(e) => e.key === 'Enter' && postApi<any>('/api/admin/limit-status', { username: limUser }).then((d) => d?.ok && setLimStatus(d))} />
              <button type="button" className={btnP} onClick={async () => { const d = await postApi<any>('/api/admin/limit-status', { username: limUser }); if (d?.ok) setLimStatus(d); else showToast(d?.error || 'Failed', 'error'); }}>Check</button>
              <button type="button" className={btnD} onClick={() => ask('Lift all limits today?', limUser, async () => { const d = await postApi<any>('/api/admin/lift-restrictions', { user: limUser }); showToast(d?.ok ? '✓ Lifted' : 'Failed', d?.ok ? 'success' : 'error'); setLimStatus(null); })}>Lift All</button>
            </div>
            {limStatus && !(limStatus.ranges || []).length && !(limStatus.countries || []).length && <p className="text-[11px] font-bold text-emerald-500">✓ {limStatus.username} clean</p>}
            {[...(limStatus?.ranges || []).map((r: any) => ({ ...r, kind: 'range' })), ...(limStatus?.countries || []).map((c: any) => ({ ...c, kind: 'country' }))].map((r: any) => (
              <div key={(r.kind || 'r') + (r.rangeId || r.country)} className="flex items-center gap-2 py-1">
                <div className="flex-1 min-w-0"><div className="text-[11px] font-bold truncate text-slate-900 dark:text-white">{r.rangeTitle || r.country}</div><div className="text-[10px] text-rose-500 font-mono">{r.used}/{r.limit} used</div></div>
                <button type="button" className={btnP} onClick={() => ask('+1 try?', r.rangeTitle || r.country, async () => { const d = await postApi<any>('/api/admin/free-try', { username: limStatus.username, rowId: r.ids[r.ids.length - 1] }); showToast(d?.ok ? '✓ Freed' : d?.error || 'Failed', d?.ok ? 'success' : 'error'); postApi<any>('/api/admin/limit-status', { username: limUser }).then((x) => x?.ok && setLimStatus(x)); })}>+1</button>
              </div>
            ))}
          </Card>
        </div>
      )}
      {tab === 'bulk' && (
        <div className="space-y-2">
          <Card className="p-2.5 flex items-center gap-2">
            <Ship className="w-4 h-4 text-cyan-500 shrink-0" />
            <span className="flex-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">Dock</span>
            <span className={`font-mono text-[11px] font-extrabold ${dockPending ? 'text-amber-500' : 'text-emerald-500'}`}>{dockPending} pending</span>
            <IconBtn onClick={loadBulk} disabled={bulkBusy} title="Refresh"><RefreshCw className={`w-3.5 h-3.5 ${bulkBusy ? 'animate-spin text-cyan-500' : ''}`} /></IconBtn>
          </Card>
          <div className="grid grid-cols-2 gap-2">
            <Card className="p-2.5 space-y-1.5">
              <div className="flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ranges · {selR.length}</span>
                <button type="button" className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 cursor-pointer flex items-center gap-1" onClick={() => setSelR(selR.length === fBulkR.length && fBulkR.length ? [] : fBulkR.map((r) => r.range_id))}><Check className="w-3 h-3" />{bulkQ ? 'Sel filtered' : 'Sel all'}</button></div>
              <SearchBox value={bulkQ} onChange={setBulkQ} placeholder="e.g. Angola" icon={Search} />
              <div className="max-h-40 overflow-y-auto space-y-1">
                {fBulkR.map((r) => (
                  <label key={r.range_id} className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-[10px] cursor-pointer ${selR.includes(r.range_id) ? 'bg-cyan-500/10 border-cyan-500/40 font-bold' : 'border-slate-200 dark:border-slate-800'}`}>
                    <input type="checkbox" className="accent-cyan-500" checked={selR.includes(r.range_id)} onChange={(e) => setSelR(e.target.checked ? [...selR, r.range_id] : selR.filter((x) => x !== r.range_id))} />
                    <span className="flex-1 truncate font-bold text-slate-800 dark:text-slate-200">{r.name}</span>
                    <span className="font-mono text-emerald-500 font-bold">{r.unassigned}</span>
                  </label>
                ))}
                {!fBulkR.length && <p className="text-[10px] text-slate-400 text-center py-3">no free ranges</p>}
              </div>
            </Card>
            <Card className="p-2.5 space-y-1.5">
              <div className="flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Users · {selU.length}</span>
                <button type="button" className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 cursor-pointer flex items-center gap-1" onClick={() => setSelU(selU.length === fBulkU.length && fBulkU.length ? [] : fBulkU)}><Check className="w-3 h-3" />{bulkUQ ? 'Sel filtered' : 'Sel all'}</button></div>
              <SearchBox value={bulkUQ} onChange={setBulkUQ} placeholder="e.g. ZML_" icon={Search} />
              <div className="max-h-40 overflow-y-auto space-y-1">
                {fBulkU.map((u) => (
                  <label key={u} className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-[10px] cursor-pointer ${selU.includes(u) ? 'bg-cyan-500/10 border-cyan-500/40 font-bold' : 'border-slate-200 dark:border-slate-800'}`}>
                    <input type="checkbox" className="accent-cyan-500" checked={selU.includes(u)} onChange={(e) => setSelU(e.target.checked ? [...selU, u] : selU.filter((x) => x !== u))} />
                    <span className="flex-1 truncate font-bold font-mono text-slate-800 dark:text-slate-200">{pu(u)}</span>
                  </label>
                ))}
                {!fBulkU.length && <p className="text-[10px] text-slate-400 text-center py-3">no users</p>}
              </div>
            </Card>
          </div>
          <Card className="p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400">Qty each:</span>
              <input value={bulkQty} onChange={(e) => setBulkQty(e.target.value.replace(/[^0-9]/g, ''))} className={inp + ' w-16 text-center font-mono'} />
              <button type="button" disabled={!selR.length || !selU.length} className={btnP + ' flex-1 disabled:opacity-40'}
                onClick={() => ask('Queue bulk allocation?', `${selU.length} users × ${selR.length} ranges × ${bulkQty} · ~${etaMin}m`, async () => {
                  const d = await postApi<any>('/api/admin/bulk-queue', { rangeIds: selR, users: selU, perRange: parseInt(bulkQty, 10) || 50 });
                  showToast(d?.ok ? `✓ ${d.queued} batches` : d?.error || 'Failed', d?.ok ? 'success' : 'error');
                  if (d?.ok) { setSelR([]); setSelU([]); loadBulk(); }
                }, false)}>Queue Bulk</button>
            </div>
            {batches > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                <Clock className="w-3 h-3 text-cyan-500" />
                <span className="font-mono text-cyan-600 dark:text-cyan-400">{batches} LaMix calls</span> · ~{etaMin} min @38/min
              </div>
            )}
          </Card>
        </div>
      )}
      {tab === 'crush' && (
        <div className="space-y-2">
          <Card className="p-2.5 border-cyan-500/20 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
            Users read <strong className="text-slate-700 dark:text-slate-200">PostgreSQL</strong> (not LaMix live) → crush = instant frontend purge; LaMix sync re-heals only what is still assigned there. Safe mode deletes <strong className="text-amber-500">returned/orphan</strong> ledger rows only.
          </Card>
          {crushSugs.length > 0 && (
            <Card className="p-2.5 border-amber-500/30 space-y-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Returned / vanished — purge now</span>
              {crushSugs.map((s, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <span className="flex-1 text-[11px] font-bold truncate text-slate-800 dark:text-slate-200">{s.range_name} · <span className="text-rose-500 font-mono">{s.rows_alive}</span> · <span className="text-[9px] uppercase text-amber-500">{s.source}</span></span>
                  <button type="button" className={btnP} onClick={() => ask('Crush range?', s.range_name, async () => { const d = await postApi<any>('/api/admin/range-crush', { rangeName: s.range_name }); showToast(`✓ ${d?.crushed || 0} rows`, 'success'); loadCrush(); })}>Crush</button>
                </div>
              ))}
            </Card>
          )}
          <Card className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ledger ranges</span>
              <IconBtn onClick={loadCrush} disabled={crushBusy} title="Refresh"><RefreshCw className={`w-3.5 h-3.5 ${crushBusy ? 'animate-spin text-cyan-500' : ''}`} /></IconBtn>
            </div>
            <select value={crushSel} onChange={(e) => setCrushSel(e.target.value)} className={inp}>
              {crushOpts.map((o) => (<option key={o.range_name} value={o.range_name}>{o.range_name} — purge {o.count} · live {o.active} · pool {o.pool_assigned}</option>))}
            </select>
            {(() => { const o = crushOpts.find((x) => x.range_name === crushSel); if (!o) return null; return (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase font-mono border ${o.pool_assigned > 0 ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20' : o.gone ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'}`}>
                  {o.pool_assigned > 0 ? 'live in pool' : o.gone ? 'vanished' : 'returned'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">purgeable {o.count} · active {o.active}</span>
              </div>
            ); })()}
            <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 cursor-pointer">
              <input type="checkbox" className="accent-rose-500" checked={hard} onChange={(e) => setHard(e.target.checked)} /> Hard delete ALL rows (LaMix will resync live ones)
            </label>
            <div className="flex gap-1.5">
              <button type="button" disabled={!crushSel || crushBusy} className={btnD + ' flex-1 disabled:opacity-40'} onClick={() => ask('Crush range?', crushSel + (hard ? ' (HARD)' : ' (safe)'), async () => { const d = await postApi<any>('/api/admin/range-crush', { rangeName: crushSel, hard }); showToast(`✓ ${d?.crushed || 0} rows`, 'success'); loadCrush(); })}>Crush Range</button>
              <button type="button" disabled={crushBusy} className={btnD} onClick={() => ask('Crush all orphans?', 'Junk rows only.', async () => { const d = await postApi<any>('/api/admin/crush-orphans'); showToast(`✓ ${d?.deleted || 0} deleted`, 'success'); loadCrush(); })}>Orphans</button>
            </div>
          </Card>
        </div>
      )}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md">
          <Card className="w-full max-w-sm p-5 shadow-2xl">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${confirm.danger ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-500' : 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-500'}`}><AlertTriangle className="w-5 h-5" /></div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1.5">{confirm.title}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">{confirm.body}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">Cancel</button>
              <button type="button" onClick={async () => { const f = confirm.fn; setConfirm(null); await f(); }} className={`flex-1 px-3 py-2 rounded-xl text-white text-xs font-bold transition-colors cursor-pointer ${confirm.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-cyan-600 hover:bg-cyan-500'}`}>Confirm</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
export default AdminConsoleView;
// === EOF: AdminConsoleView.tsx ===
