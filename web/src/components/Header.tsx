import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { postApi } from '../services/api';
import BrandLogo from './BrandLogo';
import { Bell, Sun, Moon, ChevronDown, LogOut, Key, Radio, Server, Volume2 } from 'lucide-react';
import { TONES, playTone, getSavedTone, saveTone, type ToneId } from '../utils/sounds';
interface HeaderProps {
  onOpenNotifications: () => void;
  onOpenAdmin: (tab?: string) => void;
  onOpenChangePassword: () => void;
  unreadNotifsCount: number;
}
export const Header: React.FC<HeaderProps> = ({ onOpenNotifications, onOpenAdmin, onOpenChangePassword, unreadNotifsCount }) => {
  const { username, role, theme, toggleTheme, logout } = useAuth();
  const [open, setOpen] = useState(false);
const [tone, setTone] = useState<ToneId>(() => getSavedTone());
  const [cliAllowed, setCliAllowed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => { postApi<any>('/api/cli/gate').then((d) => setCliAllowed(!!d?.insights)); }, []);
  const roleLabel = role === 'super' ? 'Super Admin' : role === 'admin' ? 'Admin' : role === 'moderator' ? 'Moderator' : 'Operator';
const roleChip = role === 'super' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25' : role === 'admin' ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/25' : role === 'moderator' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/25';
const adminish = role === 'super' || role === 'admin' || role === 'moderator';
  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-200/60 dark:border-slate-800/60">
      <div className="max-w-3xl mx-auto px-3 h-12 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BrandLogo className="h-6" />
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider border ${roleChip} truncate`}>{roleLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={toggleTheme} className="w-7 h-7 rounded-full glass-card border border-slate-200/70 dark:border-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:scale-95 transition-all cursor-pointer" aria-label="Theme">
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={onOpenNotifications} className="relative w-7 h-7 rounded-full glass-card border border-slate-200/70 dark:border-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:scale-95 transition-all cursor-pointer" aria-label="Alerts">
            <Bell className="w-3.5 h-3.5" />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center border-2 border-white dark:border-slate-900 font-mono">
                {unreadNotifsCount > 9 ? '9+' : unreadNotifsCount}
              </span>
            )}
          </button>
          <div className="relative" ref={ref}>
            <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 p-0.5 pr-1.5 rounded-full glass-card border border-slate-200/70 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all cursor-pointer">
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white font-bold text-[9px] flex items-center justify-center uppercase shrink-0">
                {username.substring(0, 2)}
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {open && (
<div className="absolute right-0 mt-2 w-52 rounded-2xl glass-card p-1.5 shadow-2xl z-50">
  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{username}</div>
    <div className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">{roleLabel}</div>
  </div>
  {adminish && (
    <button onClick={() => { onOpenAdmin('scc'); setOpen(false); }} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer">
      <Server className="w-3.5 h-3.5 text-cyan-500" /><span>Admin Hub</span>
    </button>
  )}
  {(adminish || cliAllowed) && (
    <button onClick={() => { onOpenAdmin('cli'); setOpen(false); }} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer">
      <Radio className="w-3.5 h-3.5 text-indigo-500" /><span>CLI Insights</span>
    </button>
  )}
  <button onClick={() => { onOpenChangePassword(); setOpen(false); }} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer">
    <Key className="w-3.5 h-3.5 text-slate-400" /><span>Password</span>
  </button>
  
  {/* ── Tone Picker ── */}
  <div className="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800">
    <div className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
      <Volume2 className="w-3 h-3" /> OTP Tone
    </div>
    {TONES.map((t) => (
      <button key={t.id} type="button"
        onClick={() => { setTone(t.id); saveTone(t.id); if (t.id !== 'none') playTone(t.id); }}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
          tone === t.id ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}>
        <span className="text-sm">{t.emoji}</span>
        <span className="flex-1 text-left">{t.label}</span>
        {tone === t.id && <span className="text-[9px] text-cyan-500 font-black">✓</span>}
      </button>
    ))}
  </div>

  <div className="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800">
    <button onClick={() => { logout(); setOpen(false); }} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer">
      <LogOut className="w-3.5 h-3.5" /><span>Sign Out</span>
    </button>
  </div>
</div>
)}
          </div>
        </div>
      </div>
    </header>
  );
};
export default Header;