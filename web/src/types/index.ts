export type PanelType = 'lamix' | 'zyron' | 'evs';
export type UserRole = 'super' | 'admin' | 'moderator' | 'none';
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
  prevRank?: number;
  rankChange?: number;
  streak?: number;
  achievements?: LeaderboardAchievement[];
  percentile?: number;
}

export interface LeaderboardTeam {
  team: string;
  label: string;
  count: number;
  top?: { username: string; count: number };
}

export interface LeaderboardData {
  users: LeaderboardUser[];
  // FIXED: 'me' now uses LeaderboardUser so it has access to streak, achievements, etc.
  me?: LeaderboardUser | null; 
  total: number;
  scope?: string;
  teamName?: string;
  mode?: string;
  secondary?: LeaderboardTeam[];
}
// === EOF: types/index.ts Leaderboard fix ===
export interface ShippingQueueItem {
  id?: string;
  created_at: string;
  range_name: string;
  username: string;
  qty: number;
  status: 'pending' | 'done' | 'failed';
  result?: {
    error?: string;
    _error?: string;
  };
}

export interface SCCSystemData {
  system: {
    status: 'nominal' | 'warning' | 'critical';
    score: number;
  };
  queue: {
    size: number;
    oldestMin: number;
    etaMins: number;
    avgDoneMin: number;
  };
  cdr: {
    status?: 'live' | 'sleep' | 'dead';
    alive: boolean;
    perMin: number;
    lagMin: number;
    buckets: number[];
  };
  boats: {
    active: number;
    total: number;
    list: Array<{
      name: string;
      ok: boolean;
      agoMin: number | null;
    }>;
  };
  load: {
    perMin: number;
    lastHour: number;
    buckets: number[];
    users?: number[];
  };
  users: {
    online: number;
    expected: number;
    list: Array<{ u: string }>;
  };
  daily: {
    today: number;
    yesterday: number;
    growthPct: number;
  };
  numbers: {
    assigned: number;
    total: number;
    utilPct: number;
  };
  alerts: Array<{ message: string }>;
  incidents: Array<{
    id: string;
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
    created_at: string;
    type: string;
  }>;
}

export interface NotificationItem {
  id: string;
  type: 'info' | 'success' | 'warn' | 'money';
  title?: string;
  body: string;
  at: string;
  read: boolean;
  readBy?: string[];
  by?: string;
}

export interface AdminTeam {
  prefix: string;
  admin: string;
  label?: string;
  count: number;
  otpToday?: number;
  otpWeek?: number;
  clients: Array<{
    id: string;
    username: string;
    name?: string;
    pinned?: boolean;
  }>;
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
  countries: Array<{
    country: string;
    flag: string;
    ranges: Array<{
      range: string;
      available: number;
      total: number;
    }>;
  }>;
}

export interface CliInsightsItem {
  cli: string;
  count: number;
  badge?: string;
  lastSeen?: string;
  countries: Array<{
    name: string;
    flag: string;
    range?: string;
    n: number;
  }>;
  samples?: Array<{
    t: string;
    text: string;
  }>;
}

export interface CliStats {
  totalSms: number;
  totalCli: number;
  topCountry?: {
    flag: string;
    name: string;
  };
  topCountries?: Array<{
    flag: string;
    name: string;
    n: number;
  }>;
}

export interface BulkRangeOption {
  range_id: string;
  name: string;
  unassigned: number;
}

export interface CrushOption {
  range_name: string;
  range_id?: string;
  count: number;
  gone?: boolean;
}

export interface CrushSuggestion {
  id: number;
  range_name: string;
  rows_alive: number;
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
  lastOtpAt?: string;
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
  prevRank?: number;
  rankChange?: number;
  streak?: number;
  achievements?: LeaderboardAchievement[];
  percentile?: number;
}
