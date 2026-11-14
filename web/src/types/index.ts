export type PanelType = 'lamix' | 'zyron' | 'evs';
export type UserRole = 'super' | 'admin' | 'moderator' | 'none';
export type NotifType = 'info' | 'success' | 'warn' | 'emergency' | 'money' | 'system_alert';
export type LbRange = 'today' | 'week' | 'month';

export interface UserSession {
  session: string;
  username: string;
  clientId?: string;
  clientName?: string;
  panelNum?: number;
  role: UserRole;
  panel: PanelType;
}

export interface RangeItem {
  id: string;
  title: string;
  count: number;
  prefix?: string;
  country?: string;
  detail?: string;
  minsAgo?: number;
  available?: number;
  total?: number;
}

export interface NumberItem {
  raw: string;
  display: string;
  isNew?: boolean;
  isCopied?: boolean;
  smsCount?: number;
}

export interface SmsMessage {
  id?: string;
  number: string;
  cli: string;
  message: string;
  time: string;
  datetime?: string;
  range?: string;
  client?: string;
}

export interface LeaderboardAchievement {
  id: string;
  type: 'streak' | 'champion' | 'rising' | 'top3';
  label: string;
  icon: string;
  color: string;
}

export interface LeaderboardUser {
  username: string;
  count: number;
  rank?: number;
  prevRank?: number | null;
  rankChange?: number;
  streak?: number;
  achievements?: LeaderboardAchievement[];
  percentile?: number;
}

export interface LeaderboardTeam {
  team: string;
  label: string;
  count: number;
  top?: { username: string; count: number } | null;
}

export interface LeaderboardData {
  users: LeaderboardUser[];
  me?: LeaderboardUser | null;
  total: number;
  scope?: string;
  teamName?: string;
  mode?: string;
  secondary?: LeaderboardTeam[];
}

export interface ShippingQueueItem {
  id?: string;
  created_at: string;
  processed_at?: string | null;
  range_id?: string;
  range_name: string;
  username: string;
  qty: number;
  status: 'pending' | 'done' | 'failed';
  result?: { error?: string; _error?: string; assigned?: number; instant?: boolean };
}

export interface SCCSystemData {
  timestamp?: string;
  system: { status: 'nominal' | 'healthy' | 'warning' | 'critical'; score: number; cdr?: string };
  queue: { size: number; oldestMin: number; etaMins: number; avgDoneMin: number };
  cdr: { status?: 'live' | 'sleep' | 'dead'; alive: boolean; perMin: number; lagMin: number | null; buckets: number[] };
  boats: { active: number; total: number; list: Array<{ id?: number; name: string; ok: boolean; agoMin: number | null }> };
  load: { perMin: number; lastHour: number; buckets: number[]; users?: number[] };
  users: { online: number; expected: number; list: Array<{ u: string; ago?: number }> };
  daily: { today: number; yesterday: number; growthPct: number };
  numbers: { assigned: number; total: number; free?: number; utilPct: number; lastReconcile?: string };
  alerts: Array<{ severity?: string; message: string }>;
  incidents: Array<{ id: string; title: string; message: string; severity: 'info' | 'warning' | 'critical'; created_at: string; type: string }>;
  otp?: { week: number; month: number; total: number };
  weekBuckets?: number[];
  teams?: Array<{ prefix: string; otpToday: number; top: { username: string; count: number } | null }>;
}

export interface NotificationItem {
  id: string;
  type: NotifType;
  title?: string;
  body: string;
  at: string;
  read: boolean;
  by?: string;
}

export interface AdminTeam {
  prefix: string;
  admin: string;
  label?: string;
  count: number;
  otpToday?: number;
  otpWeek?: number;
  clients: Array<{ id: string; username: string; name?: string; pinned?: boolean }>;
}

export interface StatsOverview {
  totalCountries: number;
  totalRanges: number;
  totalNumbers: number;
  allocated: number;
  available: number;
  otpToday: number;
  otpWeek: number;
  otpMonth: number;
  mostActiveRange?: string;
  mostActiveCount?: number;
  countries: Array<{ country: string; flag?: string; ranges: Array<{ range: string; available: number; total: number }> }>;
}

// `flag` is optional: /api/cli/analysis returns { name, range, n } — the UI derives the flag.
export interface CliInsightsItem {
  cli: string;
  count: number;
  badge?: string;
  lastSeen?: string;
  countries: Array<{ name: string; flag?: string; range?: string; n: number }>;
  samples?: Array<{ t: string; text: string }>;
}

export interface CliStats {
  totalSms: number;
  totalCli: number;
  topCountry?: { name: string; n?: number; flag?: string } | null;
  topCountries?: Array<{ name: string; n: number; flag?: string }>;
}

export interface BulkRangeOption { range_id: string; name: string; unassigned: number }

export interface CrushOption {
  range_name: string;
  range_id?: string;
  count: number;
  active?: number;
  users?: number;
  pool_assigned?: number;
  pool_free?: number;
  gone?: boolean;
  live?: boolean;
}

export interface CrushSuggestion {
  id: number;
  range_name: string;
  rows_alive: number;
  status?: string;
  source?: 'vanished' | 'returned' | 'auto' | 'manual';
}

export interface FleetRangeDbItem {
  id: string;
  name: string;
  country: string;
  prefix: string;
  totalDbRows: number;
  allocatedToUsers: number;
  freeInPool: number;
  inGateway: boolean;
  activeUsersCount: number;
  lastOtpAt?: string | null;
}

export interface UserRestrictionStatus {
  user: string;
  isRestricted: boolean;
  restrictionReason?: string;
  expiresInMins?: number;
  dailyRangesLimit: number;
  dailyCountriesLimit: number;
  maxPerAlloc: number;
  burstQuotaAllowance: number;
}
