import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { postApi } from '../services/api';
import BrandLogo from './BrandLogo';
import { Zap, Lock, User, Eye, EyeOff, ArrowRight, Key, ShieldCheck, ArrowLeft, Check } from 'lucide-react';

type Mode = 'login' | 'activate' | 'forgot';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [showResetPass, setShowResetPass] = useState(false);
  const [u, setU] = useState(() => localStorage.getItem('zamil_remember_user') || '');
  const [remember, setRemember] = useState(() => !!localStorage.getItem('zamil_remember_user'));
  const [p, setP] = useState('');
  const [p2, setP2] = useState('');
  const [pin, setPin] = useState('');
  const [pending, setPending] = useState<{ username: string; clientId: string; clientName: string } | null>(null);

  const inp = 'w-full pl-9 pr-10 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/50 transition-all';
  const lbl = 'text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500';
  const btn = 'w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-cyan-600/20 active:scale-[.98] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5';

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!u.trim() || !p) { showToast('Enter user + password', 'error'); return; }
    // Save/clear remember
    if (remember) localStorage.setItem('zamil_remember_user', u.trim());
    else localStorage.removeItem('zamil_remember_user');
    setBusy(true);
    const r = await login(u.trim(), p);
    setBusy(false);
    if (r.ok) showToast('✓ Welcome back', 'success');
    else if ((r as any).firstLogin) {
      setPending({ username: (r as any).username || u.trim(), clientId: (r as any).clientId || '', clientName: (r as any).clientName || u.trim() });
      setMode('activate');
      showToast('New ID — set password', 'info');
    } else showToast(r.error || 'Login failed', 'error');
  };

  const doActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    if (p.length < 6) { showToast('Min 6 characters', 'error'); return; }
    if (p !== p2) { showToast('Passwords differ', 'error'); return; }
    if (pin.length < 4) { showToast('PIN min 4 chars', 'error'); return; }
    setBusy(true);
    const r = await postApi<any>('/api/auth/set-password', { username: pending.username, clientId: pending.clientId, clientName: pending.clientName, password: p, recovery: pin }, { auth: false });
    setBusy(false);
    if (r && r.ok && r.session) {
      localStorage.setItem('app_session', r.session);
      localStorage.setItem('app_username', pending.username);
      localStorage.setItem('app_client_id', r.clientId || pending.clientId || '');
      localStorage.setItem('app_client_name', r.clientName || pending.clientName || '');
      showToast('✓ Activated', 'success');
      window.location.reload();
    } else showToast(r?.error || 'Activate failed', 'error');
  };

  const doForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!u.trim() || !pin || p.length < 6) { showToast('Fill all fields', 'error'); return; }
    setBusy(true);
    const r = await postApi<any>('/api/auth/forgot-password', { username: u.trim(), recovery: pin, newPassword: p }, { auth: false });
    setBusy(false);
    if (r && r.ok) { showToast('✓ Reset — sign in', 'success'); setMode('login'); setP(''); setPin(''); }
    else showToast(r?.error || 'Reset failed', 'error');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(6,182,212,.10),transparent_70%),var(--bg)]">
      <div className="w-full max-w-sm rounded-2xl glass-card p-5 space-y-4 animate-in zoom-in-95 duration-200">
        <div className="text-center space-y-2">
          {/* ── Logo ── */}
          <div className="flex justify-center">
            <BrandLogo className="h-14 w-auto" />
          </div>
          <h1 className="font-heading font-extrabold text-lg tracking-tight text-slate-900 dark:text-white">ZAMIL <span className="text-cyan-500 dark:text-cyan-400">SMS</span></h1>
          <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
            {mode === 'login' ? 'Sign in to your account' : mode === 'activate' ? 'Activate your account' : 'Reset your password'}
          </p>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border border-cyan-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dot-live" /> LaMix linked
          </span>
        </div>

        {mode === 'login' && (
          <form onSubmit={doLogin} className="space-y-3">
            <div className="space-y-1">
              <label className={lbl}>Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input type="text" value={u} onChange={(e) => setU(e.target.value)} placeholder="client username" autoComplete="username" className={inp} />
              </div>
            </div>
            <div className="space-y-1">
              <label className={lbl}>Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input type={showPass ? 'text' : 'password'} value={p} onChange={(e) => setP(e.target.value)} placeholder="••••••••" autoComplete="current-password" className={inp} />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 cursor-pointer transition-colors">
                  {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            {/* ── Remember Me ── */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${remember ? 'bg-cyan-600 border-cyan-600' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'}`} onClick={() => setRemember(!remember)}>
                {remember && <Check className="w-3 h-3 text-white" />}
              </div>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="hidden" />
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Remember username</span>
            </label>
            <button type="submit" disabled={busy} className={btn}>
              {busy ? 'Signing in…' : (<><span>Sign In</span><ArrowRight className="w-3.5 h-3.5" /></>)}
            </button>
            <div className="text-center">
              <button type="button" onClick={() => { setMode('forgot'); setP(''); setPin(''); setShowPass(false); }} className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer">Forgot password?</button>
            </div>
          </form>
        )}

        {mode === 'activate' && pending && (
          <form onSubmit={doActivate} className="space-y-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> Welcome <span className="font-mono">{pending.username}</span>
            </div>
            <div className="space-y-1">
              <label className={lbl}>New password (min 6)</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input type={showNewPass ? 'text' : 'password'} value={p} onChange={(e) => setP(e.target.value)} placeholder="create password" className={inp} />
                <button type="button" onClick={() => setShowNewPass(!showNewPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 cursor-pointer transition-colors">
                  {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className={lbl}>Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input type={showConfirmPass ? 'text' : 'password'} value={p2} onChange={(e) => setP2(e.target.value)} placeholder="repeat password" className={inp} />
                <button type="button" onClick={() => setShowConfirmPass(!showConfirmPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 cursor-pointer transition-colors">
                  {showConfirmPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className={lbl}>Recovery PIN (min 4)</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-500 pointer-events-none" />
                <input type="text" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="write it down!" className={inp} />
              </div>
              <p className="text-[9px] font-bold text-amber-600 dark:text-amber-400">🔒 Only way to reset later. Save it.</p>
            </div>
            <button type="submit" disabled={busy} className={btn}>
              {busy ? 'Activating…' : (<><span>Activate</span><ArrowRight className="w-3.5 h-3.5" /></>)}
            </button>
            <div className="text-center">
              <button type="button" onClick={() => setMode('login')} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back</button>
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={doForgot} className="space-y-3">
            <div className="space-y-1">
              <label className={lbl}>Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input type="text" value={u} onChange={(e) => setU(e.target.value)} placeholder="your username" className={inp} />
              </div>
            </div>
            <div className="space-y-1">
              <label className={lbl}>Recovery PIN</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-500 pointer-events-none" />
                <input type="text" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="your PIN" className={inp} />
              </div>
            </div>
            <div className="space-y-1">
              <label className={lbl}>New password (min 6)</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input type={showResetPass ? 'text' : 'password'} value={p} onChange={(e) => setP(e.target.value)} placeholder="new password" className={inp} />
                <button type="button" onClick={() => setShowResetPass(!showResetPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 cursor-pointer transition-colors">
                  {showResetPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={busy} className={btn}>
              {busy ? 'Resetting…' : 'Reset Password'}
            </button>
            <div className="text-center">
              <button type="button" onClick={() => setMode('login')} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back</button>
            </div>
          </form>
        )}

        <p className="text-center text-[9px] font-semibold text-slate-400 dark:text-slate-600 pt-1 border-t border-slate-100 dark:border-slate-800">Encrypted · end-to-end</p>
      </div>
    </div>
  );
};
export default LoginView;
// === EOF: LoginView.tsx ===