import React, { useState, useEffect } from 'react';
import type { NotificationItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { postApi } from '../services/api';
import { PageHead, IconBtn, Card, Empty } from './Ui';
import { Bell, CheckCheck, RefreshCw, Send, Info, Check, AlertTriangle, DollarSign, Siren, Trash2, X, MessageSquarePlus } from 'lucide-react';
interface NotificationsViewProps { notifications: NotificationItem[]; onBack: () => void; onRefresh: () => void | Promise<void>; }
const TYPE_META: Record<string, { icon: any; chip: string; label: string }> = {
  info: { icon: Info, chip: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25', label: 'Normal' },
  success: { icon: Check, chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25', label: 'Success' },
  warn: { icon: AlertTriangle, chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25', label: 'Warning' },
  emergency: { icon: Siren, chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25', label: 'Emergency' },
  money: { icon: DollarSign, chip: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/25', label: 'Money' },
  system_alert: { icon: Siren, chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25', label: 'System' }
};
export const NotificationsView: React.FC<NotificationsViewProps> = ({ notifications, onBack, onRefresh }) => {
  const { role } = useAuth();
  const { showToast } = useToast();
  const [compose, setCompose] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('info');
  const [targetMode, setTargetMode] = useState('all');
  const [targetUser, setTargetUser] = useState('');
  const [sending, setSending] = useState(false);
  const [busyRefresh, setBusyRefresh] = useState(false);
  useEffect(() => { onRefresh(); }, []);
  const unread = notifications.filter((n) => !n.read);
  const refresh = async () => { setBusyRefresh(true); try { await onRefresh(); } finally { setBusyRefresh(false); } };
  const markAll = async () => {
    if (!unread.length) { showToast('Nothing unread', 'info'); return; }
    await postApi('/api/notifs/mark-read', { ids: unread.map((n) => n.id) });
    showToast('✓ All read', 'success');
    onRefresh();
  };
  const dismiss = async (id: any) => {
    await postApi('/api/notifs/mark-read', { ids: [id] });
    onRefresh();
  };
  const del = async (id: any) => {
    const r = await postApi<any>('/api/notifs/delete', { id });
    if (r && r.ok) { showToast('✓ Deleted', 'success'); onRefresh(); } else showToast(r?.error || 'Delete failed', 'error');
  };
  const send = async () => {
    if (!body.trim()) { showToast('Write a message', 'error'); return; }
    const target = targetMode === 'all' ? '*' : targetUser.trim().toLowerCase();
    if (targetMode === 'one' && !target) { showToast('Enter username', 'error'); return; }
    setSending(true);
    const r = await postApi<any>('/api/notifs/send', { target, type, title: title.trim(), body: body.trim() });
    setSending(false);
    if (r && r.ok) { showToast(target === '*' ? '✓ Sent to all users' : `✓ Sent to ${target}`, 'success'); setTitle(''); setBody(''); setCompose(false); onRefresh(); }
    else showToast(r?.error || 'Send failed', 'error');
  };
  return (
    <div className="w-full max-w-full overflow-hidden space-y-2 pb-16">
      <PageHead title="Alerts" chip={unread.length || undefined} onBack={onBack}
        right={<>
          {role === 'super' && (
            <IconBtn active={compose} onClick={() => setCompose(!compose)} title="New announcement">
              <MessageSquarePlus className="w-4 h-4" />
            </IconBtn>
          )}
          <IconBtn onClick={markAll} title="Mark all read"><CheckCheck className="w-4 h-4" /></IconBtn>
          <IconBtn onClick={refresh} disabled={busyRefresh} title="Refresh"><RefreshCw className={`w-3.5 h-3.5 ${busyRefresh ? 'animate-spin text-cyan-500' : ''}`} /></IconBtn>
        </>} />
      {compose && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">New announcement</span>
            <button type="button" onClick={() => setCompose(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="px-2 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-900 dark:text-white outline-none cursor-pointer">
              <option value="info">Normal</option>
              <option value="success">Success</option>
              <option value="warn">Warning</option>
              <option value="emergency">Emergency</option>
              <option value="money">Money</option>
            </select>
            <div className="flex items-center gap-0.5 p-0.5 rounded-xl glass-card">
              <button type="button" onClick={() => setTargetMode('all')} className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${targetMode === 'all' ? 'bg-cyan-600 text-white' : 'text-slate-500'}`}>All users</button>
              <button type="button" onClick={() => setTargetMode('one')} className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${targetMode === 'one' ? 'bg-cyan-600 text-white' : 'text-slate-500'}`}>One user</button>
            </div>
            {targetMode === 'one' && (
              <input type="text" value={targetUser} onChange={(e) => setTargetUser(e.target.value)} placeholder="username"
                className="flex-1 min-w-[100px] px-2 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-900 dark:text-white outline-none" />
            )}
          </div>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)"
            className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-900 dark:text-white outline-none" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message…" rows={2}
            className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-900 dark:text-white outline-none resize-none" />
          <button type="button" onClick={send} disabled={sending}
            className="w-full py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5">
            <Send className="w-3.5 h-3.5" />{sending ? 'Sending…' : targetMode === 'all' ? 'Send to All' : 'Send'}
          </button>
        </Card>
      )}
      <div className="space-y-1.5">
        {notifications.length === 0 ? <Empty icon={Bell} text="No alerts" /> : notifications.map((n) => {
          const meta = TYPE_META[n.type] || TYPE_META.info;
          const Icon = meta.icon;
          return (
            <div key={n.id} className={`px-3 py-2 rounded-xl glass-card border border-slate-200/70 dark:border-slate-800 flex items-start gap-2.5 transition-opacity ${n.read ? 'opacity-60' : ''}`}>
              <span className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${meta.chip}`}><Icon className="w-3.5 h-3.5" /></span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{n.title || meta.label}</span>
                  <span className="font-mono text-[9px] text-slate-400 shrink-0">{new Date(n.at).toLocaleDateString()}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">{n.body}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 dot-live" />}
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${n.read ? 'text-slate-400' : 'text-cyan-600 dark:text-cyan-400'}`}>{n.read ? 'read' : 'new'}</span>
                  {n.by && <span className="text-[9px] text-slate-400">· {n.by}</span>}
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button type="button" onClick={() => dismiss(n.id)} title="Dismiss"
                  className="p-1 rounded-md text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
                {(role === 'super' || role === 'admin') && (
                  <button type="button" onClick={() => del(n.id)} title="Delete for everyone"
                    className="p-1 rounded-md text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default NotificationsView;
