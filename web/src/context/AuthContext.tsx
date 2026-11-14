import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { UserRole } from '../types';
import { postApi } from '../services/api';

interface AuthContextType {
  session: string | null;
  username: string;
  clientId: string;
  clientName: string;
  panelNum: number;
  role: UserRole;
  theme: 'light' | 'dark';
  isLoggedIn: boolean;
  login: (u: string, p: string) => Promise<{ ok: boolean; error?: string; firstLogin?: boolean; username?: string; clientId?: string; clientName?: string }>;
  logout: () => void;
  toggleTheme: () => void;
  refreshRole: () => Promise<void>;
  adoptSession: (s: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const KEYS = ['app_session', 'app_username', 'app_client_id', 'app_client_name', 'app_role', 'app_panel_num'];
const wipe = () => KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch {} });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<string | null>(() => localStorage.getItem('app_session'));
  const [username, setUsername] = useState<string>(() => localStorage.getItem('app_username') || '');
  const [clientId, setClientId] = useState<string>(() => localStorage.getItem('app_client_id') || '');
  const [clientName, setClientName] = useState<string>(() => localStorage.getItem('app_client_name') || '');
  const [panelNum, setPanelNum] = useState<number>(() => parseInt(localStorage.getItem('app_panel_num') || '1', 10) || 1);
  const [role, setRole] = useState<UserRole>(() => (localStorage.getItem('app_role') as UserRole) || 'none');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('app_theme') as 'light' | 'dark') || 'light');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
    try { localStorage.setItem('app_theme', theme); } catch {}
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((p) => (p === 'dark' ? 'light' : 'dark')), []);

  const refreshRole = useCallback(async () => {
    const res = await postApi<{ ok: boolean; role?: UserRole }>('/api/auth/role');
    if (res && res.ok && res.role) {
      setRole(res.role);
      try { localStorage.setItem('app_role', res.role); } catch {}
    }
  }, []);

  useEffect(() => { if (session) refreshRole(); }, [session, refreshRole]);

  // forced logout from api.ts (401)
  useEffect(() => {
    const onLogout = () => {
      wipe();
      setSession(null); setUsername(''); setClientId(''); setClientName('');
      setRole('none'); setPanelNum(1);
    };
    window.addEventListener('zamil:logout', onLogout);
    return () => window.removeEventListener('zamil:logout', onLogout);
  }, []);

  // adopt a re-issued token (password change) without a full page reload
  const adoptSession = useCallback((s: string) => {
    if (!s) return;
    try { localStorage.setItem('app_session', s); } catch {}
    setSession(s);
  }, []);

  const login = useCallback(async (u: string, p: string) => {
    const res = await postApi<any>('/api/login', { username: u, password: p }, { auth: false });
    if (!res) return { ok: false, error: 'No response from server' };

    if (res.firstLogin && !res.session) {
      return { ok: false, firstLogin: true, username: res.username || u, clientId: res.clientId || '', clientName: res.clientName || u };
    }

    if (res.ok && res.session) {
      const sess = res.session;
      const uname = res.username || u;
      const cId = String(res.clientId || '');
      const cName = res.clientName || uname;
      const pNum = res.panelNum || 1;

      setSession(sess); setUsername(uname); setClientId(cId); setClientName(cName); setPanelNum(pNum);
      // never inherit the previous account's role while the new one loads
      setRole('none');
      try {
        localStorage.setItem('app_session', sess);
        localStorage.setItem('app_username', uname);
        localStorage.setItem('app_client_id', cId);
        localStorage.setItem('app_client_name', cName);
        localStorage.setItem('app_panel_num', String(pNum));
        localStorage.removeItem('app_role');
      } catch {}

      const roleRes = await postApi<any>('/api/auth/role', { session: sess });
      if (roleRes?.ok && roleRes.role) {
        setRole(roleRes.role);
        try { localStorage.setItem('app_role', roleRes.role); } catch {}
      } else {
        // one retry — a single failed call used to leave an admin stuck as Operator until reload
        setTimeout(() => { refreshRole(); }, 2500);
      }
      return { ok: true };
    }
    return { ok: false, error: res?.error || 'Invalid credentials' };
  }, [refreshRole]);

  const logout = useCallback(() => {
    wipe();
    setSession(null); setUsername(''); setClientId(''); setClientName('');
    setRole('none'); setPanelNum(1);
  }, []);

  return (
    <AuthContext.Provider value={{ session, username, clientId, clientName, panelNum, role, theme, isLoggedIn: !!session, login, logout, toggleTheme, refreshRole, adoptSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
