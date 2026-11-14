import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import { useLive } from './context/LiveContext';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import type { ActiveTab } from './components/Navigation';
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
import { bumpOtpCounts, ensureOtpDay, rolloverOtpDay, msUntilUtcMidnight } from './utils/otpCounter';
import type { RangeItem, SmsMessage, LeaderboardData, NotificationItem } from './types';

type AppSubPage = 'dashboard' | 'admin' | 'cli' | 'notifications' | 'password';
type LbRange = 'today' | 'week' | 'month';
type ReqKind = 'ranges' | 'numbers' | 'lb' | 'dor' | 'notif' | 'sms';

const ZOOM_MIN = 0.8, ZOOM_MAX = 1.5;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));

const RANGES_THROTTLE_MS = 8000;
const WINDOW_THROTTLE_MS = 120000;
const NOTIF_POLL_MS = 40000;
const SEEN_CAP = 800;

const smsKey = (m: SmsMessage) => `${m.number}|${m.cli}|${m.time}`;
const EMPTY_LB: LeaderboardData = { users: [], total: 0 };

function DashboardContent() {
  const { isLoggedIn, username } = useAuth();
  const { showToast } = useToast();
  const live = useLive();

  // ── navigation ──
  const [activeTab, setActiveTab] = useState<ActiveTab>('ranges');
  const [subPage, setSubPage] = useState<AppSubPage>('dashboard');
  const [adminInitialTab, setAdminInitialTab] = useState<string>('scc');
  const [navRestored, setNavRestored] = useState(false);

  // ── data ──
  const [selectedRange, setSelectedRange] = useState<RangeItem | null>(null);
  const [ranges, setRanges] = useState<RangeItem[]>([]);
  const [numbers, setNumbers] = useState<string[]>([]);
  const [smsMessages, setSmsMessages] = useState<SmsMessage[]>([]);
  const [todaySmsCount, setTodaySmsCount] = useState(0);
  const [weekSmsCount, setWeekSmsCount] = useState(0);
  const [monthSmsCount, setMonthSmsCount] = useState(0);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData>(EMPTY_LB);
  const [leaderboardRange, setLeaderboardRange] = useState<LbRange>('today');
  const [dorMessages, setDorMessages] = useState<SmsMessage[]>([]);
  const [hasDorAccess, setHasDorAccess] = useState(false);
  const [dorChecked, setDorChecked] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [latestOtpAlert, setLatestOtpAlert] = useState<
    { number: string; cli: string; message: string; time: string; burst?: number } | null
  >(null);

  // ── ui ──
  const [zoom, setZoom] = useState(1);
  const [numOtpTick, setNumOtpTick] = useState(0);
  const [rangesBusy, setRangesBusy] = useState(false);
  const [smsBusy, setSmsBusy] = useState(false);
  const [lbBusy, setLbBusy] = useState(false);
  const [dorBusy, setDorBusy] = useState(false);

  // ── refs: epoch guards every async response (no cross-user / stale writes) ──
  const epochRef = useRef(0);
  const userKeyRef = useRef<string | null>(null);
  const activeRef = useRef(isLoggedIn);
  const reqIdRef = useRef<Record<ReqKind, number>>({ ranges: 0, numbers: 0, lb: 0, dor: 0, notif: 0, sms: 0 });
  const lbRangeRef = useRef<LbRange>(leaderboardRange);
  const smsSeededRef = useRef(false);
  const seenSmsKeysRef = useRef<Set<string>>(new Set());
  const lastRangeFetchRef = useRef(0);
  const rangeRetryRef = useRef(0);
  const lastWindowFetchRef = useRef(0);

  const navKey = 'zamil_nav_' + (username || '');
  const userKey = isLoggedIn ? (username || '') : '';

  useEffect(() => { activeRef.current = isLoggedIn; }, [isLoggedIn]);
  useEffect(() => { lbRangeRef.current = leaderboardRange; }, [leaderboardRange]);

  const begin = (kind: ReqKind) => ({ epoch: epochRef.current, id: ++reqIdRef.current[kind] });
  const stale = (kind: ReqKind, t: { epoch: number; id: number }) =>
    t.epoch !== epochRef.current || reqIdRef.current[kind] !== t.id;

  // ── WIPE everything on logout / account switch (was leaking user A's data to user B) ──
  useEffect(() => {
    if (userKeyRef.current === userKey) return;
    userKeyRef.current = userKey;
    epochRef.current++;
    if (rangeRetryRef.current) { clearTimeout(rangeRetryRef.current); rangeRetryRef.current = 0; }
    lastRangeFetchRef.current = 0;
    lastWindowFetchRef.current = 0;
    smsSeededRef.current = false;
    seenSmsKeysRef.current = new Set();
    setRanges([]); setNumbers([]); setSmsMessages([]); setDorMessages([]);
    setNotifications([]); setSelectedRange(null);
    setTodaySmsCount(0); setWeekSmsCount(0); setMonthSmsCount(0);
    setLeaderboardData(EMPTY_LB); setLatestOtpAlert(null);
    setHasDorAccess(false); setDorChecked(false);
    setRangesBusy(false); setSmsBusy(false); setLbBusy(false); setDorBusy(false);
    if (!isLoggedIn) {
      setNavRestored(false);
      setActiveTab('ranges'); setSubPage('dashboard'); setAdminInitialTab('scc');
      setLeaderboardRange('today'); setZoom(1);
    }
  }, [userKey, isLoggedIn]);

  // clear the deferred ranges timer on unmount
  useEffect(() => () => { if (rangeRetryRef.current) clearTimeout(rangeRetryRef.current); }, []);

  // ── zoom (per user, per device) ──
  useEffect(() => {
    if (!isLoggedIn) return;
    try {
      const v = parseFloat(localStorage.getItem('zamil_zoom_' + (username || '')) || '1');
      setZoom(isNaN(v) ? 1 : clampZoom(v));
    } catch { setZoom(1); }
  }, [isLoggedIn, username]);

  const changeZoom = useCallback((z: number) => {
    const c = clampZoom(z);
    setZoom(c);
    try { localStorage.setItem('zamil_zoom_' + (username || ''), String(c)); } catch {}
  }, [username]);

  // ── fetchers ──
  const fetchRanges = useCallback(async (force = false) => {
    if (!activeRef.current) return;
    const t = begin('ranges');
    setRangesBusy(true);
    const res = await postApi<any>('/api/ranges', { forceRefresh: force });
    if (stale('ranges', t)) return;
    setRangesBusy(false);
    if (res?.ok && Array.isArray(res.ranges)) setRanges(res.ranges);
  }, []);

  // throttled, but a pending refresh is never dropped — force jumps the queue
  const requestRangesFetch = useCallback((force = false) => {
    if (!activeRef.current) return;
    const wait = force ? 0 : Math.max(0, RANGES_THROTTLE_MS - (Date.now() - lastRangeFetchRef.current));
    if (wait === 0) {
      if (rangeRetryRef.current) { clearTimeout(rangeRetryRef.current); rangeRetryRef.current = 0; }
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
    if (!activeRef.current || !range?.id) return;
    const t = begin('numbers');
    const res = await postApi<any>('/api/numbers', { rangeId: range.id, rangeTitle: range.title, limit: 500 });
    if (stale('numbers', t)) return; // fast range switching can no longer show the wrong list
    if (res?.ok && Array.isArray(res.numbers)) {
      setNumbers(res.numbers.map((n: any) =>
        typeof n === 'string' ? n : (n.numberFull || n.number || Object.values(n)[0] || '')
      ).filter(Boolean));
    } else if (res && res.ok === false) {
      showToast(res.error || 'Numbers load failed', 'error');
    }
  }, [showToast]);

  // single ingest point → list + ONE floating card with burst count
  const ingestSms = useCallback((count: number, rec: SmsMessage[]) => {
    setTodaySmsCount(count);
    setSmsMessages(rec);
    const seen = seenSmsKeysRef.current;
    const fresh = rec.filter((m) => !seen.has(smsKey(m)));
    if (fresh.length) {
      fresh.forEach((m) => seen.add(smsKey(m)));
      // seed silently once; after that every new OTP alerts (incl. the first one after midnight)
      if (smsSeededRef.current) {
        const f = fresh[0];
        setLatestOtpAlert({ number: f.number, cli: f.cli, message: f.message, time: f.time, burst: fresh.length });
      }
      // Daily per-number OTP counters — driven ONLY by received OTPs, never by copying.
      // Day-keyed store auto-resets at 00:00 UTC = 05:00 PKT.
      if (bumpOtpCounts(fresh.map((m) => m.number))) setNumOtpTick((t) => t + 1);
    }
    // bound the dedupe set (was growing forever)
    if (seen.size > SEEN_CAP) seenSmsKeysRef.current = new Set(rec.map(smsKey));
    smsSeededRef.current = true;
  }, []);

  const fetchSmsStream = useCallback(async () => {
    if (!activeRef.current) return;
    const t = begin('sms');
    setSmsBusy(true);
    const res = await postApi<any>('/api/smscount');
    if (stale('sms', t)) return;
    setSmsBusy(false);
    if (res?.ok) ingestSms(res.count ?? 0, Array.isArray(res.recent) ? res.recent : []);
  }, [ingestSms]);

  const refreshWindowCounts = useCallback(async (force = false) => {
    if (!activeRef.current) return;
    const now = Date.now();
    if (!force && now - lastWindowFetchRef.current < WINDOW_THROTTLE_MS) return;
    lastWindowFetchRef.current = now;
    const epoch = epochRef.current;
    const [w, m] = await Promise.all([
      postApi<any>('/api/smscount-range', { range: 'week' }),
      postApi<any>('/api/smscount-range', { range: 'month' })
    ]);
    if (epoch !== epochRef.current) return;
    if (w?.ok) setWeekSmsCount(w.count || 0);
    if (m?.ok) setMonthSmsCount(m.count || 0);
  }, []);

  const fetchLeaderboard = useCallback(async (r?: LbRange) => {
    if (!activeRef.current) return;
    const range = r || lbRangeRef.current;
    const t = begin('lb');
    setLbBusy(true);
    const res = await postApi<any>('/api/leaderboard', { range });
    if (stale('lb', t)) return;
    setLbBusy(false);
    if (res?.ok) {
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
  }, []);

  const fetchDOR = useCallback(async () => {
    if (!activeRef.current) return;
    const t = begin('dor');
    setDorBusy(true);
    const res = await postApi<any>('/api/dor');
    if (stale('dor', t)) return;
    setDorBusy(false);
    if (res?.ok && Array.isArray(res.recent)) setDorMessages(res.recent);
  }, []);

  const checkDorAccess = useCallback(async () => {
    if (!activeRef.current) return;
    const epoch = epochRef.current;
    const res = await postApi<any>('/api/dor/access');
    if (epoch !== epochRef.current) return;
    if (res?.ok) setHasDorAccess(!!res.allowed);
    setDorChecked(true);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!activeRef.current) return;
    const t = begin('notif');
    const res = await postApi<any>('/api/notifs/list');
    if (stale('notif', t)) return;
    if (res?.ok && Array.isArray(res.notifs)) setNotifications(res.notifs);
  }, []);

  // ── initial load ──
  useEffect(() => {
    if (!isLoggedIn) return;
    fetchRanges(true);
    fetchSmsStream();
    checkDorAccess();
    fetchNotifications();
    refreshWindowCounts(true);
  }, [isLoggedIn, fetchRanges, fetchSmsStream, checkDorAccess, fetchNotifications, refreshWindowCounts]);

  // ── notification pill + window counters (paused while tab is hidden) ──
  useEffect(() => {
    if (!isLoggedIn) return;
    const iv = window.setInterval(() => {
      if (document.hidden) return;
      fetchNotifications();
      refreshWindowCounts();
    }, NOTIF_POLL_MS);
    const onVis = () => {
      if (document.hidden) return;
      fetchNotifications();
      refreshWindowCounts();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [isLoggedIn, fetchNotifications, refreshWindowCounts]);

  // ── restore last position once per login ──
  useEffect(() => {
    if (!isLoggedIn || navRestored) return;
    try {
      const s = JSON.parse(localStorage.getItem(navKey) || 'null');
      if (s) {
        if (s.sub) setSubPage(s.sub);
        if (s.adminTab) setAdminInitialTab(s.adminTab);
        if (s.lbRange === 'today' || s.lbRange === 'week' || s.lbRange === 'month') setLeaderboardRange(s.lbRange);
        if (s.range?.id) { setSelectedRange(s.range); fetchNumbers(s.range); }
        if (s.tab) setActiveTab(s.tab === 'numbers' ? (s.range?.id ? 'numbers' : 'ranges') : s.tab);
        if (s.tab === 'top10') fetchLeaderboard(s.lbRange || 'today');
        if (s.tab === 'dor') fetchDOR();
      }
    } catch {}
    setNavRestored(true);
  }, [isLoggedIn, navRestored, navKey, fetchNumbers, fetchLeaderboard, fetchDOR]);

  // ── persist position ──
  useEffect(() => {
    if (!isLoggedIn || !navRestored) return;
    try {
      localStorage.setItem(navKey, JSON.stringify({
        tab: activeTab, sub: subPage, adminTab: adminInitialTab,
        lbRange: leaderboardRange, range: selectedRange
      }));
    } catch {}
  }, [activeTab, subPage, adminInitialTab, leaderboardRange, selectedRange, isLoggedIn, navRestored, navKey]);

  // ── SSE bridges ──
  useEffect(() => {
    if (!isLoggedIn) return;
    const rec = live.sms?.recent || [];
    if (!rec.length && (live.sms?.count || 0) === 0) return;
    ingestSms(live.sms.count || 0, rec);
  }, [live.sms, isLoggedIn, ingestSms]);

  useEffect(() => {
    if (!isLoggedIn || !live.rangesV) return;
    requestRangesFetch(false);
  }, [live.rangesV, isLoggedIn, requestRangesFetch]);

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
    fetchLeaderboard();
  }, [live.lbV, isLoggedIn, fetchLeaderboard]);

  // ── an open range that was freed / crushed / synced away closes itself ──
  useEffect(() => {
    if (!isLoggedIn || !selectedRange || !ranges.length) return;
    if (ranges.some((r) => r.id === selectedRange.id)) return;
    setSelectedRange(null);
    setNumbers([]);
    setActiveTab((t) => (t === 'numbers' ? 'ranges' : t));
    showToast('Range no longer assigned', 'info');
  }, [ranges, selectedRange, isLoggedIn, showToast]);

  // ── DOR revoked while sitting on the DOR tab ──
  useEffect(() => {
    if (dorChecked && !hasDorAccess && activeTab === 'dor') setActiveTab('ranges');
  }, [dorChecked, hasDorAccess, activeTab]);

  // __ZAMIL_LIVE_V2__ ── DOR live feed + instant alerts + crush bridge
  const lastDorFetchRef = useRef(0);
  const dorLiveRefresh = useCallback(() => {
    if (!activeRef.current || activeTab !== 'dor' || !hasDorAccess) return;
    if (Date.now() - lastDorFetchRef.current < 8000) return;
    lastDorFetchRef.current = Date.now();
    fetchDOR();
  }, [activeTab, hasDorAccess, fetchDOR]);

  // while the DOR tab is open: 15s poll + refresh on focus (paused when hidden)
  useEffect(() => {
    if (!isLoggedIn || activeTab !== 'dor' || !hasDorAccess) return;
    if (Date.now() - lastDorFetchRef.current > 3000) {
      lastDorFetchRef.current = Date.now();
      fetchDOR();
    }
    const iv = window.setInterval(() => {
      if (document.hidden) return;
      lastDorFetchRef.current = Date.now();
      fetchDOR();
    }, 15000);
    const onVis = () => { if (!document.hidden) dorLiveRefresh(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [isLoggedIn, activeTab, hasDorAccess, fetchDOR, dorLiveRefresh]);

  // own OTP arrived → pull the global DOR feed immediately (throttled)
  useEffect(() => {
    if (!isLoggedIn || !live.sms) return;
    dorLiveRefresh();
  }, [live.sms, isLoggedIn, dorLiveRefresh]);

  // notification bell: instant on SSE push (was up to 40s late)
  const notifSeenRef = useRef(0);
  useEffect(() => {
    if (!isLoggedIn || live.notifV === notifSeenRef.current) return;
    notifSeenRef.current = live.notifV;
    fetchNotifications();
  }, [live.notifV, isLoggedIn, fetchNotifications]);

  // admin crushed a range → refresh ownership now
  const crushSeenRef = useRef(0);
  useEffect(() => {
    if (!isLoggedIn || live.crushV === crushSeenRef.current) return;
    crushSeenRef.current = live.crushV;
    requestRangesFetch(true);
    if (selectedRange) fetchNumbers(selectedRange);
  }, [live.crushV, isLoggedIn, requestRangesFetch, selectedRange, fetchNumbers]);

  // __ZAMIL_OTP_DAILY__ — counters roll over at 00:00 UTC (05:00 PKT).
  // ONLY counters reset. USED marks, ownership and number status are untouched.
  useEffect(() => {
    if (!isLoggedIn) return;
    if (ensureOtpDay().rolled) setNumOtpTick((v) => v + 1);
    let t = 0;
    const roll = () => {
      rolloverOtpDay();
      setNumOtpTick((v) => v + 1);
      setTodaySmsCount(0);
      setSmsMessages([]);
      fetchSmsStream();
      refreshWindowCounts(true);
      t = window.setTimeout(roll, msUntilUtcMidnight());
    };
    t = window.setTimeout(roll, msUntilUtcMidnight());
    const onVis = () => {
      if (document.hidden) return;
      if (ensureOtpDay().rolled) {
        setNumOtpTick((v) => v + 1);
        setTodaySmsCount(0);
        setSmsMessages([]);
        fetchSmsStream();
        refreshWindowCounts(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [isLoggedIn, fetchSmsStream, refreshWindowCounts]);

  const dismissOtp = useCallback(() => setLatestOtpAlert(null), []);

  const handleSelectRange = useCallback((range: RangeItem) => {
    setSelectedRange(range);
    setActiveTab('numbers');
    setNumbers([]);
    fetchNumbers(range);
  }, [fetchNumbers]);

  const handleUnassignRange = useCallback(async (rangeId: string, _rangeTitle: string, count: number) => {
    const res = await postApi<any>('/api/range/unassign', { rangeId });
    if (res?.ok) {
      showToast(`✓ Freed ${res.removed ?? count} numbers`, 'success');
      if (selectedRange?.id === rangeId) {
        setSelectedRange(null);
        setNumbers([]);
        setActiveTab((t) => (t === 'numbers' ? 'ranges' : t));
      }
      requestRangesFetch(true);
      refreshWindowCounts(true);
    } else {
      showToast(res?.error || 'Unassign failed', 'error');
    }
  }, [showToast, selectedRange, requestRangesFetch, refreshWindowCounts]);

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setSubPage('dashboard');
    // an open range stays open — the ← button inside NumbersView closes it
    setActiveTab(tab === 'ranges' && selectedRange ? 'numbers' : tab);
    if (tab === 'top10') fetchLeaderboard();
    if (tab === 'dor') fetchDOR();
  }, [selectedRange, fetchLeaderboard, fetchDOR]);

  const backToDashboard = useCallback(() => setSubPage('dashboard'), []);

  if (!isLoggedIn) return <LoginView />;

  const unreadCount = notifications.reduce((n, x) => n + (x.read ? 0 : 1), 0);
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
        {subPage === 'cli' && <CliInsightsView onBack={backToDashboard} />}
        {subPage === 'admin' && <AdminConsoleView initialTab={adminInitialTab} onBack={backToDashboard} />}
        {subPage === 'notifications' && (
          <NotificationsView notifications={notifications} onBack={backToDashboard} onRefresh={fetchNotifications} />
        )}
        {subPage === 'password' && <ChangePasswordView onBack={backToDashboard} />}

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
                isLoading={rangesBusy}
              />
            )}

            {activeTab === 'numbers' && selectedRange && (
              <NumbersView
                range={selectedRange}
                numbers={numbers}
                liveTick={numOtpTick}
                onBack={() => { setActiveTab('ranges'); setSelectedRange(null); setNumbers([]); }}
                onRefresh={() => fetchNumbers(selectedRange)}
              />
            )}

            {activeTab === 'inbox' && (
              <InboxView
                messages={smsMessages}
                todayCount={todaySmsCount}
                weekCount={weekSmsCount}
                monthCount={monthSmsCount}
                onRefresh={fetchSmsStream}
                isLoading={smsBusy}
              />
            )}

            {activeTab === 'add' && <AddNumbersView />}

            {activeTab === 'top10' && (
              <LeaderboardView
                data={leaderboardData}
                activeRange={leaderboardRange}
                onChangeRange={(r) => { setLeaderboardRange(r); lbRangeRef.current = r; fetchLeaderboard(r); }}
                onRefresh={() => fetchLeaderboard()}
                isLoading={lbBusy}
              />
            )}

            {activeTab === 'dor' && <DORView messages={dorMessages} onRefresh={fetchDOR} isLoading={dorBusy} />}
          </>
        )}
      </main>

      <Navigation
        activeTab={activeTab}
        onTabChange={handleTabChange}
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
