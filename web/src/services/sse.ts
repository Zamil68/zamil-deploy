import { getSession } from "./api";
export interface LiveHandlers {
  sms?: (d: any) => void; numbers?: () => void; ranges?: () => void;
  lb?: () => void; crush?: (d: any) => void; status?: (s: "live" | "down") => void;
}
let es: EventSource | null = null; let retryT: any = null; let closed = true;
export function connectLive(h: LiveHandlers){
  disconnectLive(); closed = false;
  const open = () => {
    if (closed) return;
    const s = getSession(); if (!s) return;
    try { es = new EventSource("/api/stream?session=" + encodeURIComponent(s)); } catch { return; }
    es.onopen = () => h.status?.("live");
    es.addEventListener("sms", (e: any) => { try { h.sms?.(JSON.parse(e.data)); } catch {} });
    es.addEventListener("numbers", () => h.numbers?.());
    es.addEventListener("ranges", () => h.ranges?.());
    es.addEventListener("lb", () => h.lb?.());
    es.addEventListener("crush", (e: any) => { try { h.crush?.(JSON.parse(e.data)); } catch {} });
    es.onerror = () => { h.status?.("down"); try { es?.close(); } catch {} es = null;
      clearTimeout(retryT); retryT = setTimeout(open, 4000); };
  };
  open();
}
export function disconnectLive(){ closed = true; clearTimeout(retryT); try { es?.close(); } catch {} es = null; }