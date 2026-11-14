// Daily per-number OTP counters.
// Source of truth = OTPs actually RECEIVED (Live OTP feed) — never copy clicks.
// Auto-resets at 00:00 UTC = 05:00 PKT. "USED" marks live in zamil_copied_<rangeId>
// and are never touched here.
export const OTP_CAP = 30;
const KEY = 'zamil_numotp_day';
const MAX_KEYS = 6000;

export interface OtpDayStore { day: string; counts: Record<string, number> }

export const utcDay = (d: Date = new Date()) => d.toISOString().slice(0, 10);

let legacyPurged = false;
function purgeLegacy() {
  if (legacyPurged) return;
  legacyPurged = true;
  try {
    localStorage.removeItem('zamil_numotp_start');
    localStorage.removeItem('zamil_numotp_count');
  } catch {}
}

function write(store: OtpDayStore) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {}
}

// Returns today's store; if the stored day is older, it is replaced with an empty one.
export function ensureOtpDay(): { store: OtpDayStore; rolled: boolean } {
  purgeLegacy();
  const today = utcDay();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.day === today && raw.counts && typeof raw.counts === 'object') {
      return { store: raw as OtpDayStore, rolled: false };
    }
  } catch {}
  const store: OtpDayStore = { day: today, counts: {} };
  write(store);
  return { store, rolled: true };
}

export function readOtpCounts(): Record<string, number> {
  return ensureOtpDay().store.counts;
}

// Called ONLY when new OTPs arrive. Returns true if any counter moved.
export function bumpOtpCounts(numbers: string[]): boolean {
  if (!numbers || !numbers.length) return false;
  const { store } = ensureOtpDay();
  let changed = false;
  for (const raw of numbers) {
    const k = String(raw || '');
    if (!k) continue;
    const cur = store.counts[k] || 0;
    if (cur >= OTP_CAP) continue;
    store.counts[k] = cur + 1;
    changed = true;
  }
  if (changed) {
    const keys = Object.keys(store.counts);
    if (keys.length > MAX_KEYS) {
      const trimmed: Record<string, number> = {};
      keys.slice(-MAX_KEYS).forEach((k) => { trimmed[k] = store.counts[k]; });
      store.counts = trimmed;
    }
    write(store);
  }
  return changed;
}

export function rolloverOtpDay(): boolean {
  return ensureOtpDay().rolled;
}

export function msUntilUtcMidnight(): number {
  const n = new Date();
  const next = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 2);
  return Math.max(1000, next - Date.now());
}
