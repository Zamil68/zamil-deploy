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
  const prevSmsCountRef = useRef<number>(0);
  const seenSmsKeysRef = useRef<Set<string>>(new Set());
  const lastRangeFetchRef = useRef<number>(0);

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

  // ── SSE bridge: live SMS feed replaces the old 5s polling ──
  useEffect(() => {
    if (!isLoggedIn) return;
    const rec = live.sms?.recent || [];
    if (!rec.length && (live.sms?.count || 0) === 0) return;
    ingestSms(live.sms.count || 0, rec);
  }, [live.sms, isLoggedIn, ingestSms]);

  // ── Auto-refresh when DB changes (new range / numbers / leaderboard) ──
  useEffect(() => {
    if (!isLoggedIn || !live.rangesV) return;
    const now = Date.now();
    if (now - lastRangeFetchRef.current < 8000) return; // throttle bursts
    lastRangeFetchRef.current = now;
    fetchRanges(false);
  }, [live.rangesV, isLoggedIn, fetchRanges]);

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
        fetchRanges(true);
      }
    } catch { showToast('Unassign failed', 'error'); }
  };

  if (!isLoggedIn) return <LoginView />;
  const unreadCount = notifications.filter((n) => !n.read).length;
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
              <NumbersView range={selectedRange} numbers={numbers} onBack={() => { setActiveTab('ranges'); setSelectedRange(null); }} onRefresh={() => fetchNumbers(selectedRange)} />
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
          setActiveTab(tab);
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
