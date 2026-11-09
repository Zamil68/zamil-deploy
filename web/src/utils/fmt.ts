export function ago(iso: any): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  if (s < 90) return "1m ago";
  
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  
  return Math.floor(h / 24) + "d ago";
}

export const pct = (a: number, b: number): number => 
  (b ? Math.max(2, Math.min(100, Math.round((a / b) * 100))) : 0);

export const hue = (s: string): number => {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
};
const ACR = new Set(['sms','otp','api','lm','uk','us','pk','tv','hq']);
export const prettyUser = (s: string): string => String(s || '').split(/(_|[\s-]+)/).map((seg) => {
  if (!seg || /[_\s-]+/.test(seg)) return seg;
  const l = seg.toLowerCase();
  if (ACR.has(l)) return l.toUpperCase();
  if (l.length <= 4) return l.toUpperCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
}).join('');
