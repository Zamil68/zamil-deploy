import React, { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { postApi } from '../services/api';
import { PageHead, Card } from './Ui';
import { Key, Eye, EyeOff, Check, Lock } from 'lucide-react';
interface Props { onBack: () => void; }
export const ChangePasswordView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useToast();
  const [o, setO] = useState(''); const [n, setN] = useState(''); const [c, setC] = useState('');
  const [so, setSo] = useState(false); const [sn, setSn] = useState(false);
  const [busy, setBusy] = useState(false);
  const okLen = n.length >= 6; const okMatch = !!n && n === c;
  const inp = 'w-full pl-9 pr-9 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-cyan-500/40';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!o || !n || !c) { showToast('Fill all fields', 'error'); return; }
    if (!okLen) { showToast('Min 6 characters', 'error'); return; }
    if (!okMatch) { showToast('Passwords differ', 'error'); return; }
    setBusy(true);
    const r = await postApi<any>('/api/auth/change-password', { oldPassword: o, newPassword: n });
    setBusy(false);
    if (r && r.ok) { showToast('✓ Password updated', 'success'); setTimeout(onBack, 900); }
    else showToast(r?.error || 'Update failed', 'error');
  };
  return (
    <div className="w-full max-w-sm mx-auto overflow-hidden space-y-2 pb-16">
      <PageHead title="Password" sub="Other sessions sign out" onBack={onBack} />
      <Card className="p-4 space-y-3">
        <form onSubmit={submit} className="space-y-2.5">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input type={so ? 'text' : 'password'} value={o} onChange={(e) => setO(e.target.value)} placeholder="Current password" className={inp} />
            <button type="button" onClick={() => setSo(!so)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">{so ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
          </div>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input type={sn ? 'text' : 'password'} value={n} onChange={(e) => setN(e.target.value)} placeholder="New password (min 6)" className={inp} />
            <button type="button" onClick={() => setSn(!sn)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">{sn ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
          </div>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input type="password" value={c} onChange={(e) => setC(e.target.value)} placeholder="Confirm new password" className={inp} />
          </div>
          <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold">
            <span className={`flex items-center gap-1 ${okLen ? 'text-emerald-500' : 'text-slate-400'}`}><Check className="w-3 h-3" /> 6+ chars</span>
            <span className={`flex items-center gap-1 ${okMatch ? 'text-emerald-500' : 'text-slate-400'}`}><Check className="w-3 h-3" /> match</span>
          </div>
          <button type="submit" disabled={busy}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-cyan-600/20 active:scale-[.98] cursor-pointer disabled:opacity-50">
            {busy ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </Card>
    </div>
  );
};
export default ChangePasswordView;
