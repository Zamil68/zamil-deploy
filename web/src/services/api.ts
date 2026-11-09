const LS_SESSION = "app_session";
export const getSession = () => localStorage.getItem(LS_SESSION) || "";
export const setSession = (s: string) => localStorage.setItem(LS_SESSION, s);
export const clearSession = () => { 
  localStorage.removeItem(LS_SESSION); 
  localStorage.removeItem("app_username"); 
};

const lastByEp: Record<string, number> = {};
async function gate(ep: string){
  const now = Date.now(); 
  const wait = Math.max(0, 250 - (now - (lastByEp[ep] || 0)));
  if (wait) await new Promise(r => setTimeout(r, wait));
  lastByEp[ep] = Date.now();
}

export async function postApi<T = any>(ep: string, body: any = {}, opts: { auth?: boolean } = {}): Promise<T> {
  await gate(ep);
  const session = getSession();
  try {
    const r = await fetch(ep, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        ...(session ? { Authorization: "Bearer " + session } : {}) 
      },
      body: JSON.stringify({ ...body, session })
    });
    
    if (r.status === 401 && opts.auth !== false && session) {
      clearSession();
      window.dispatchEvent(new Event("zamil:logout"));
      return { ok: false, error: "Session expired — sign in again", authFail: true } as any;
    }
    
    const d = await r.json().catch(() => null);
    if (!d) return { ok: false, error: "Unexpected response (HTTP " + r.status + ")" } as any;
    return d as T;
  } catch (e: any) {
    return { ok: false, error: e?.name === "AbortError" ? "Request timed out" : "Cannot reach server" } as any;
  }
}
