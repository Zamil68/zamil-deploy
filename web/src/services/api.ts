const LS_SESSION = "app_session";
const APP_KEYS = ["app_session", "app_username", "app_client_id", "app_client_name", "app_role", "app_panel_num"];
const TIMEOUT_MS = 25000;
const GAP_MS = 250;

export const getSession = () => localStorage.getItem(LS_SESSION) || "";
export const setSession = (s: string) => localStorage.setItem(LS_SESSION, s);
export const clearSession = () => { APP_KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch {} }); };

const lastByEp: Record<string, number> = {};
const chain: Record<string, Promise<void>> = {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// serialized per-endpoint pacer (concurrent calls can no longer fire together)
function gate(ep: string): Promise<void> {
  const prev = chain[ep] || Promise.resolve();
  const next = prev.then(async () => {
    const wait = Math.max(0, GAP_MS - (Date.now() - (lastByEp[ep] || 0)));
    if (wait) await sleep(wait);
    lastByEp[ep] = Date.now();
  });
  chain[ep] = next.catch(() => {});
  return next;
}

export async function postApi<T = any>(ep: string, body: any = {}, opts: { auth?: boolean } = {}): Promise<T> {
  await gate(ep);
  const session = getSession();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(ep, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session ? { Authorization: "Bearer " + session } : {}) },
      body: JSON.stringify({ ...body, session }),
      signal: ctl.signal
    });
    if (r.status === 401 && opts.auth !== false && session) {
      clearSession();
      window.dispatchEvent(new Event("zamil:logout"));
      return { ok: false, error: "Session expired — sign in again", authFail: true } as any;
    }
    const d = await r.json().catch(() => null);
    if (!d) {
      return { ok: false, error: r.status === 429 ? "Too many attempts — wait a moment" : "Unexpected response (HTTP " + r.status + ")" } as any;
    }
    return d as T;
  } catch (e: any) {
    return { ok: false, error: e?.name === "AbortError" ? "Request timed out — retry" : "Cannot reach server" } as any;
  } finally {
    clearTimeout(timer);
  }
}
