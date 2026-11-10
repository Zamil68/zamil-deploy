let ctx: AudioContext | null = null;
const getCtx = () => {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};
const tone = (freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, delay = 0) => {
  const c = getCtx();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + delay);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + delay + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + delay);
  o.stop(c.currentTime + delay + dur);
};
export type ToneId = 'sms' | 'bell' | 'chime' | 'ding' | 'soft' | 'none';
export const TONES: { id: ToneId; label: string; emoji: string }[] = [
  { id: 'sms', label: 'SMS (Single)', emoji: '📩' },
  { id: 'bell', label: 'Bell', emoji: '🔔' },
  { id: 'chime', label: 'Chime', emoji: '✨' },
  { id: 'ding', label: 'Ding', emoji: '🛎️' },
  { id: 'soft', label: 'Soft', emoji: '🌙' },
  { id: 'none', label: 'Silent', emoji: '🔇' },
];
// Prevent double-beep: track last played time
let lastPlayedAt = 0;
export const playTone = (id: ToneId) => {
  if (id === 'none') return;
  const now = Date.now();
  if (now - lastPlayedAt < 800) return; // Debounce: max 1 tone per 800ms
  lastPlayedAt = now;
  try {
    switch (id) {
      case 'sms':
        // Clean single SMS beep: quick bright ping
        tone(880, 0.15, 'sine', 0.15);
        tone(1320, 0.2, 'sine', 0.10, 0.05);
        break;
      case 'bell':
        tone(830, 0.4, 'sine', 0.12);
        tone(1245, 0.5, 'sine', 0.08, 0.08);
        break;
      case 'chime':
        tone(523, 0.25, 'sine', 0.10);
        tone(784, 0.35, 'sine', 0.08, 0.12);
        break;
      case 'ding':
        tone(1175, 0.5, 'sine', 0.12);
        break;
      case 'soft':
        tone(440, 0.4, 'sine', 0.08);
        break;
    }
  } catch {}
};
export const getSavedTone = (): ToneId => {
  try { return (localStorage.getItem('zamil_otp_tone') as ToneId) || 'sms'; } catch { return 'sms'; }
};
export const saveTone = (id: ToneId) => {
  try { localStorage.setItem('zamil_otp_tone', id); } catch {}
};
// ── Session-applied tone: "apply now" override, falls back to saved tone ──
let activeTone: ToneId | null = null;
export const setActiveTone = (id: ToneId) => { activeTone = id; };
export const getActiveTone = (): ToneId => activeTone || getSavedTone();
// === EOF: sounds.ts ===
