import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { connectLive, disconnectLive } from "../services/sse";
import { postApi } from "../services/api";
import { useAuth } from "./AuthContext";
import type { SmsMessage } from "../types";

interface LiveCtx {
  status: "live" | "down";
  sms: { count: number; recent: SmsMessage[] };
  rangesV: number; numbersV: number; lbV: number; crushV: number; notifV: number;
  refreshSms: () => Promise<void>;
}

const Ctx = createContext<LiveCtx>(null as any);
export const useLive = () => useContext(Ctx);

const EMPTY = { count: 0, recent: [] as SmsMessage[] };

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [status, setStatus] = useState<"live" | "down">("down");
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  const [sms, setSms] = useState(EMPTY);
  const [rangesV, setRangesV] = useState(0);
  const [numbersV, setNumbersV] = useState(0);
  const [lbV, setLbV] = useState(0);
  const [crushV, setCrushV] = useState(0);
  const [notifV, setNotifV] = useState(0);

  // epoch + session guard: a response from the previous account can never land
  const epochRef = useRef(0);
  const sessionRef = useRef<string | null>(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const refreshSms = useCallback(async () => {
    const epoch = epochRef.current;
    const d = await postApi<any>("/api/smscount");
    if (epoch !== epochRef.current || !sessionRef.current) return;
    if (d?.ok) setSms({ count: d.count || 0, recent: Array.isArray(d.recent) ? d.recent : [] });
  }, []);

  useEffect(() => {
    epochRef.current++;
    setSms(EMPTY);
    setStatus("down");
    if (!session) { disconnectLive(); return; }

    refreshSms();
    connectLive({
      status: setStatus,
      sms: (d) => {
        if (!d?.ok) return;
        setSms({ count: d.count || 0, recent: Array.isArray(d.recent) ? d.recent : [] });
      },
      numbers: () => setNumbersV(v => v + 1),
      ranges: () => setRangesV(v => v + 1),
      lb: () => setLbV(v => v + 1),
      crush: () => { setCrushV(v => v + 1); setRangesV(v => v + 1); setNumbersV(v => v + 1); },
      notif: () => setNotifV(v => v + 1),
    });

    // fallback poll only when the stream is down, and never in a hidden tab
    const fb = setInterval(() => {
      if (document.hidden) return;
      if (statusRef.current === "down") refreshSms();
    }, 20000);

    return () => { clearInterval(fb); disconnectLive(); };
  }, [session, refreshSms]);

  return (
    <Ctx.Provider value={{ status, sms, rangesV, numbersV, lbV, crushV, notifV, refreshSms }}>
      {children}
    </Ctx.Provider>
  );
}

export default LiveProvider;
