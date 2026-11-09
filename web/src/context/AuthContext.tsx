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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const refreshRole = useCallback(async () => {
    try {
      const res = await postApi<{ ok: boolean; role?: UserRole }>('/api/auth/role');
      if (res && res.ok && res.role) {
        setRole(res.role);
        localStorage.setItem('app_role', res.role);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (session) refreshRole();
  }, [session, refreshRole]);

  // Listen for forced logout from api.ts (401 responses)
  useEffect(() => {
    const onLogout = () => {
      setSession(null);
      setUsername('');
      setClientId('');
      setClientName('');
      setRole('none');
    };
    window.addEventListener('zamil:logout', onLogout);
    return () => window.removeEventListener('zamil:logout', onLogout);
  }, []);

  const login = useCallback(async (u: string, p: string) => {
    try {
      const res = await postApi<any>('/api/login', { username: u, password: p }, { auth: false });
      if (!res) return { ok: false, error: 'No response from server' };

      // ── FIRST LOGIN: user exists but has no password → show activation screen ──
      if (res.firstLogin && !res.session) {
        return {
          ok: false,
          firstLogin: true,
          username: res.username || u,
          clientId: res.clientId || '',
          clientName: res.clientName || u
        };
      }

      // ── NORMAL LOGIN: valid session returned ──
      if (res.ok && res.session) {
        const sess = res.session;
        const uname = res.username || u;
        const cId = String(res.clientId || '');
        const cName = res.clientName || uname;
        const pNum = res.panelNum || 1;

        setSession(sess);
        setUsername(uname);
        setClientId(cId);
        setClientName(cName);
        setPanelNum(pNum);

        localStorage.setItem('app_session', sess);
        localStorage.setItem('app_username', uname);
        localStorage.setItem('app_client_id', cId);
        localStorage.setItem('app_client_name', cName);
        localStorage.setItem('app_panel_num', String(pNum));

        // Fetch real role after login
        try {
          const roleRes = await postApi<any>('/api/auth/role', { session: sess });
          if (roleRes?.ok && roleRes.role) {
            setRole(roleRes.role);
            localStorage.setItem('app_role', roleRes.role);
          }
        } catch {}

        return { ok: true };
      }

      return { ok: false, error: res?.error || 'Invalid credentials' };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Login failed' };
    }
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    setUsername('');
    setClientId('');
    setClientName('');
    setRole('none');
    localStorage.removeItem('app_session');
    localStorage.removeItem('app_username');
    localStorage.removeItem('app_client_id');
    localStorage.removeItem('app_client_name');
    localStorage.removeItem('app_role');
    localStorage.removeItem('app_panel_num');
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, username, clientId, clientName, panelNum, role, theme, isLoggedIn: !!session, login, logout, toggleTheme, refreshRole }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
