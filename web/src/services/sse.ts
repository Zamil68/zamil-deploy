import { getSession } from "./api";

export interface LiveHandlers {
  sms?: (d: any) => void;
  numbers?: () => void;
  ranges?: () => void;
  lb?: () => void;
  crush?: (d: any) => void;
  notif?: () => void;
  status?: (s: "live" | "down") => void;
}

let es: EventSource | null = null;
let retryT: any = null;
let closed = true;
let tries = 0;

const parse = (e: any) => { try { return JSON.parse(e.data); } catch { return null; } };

export function connectLive(h: LiveHandlers) {
  disconnectLive();
  closed = false;
  tries = 0;

  const open = () => {
    if (closed) return;
    const s = getSession();
    if (!s) { retryT = setTimeout(open, 2000); return; }
    let sock: EventSource;
    try { sock = new EventSource("/api/stream?session=" + encodeURIComponent(s)); }
    catch { retryT = setTimeout(open, 4000); return; }
    es = sock;

    sock.onopen = () => { tries = 0; h.status?.("live"); };
    sock.addEventListener("sms", (e: any) => { const d = parse(e); if (d) h.sms?.(d); });
    sock.addEventListener("numbers", () => h.numbers?.());
    sock.addEventListener("ranges", () => h.ranges?.());
    sock.addEventListener("lb", () => h.lb?.());
    sock.addEventListener("crush", (e: any) => h.crush?.(parse(e)));
    sock.addEventListener("notif", () => h.notif?.());

    sock.onerror = () => {
      h.status?.("down");
      try { sock.close(); } catch {}
      if (es === sock) es = null;
      if (closed) return;
      tries++;
      // 4s → 6s → 8s … capped at 15s (was a fixed 4s hammer when the API is down)
      const wait = Math.min(15000, 4000 + (tries - 1) * 2000);
      clearTimeout(retryT);
      retryT = setTimeout(open, wait);
    };
  };
  open();
}

export function disconnectLive() {
  closed = true;
  clearTimeout(retryT);
  retryT = null;
  tries = 0;
  try { es?.close(); } catch {}
  es = null;
}
