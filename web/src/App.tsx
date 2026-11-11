import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import { useLive } from './context/LiveContext';
import { Header } from './components/Header';
import { Navigation, ActiveTab } from './components/Navigation';
import { RangesView } from './components/RangesView';
import { NumbersView } from './components/NumbersView';
import { InboxView } from './components/InboxView';
import { AddNumbersView } from './components/AddNumbersView';
import { LeaderboardView } from './components/LeaderboardView';
import { DORView } from './components/DORView';
import { CliInsightsView } from './components/CliInsightsView';
import { AdminConsoleView } from './components/AdminConsoleView';
import { NotificationsView } from './components/NotificationsView';
import { ChangePasswordView } from './components/ChangePasswordView';
import { LiveOtpFloatingCard } from './components/LiveOtpFloatingCard';
import { LoginView } from './components/LoginView';
import { postApi } from './services/api';
import type { RangeItem, SmsMessage, LeaderboardData, NotificationItem } from './types';
type AppSubPage = 'dashboard' | 'admin' | 'cli' | 'notifications' | 'password';
// Zoom: 1 = normal (current system look). + zooms in, − zooms out. User side only.
const ZOOM_MIN = 0.8, ZOOM_MAX = 1.5;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
function DashboardContent() {
  const { isLoggedIn, username } = useAuth();
  const { showToast } = useToast();
  const live = useLive();
  const [activeTab, setActiveTab] = useState<ActiveTab>('ranges');
  const [subPage, setSubPage] = useState<AppSubPage>('dashboard');
  const [adminInitialTab, setAdminInitialTab] = useState<string>('scc');
  const [selectedRange, setSelectedRange] = useState<RangeItem | null>(null);
  const [ranges, setRanges] = useState<RangeItem[]>([]);
  const [numbers, setNumbers] = useState<string[]>([]);
  const [smsMessages, setSmsMessages] = useState<SmsMessage[]>([]);
  const [todaySmsCount, setTodaySmsCount] = useState<number>(0);
  const [weekSmsCount, setWeekSmsCount] = useState<number>(0);
  const [monthSmsCount, setMonthSmsCount] = useState<number>(0);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData>({ users: [], total: 0 });
  const [leaderboardRange, setLeaderboardRange] = useState<'today' | 'week' | 'month'>('today');
  const [dorMessages, setDorMessages] = useState<SmsMessage[]>([]);
  const [hasDorAccess, setHasDorAccess] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [latestOtpAlert, setLatestOtpAlert] = useState<{
    number: string; cli: string; message: string; time: string; burst?: number;
  } | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  // FIX: tick that re-renders NumbersView when a per-number OTP counter increments (live)
  const [numOtpTick, setNumOtpTick] = useState(0);
  // FIX: one-time navigation restore flag (refresh memory)
  const [navRestored, setNavRestored] = useState(false);
  const prevSmsCountRef = useRef<number>(0);
  const seenSmsKeysRef = useRef<Set<string>>(new Set());
  const lastRangeFetchRef = useRef<number>(0);
  const rangeRetryRef = useRef<number>(0);
  const navKey = 'zamil_nav_' + (username || '');
  // ── Per-user zoom preference (remembered on this device, each user picks their own) ──
  useEffect(() => {
    try {
      const v = parseFloat(localStorage.getItem('zamil_zoom_' + (username || '')) || '1');
      setZoom(isNaN(v) ? 1 : clampZoom(v));
    } catch { setZoom(1); }
  }, [username]);
  const changeZoom = useCallback((z: number) => {
    const c = clampZoom(z);
    setZoom(c);
    try { localStorage.setItem('zamil_zoom_' + (username || ''), String(c)); } catch {}
  }, [username]);
  const fetchRanges = useCallback(async (force = false) => {
    try {
      const res = await postApi<any>('/api/ranges', { forceRefresh: force });
      if (res && res.ok && res.ranges) setRanges(res.ranges);
    } catch {}
  }, []);
  // ── FIX: ranges refresh that NEVER drops an update ──
  // Old code: if a fetch happened <8s ago, the SSE "ranges changed" event was ignored forever
  // → new range missing from the dashboard. Now: too soon? schedule a retry exactly when the
  // throttle window ends, so every change eventually lands. force=true jumps the queue
  // (used after the user's own allocation / unassign).
  const requestRangesFetch = useCallback((force = false) => {
    const now = Date.now();
    const wait = force ? 0 : Math.max(0, 8000 - (now - lastRangeFetchRef.current));
    if (wait === 0) {
      lastRangeFetchRef.current = Date.now();
      fetchRanges(force);
      return;
    }
    if (!rangeRetryRef.current) {
      rangeRetryRef.current = window.setTimeout(() => {
        rangeRetryRef.current = 0;
        lastRangeFetchRef.current = Date.now();
        fetchRanges(false);
      }, wait);
    }
  }, [fetchRanges]);
  const fetchNumbers = useCallback(async (range: RangeItem) => {
    try {
      const res = await postApi<any>('/api/numbers', { rangeId: range.id, rangeTitle: range.title, limit: 500 });
      if (res && res.ok && res.numbers) {
        const list = res.numbers.map((n: any) => typeof n === 'string' ? n : n.numberFull || n.number || Object.values(n)[0] || '');
        setNumbers(list);
      }
    } catch { showToast('Numbers load failed', 'error'); }
  }, [showToast]);
  // Single ingest point: updates list + raises ONE floating card with burst count
  const ingestSms = useCallback((count: number, rec: SmsMessage[]) => {
    setTodaySmsCount(count);
    setSmsMessages(rec);
    const fresh = rec.filter((m) => !seenSmsKeysRef.current.has(`${m.number}|${m.cli}|${m.time}`));
    if (fresh.length) {
      fresh.forEach((m) => seenSmsKeysRef.current.add(`${m.number}|${m.cli}|${m.time}`));
      if (prevSmsCountRef.current > 0) {
        setLatestOtpAlert({ number: fresh[0].number, cli: fresh[0].cli, message: fresh[0].message, time: fresh[0].time, burst: fresh.length });
      }
      // FIX: live per-number OTP counters (max 30) — only numbers already copied (started)
      try {
        const sMap = JSON.parse(localStorage.getItem('zamil_numotp_start') || '{}');
        const cMap = JSON.parse(localStorage.getItem('zamil_numotp_count') || '{}');
        let ch = false;
        fresh.forEach((m) => {
          if (sMap[m.number] != null && (cMap[m.number] || 0) < 30) { cMap[m.number] = (cMap[m.number] || 0) + 1; ch = true; }
        });
        if (ch) { localStorage.setItem('zamil_numotp_count', JSON.stringify(cMap)); setNumOtpTick((t) => t + 1); }
      } catch {}
    }
    prevSmsCountRef.current = count;
  }, []);
  const fetchSmsStream = useCallback(async () => {
    try {
      const res = await postApi<any>('/api/smscount');
      if (res && res.ok) ingestSms(res.count ?? 0, Array.isArray(res.recent) ? res.recent : []);
    } catch {}
  }, [ingestSms]);
  const fetchLeaderboard = useCallback(async (r = leaderboardRange) => {
    try {
      const res = await postApi<any>('/api/leaderboard', { range: r });
      if (res && res.ok) {
        setLeaderboardData({
          users: res.users || [],
          me: res.me || null,
          total: res.total || (res.users || []).length,
          scope: res.scope,
          teamName: res.teamName,
          mode: res.mode,
          secondary: res.secondary || []
        });
      }
    } catch {}
  }, [leaderboardRange]);
  const fetchDOR = useCallback(async () => {
    try {
      const res = await postApi<any>('/api/dor');
      if (res && res.ok && res.recent) setDorMessages(res.recent);
    } catch {}
  }, []);
  const checkDorAccess = useCallback(async () => {
    try {
      const res = await postApi<any>('/api/dor/access');
      if (res && res.ok) setHasDorAccess(!!res.allowed);
    } catch {}
  }, []);
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await postApi<any>('/api/notifs/list');
      if (res && res.ok && res.notifs) setNotifications(res.notifs);
    } catch {}
  }, []);
  useEffect(() => {
    if (!isLoggedIn) return;
    fetchRanges();
    fetchSmsStream();
    checkDorAccess();
    fetchNotifications();
    postApi<any>('/api/smscount-range', { range: 'week' }).then((r) => r?.ok && setWeekSmsCount(r.count || 0));
    postApi<any>('/api/smscount-range', { range: 'month' }).then((r) => r?.ok && setMonthSmsCount(r.count || 0));
  }, [isLoggedIn, fetchRanges, fetchSmsStream, checkDorAccess, fetchNotifications]);
  // ── FIX: RESTORE last position once per login (tab, sub-page, admin tab, lb range, open range) ──
  useEffect(() => {
    if (!isLoggedIn || navRestored) return;
    try {
      const s = JSON.parse(localStorage.getItem(navKey) || 'null');
      if (s) {
        if (s.sub) setSubPage(s.sub);
        if (s.adminTab) setAdminInitialTab(s.adminTab);
        if (s.lbRange === 'today' || s.lbRange === 'week' || s.lbRange === 'month') setLeaderboardRange(s.lbRange);
        if (s.range && s.range.id) { setSelectedRange(s.range); fetchNumbers(s.range); }
        if (s.tab) setActiveTab(s.tab === 'numbers' ? (s.range && s.range.id ? 'numbers' : 'ranges') : s.tab);
        if (s.tab === 'top10') fetchLeaderboard(s.lbRange || 'today');
        if (s.tab === 'dor') fetchDOR();
      }
    } catch {}
    setNavRestored(true);
  }, [isLoggedIn, navRestored, navKey, fetchNumbers, fetchLeaderboard, fetchDOR]);
  // ── FIX: SAVE position on every change (survives full browser refresh) ──
  useEffect(() => {
    if (!isLoggedIn || !navRestored) return;
    try {
      localStorage.setItem(navKey, JSON.stringify({ tab: activeTab, sub: subPage, adminTab: adminInitialTab, lbRange: leaderboardRange, range: selectedRange }));
    } catch {}
  }, [activeTab, subPage, adminInitialTab, leaderboardRange, selectedRange, isLoggedIn, navRestored, navKey]);
  // ── SSE bridge: live SMS feed replaces the old 5s polling ──
  useEffect(() => {
    if (!isLoggedIn) return;
    const rec = live.sms?.recent || [];
    if (!rec.length && (live.sms?.count || 0) === 0) return;
    ingestSms(live.sms.count || 0, rec);
  }, [live.sms, isLoggedIn, ingestSms]);
  // ── Auto-refresh when DB changes — FIX: never drops the update (retry scheduled) ──
  useEffect(() => {
    if (!isLoggedIn || !live.rangesV) return;
    requestRangesFetch(false);
  }, [live.rangesV, isLoggedIn, requestRangesFetch]);
  // ── FIX: Ship screen (or any component) can demand an immediate ranges refresh ──
  useEffect(() => {
    const h = () => requestRangesFetch(true);
    window.addEventListener('zamil:ranges-dirty', h);
    return () => window.removeEventListener('zamil:ranges-dirty', h);
  }, [requestRangesFetch]);
  useEffect(() => {
    if (!isLoggedIn || !live.numbersV || !selectedRange) return;
    fetchNumbers(selectedRange);
  }, [live.numbersV, isLoggedIn, selectedRange, fetchNumbers]);
  useEffect(() => {
    if (!isLoggedIn || !live.lbV) return;
    fetchLeaderboard(leaderboardRange);
  }, [live.lbV, isLoggedIn, fetchLeaderboard, leaderboardRange]);
  const dismissOtp = useCallback(() => setLatestOtpAlert(null), []);
  const handleSelectRange = (range: RangeItem) => {
    setSelectedRange(range);
    setActiveTab('numbers');
    fetchNumbers(range);
  };
  const handleUnassignRange = async (rangeId: string, rangeTitle: string, count: number) => {
    try {
      const res = await postApi<any>('/api/range/unassign', { rangeId });
      if (res && res.ok) {
        showToast(`✓ Freed ${count} numbers`, 'success');
        requestRangesFetch(true);
      }
    } catch { showToast('Unassign failed', 'error'); }
  };
  if (!isLoggedIn) return <LoginView />;
  const unreadCount = notifications.filter((n) => n.read).length;
  // Zoom applies to the user side only — Admin Hub / CLI Insights always stay at normal size
  const pageZoom = (subPage === 'admin' || subPage === 'cli') ? 1 : zoom;
  return (
    <div
      className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 dark:bg-[#0b1120] text-slate-900 dark:text-slate-100 flex flex-col transition-colors selection:bg-cyan-500 selection:text-white"
      style={{ zoom: pageZoom } as React.CSSProperties}
    >
      <Header
        onOpenNotifications={() => setSubPage('notifications')}
        onOpenAdmin={(tab) => {
          if (tab === 'cli') setSubPage('cli');
          else { setAdminInitialTab(tab || 'scc'); setSubPage('admin'); }
        }}
        onOpenChangePassword={() => setSubPage('password')}
        unreadNotifsCount={unreadCount}
        zoom={zoom}
        onZoom={changeZoom}
      />
      <main className="flex-1 w-full max-w-5xl mx-auto px-2.5 sm:px-6 pt-2.5 pb-20 overflow-x-hidden">
        {subPage === 'cli' && <CliInsightsView onBack={() => setSubPage('dashboard')} />}
        {subPage === 'admin' && <AdminConsoleView initialTab={adminInitialTab} onBack={() => setSubPage('dashboard')} />}
        {subPage === 'notifications' && <NotificationsView notifications={notifications} onBack={() => setSubPage('dashboard')} onRefresh={fetchNotifications} />}
        {subPage === 'password' && <ChangePasswordView onBack={() => setSubPage('dashboard')} />}
        {subPage === 'dashboard' && (
          <>
            {activeTab === 'ranges' && (
              <RangesView
                ranges={ranges}
                onSelectRange={handleSelectRange}
                onRefreshRanges={() => fetchRanges(true)}
                onUnassignRange={handleUnassignRange}
                smsCountToday={todaySmsCount}
                smsCountWeek={weekSmsCount}
                smsCountMonth={monthSmsCount}
                isLoading={false}
              />
            )}
            {activeTab === 'numbers' && selectedRange && (
              <NumbersView
                range={selectedRange}
                numbers={numbers}
                liveTick={numOtpTick}
                onBack={() => { setActiveTab('ranges'); setSelectedRange(null); }}
                onRefresh={() => fetchNumbers(selectedRange)}
              />
            )}
            {activeTab === 'inbox' && <InboxView messages={smsMessages} todayCount={todaySmsCount} weekCount={weekSmsCount} monthCount={monthSmsCount} onRefresh={fetchSmsStream} isLoading={false} />}
            {activeTab === 'add' && <AddNumbersView />}
            {activeTab === 'top10' && (
              <LeaderboardView
                data={leaderboardData}
                activeRange={leaderboardRange}
                onChangeRange={(r) => { setLeaderboardRange(r); fetchLeaderboard(r); }}
                onRefresh={() => fetchLeaderboard(leaderboardRange)}
                isLoading={false}
              />
            )}
            {activeTab === 'dor' && <DORView messages={dorMessages} onRefresh={fetchDOR} isLoading={false} />}
          </>
        )}
      </main>
      <Navigation
        activeTab={activeTab}
        onTabChange={(tab) => {
          setSubPage('dashboard');
          // FIX: an open range stays open — tapping "Ranges" returns to its numbers view
          // (the ← back button inside NumbersView is the only way to close it).
          if (tab === 'ranges' && selectedRange) setActiveTab('numbers');
          else setActiveTab(tab);
          if (tab === 'top10') fetchLeaderboard();
          if (tab === 'dor') fetchDOR();
        }}
        smsCountToday={todaySmsCount}
        hasDorAccess={hasDorAccess}
      />
      <LiveOtpFloatingCard message={latestOtpAlert} onDismiss={dismissOtp} />
    </div>
  );
}
export default function App() {
  return <DashboardContent />;
}
// === EOF: App.tsx ===
