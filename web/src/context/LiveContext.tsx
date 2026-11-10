import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { connectLive, disconnectLive } from "../services/sse";
import { postApi } from "../services/api";
import { useAuth } from "./AuthContext";
import type { SmsMessage } from "../types";

interface LiveCtx {
  status: "live" | "down";
  sms: { count: number; recent: SmsMessage[] };
  otpAlert: { item: SmsMessage; burst: number; ts: number } | null;
  clearOtp: () => void;
  rangesV: number; numbersV: number; lbV: number;
  refreshSms: () => Promise<void>;
}
const Ctx = createContext<LiveCtx>(null as any);
export const useLive = () => useContext(Ctx);

const keyOf = (r: any) => (r?.datetime || r?.time || "") + "|" + (r?.number || "") + "|" + (r?.cli || "");

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [status, setStatus] = useState<"live" | "down">("down");
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);
  const [sms, setSms] = useState<{ count: number; recent: SmsMessage[] }>({ count: 0, recent: [] });
  const [otpAlert, setOtpAlert] = useState<LiveCtx["otpAlert"]>(null);
  const [rangesV, setRangesV] = useState(0);
  const [numbersV, setNumbersV] = useState(0);
  const [lbV, setLbV] = useState(0);
  const seen = useRef<Set<string>>(new Set());
  const seeded = useRef(false);

  const refreshSms = async () => {
    const d = await postApi<any>("/api/smscount");
    if (d?.ok) setSms({ count: d.count || 0, recent: d.recent || [] });
  };

  useEffect(() => {
    if (!session) { disconnectLive(); return; }
    seeded.current = false;
    seen.current = new Set();
    refreshSms();
    connectLive({
      status: setStatus,
      sms: (d) => {
        if (!d?.ok) return;
        setSms({ count: d.count || 0, recent: d.recent || [] });
        const rec = d.recent || [];
        if (!seeded.current) { seeded.current = true; rec.forEach((r: any) => seen.current.add(keyOf(r))); return; }
        const fresh = rec.filter((r: any) => !seen.current.has(keyOf(r)));
        if (fresh.length) { fresh.forEach((r: any) => seen.current.add(keyOf(r))); setOtpAlert({ item: fresh[0], burst: fresh.length, ts: Date.now() }); }
      },
      numbers: () => setNumbersV(v => v + 1),
      ranges: () => setRangesV(v => v + 1),
      lb: () => setLbV(v => v + 1),
    });
    const fb = setInterval(() => { if (statusRef.current === "down") refreshSms(); }, 20000);
    return () => { clearInterval(fb); disconnectLive(); };
  }, [session]);

  const clearOtp = () => setOtpAlert(null);
  return (
    <Ctx.Provider value={{ status, sms, otpAlert, clearOtp, rangesV, numbersV, lbV, refreshSms }}>
      {children}
    </Ctx.Provider>
  );
}
export default LiveProvider;
