import React from 'react';
import { AlertTriangle, RefreshCw, LogOut, Copy, Check } from 'lucide-react';

interface Props { children: React.ReactNode }
interface State { error: Error | null; copied: boolean }

const APP_KEYS = ['app_session', 'app_username', 'app_client_id', 'app_client_name', 'app_role', 'app_panel_num'];

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, copied: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ui-crash]', error, info?.componentStack || '');
  }

  private reload = () => window.location.reload();

  private signOut = () => {
    APP_KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
    window.location.reload();
  };

  private copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(String(this.state.error?.stack || this.state.error?.message || 'Unknown error'));
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 1600);
    } catch {}
  };

  render() {
    if (!this.state.error) return this.props.children;
    const msg = String(this.state.error.message || 'Unexpected interface error');
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(244,63,94,.12),transparent_70%),var(--bg)]">
        <div className="w-full max-w-sm rounded-3xl glass-card p-5 space-y-4 animate-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-rose-500/12 border border-rose-500/25 text-rose-500 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h1 className="font-heading font-extrabold text-[15px] text-slate-900 dark:text-white leading-tight">Screen stopped</h1>
              <p className="text-[10px] font-semibold text-slate-400">Your data is safe — nothing was lost.</p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <p className="text-[11px] font-mono text-slate-600 dark:text-slate-300 break-words leading-relaxed line-clamp-2">{msg}</p>
          </div>

          <button type="button" onClick={this.reload}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-cyan-600/20 active:scale-[.98] cursor-pointer flex items-center justify-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Reload interface
          </button>

          <div className="flex items-center gap-2">
            <button type="button" onClick={this.copyDetails}
              className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-center gap-1.5">
              {this.state.copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {this.state.copied ? 'Copied' : 'Copy error'}
            </button>
            <button type="button" onClick={this.signOut}
              className="flex-1 py-2 rounded-xl border border-rose-500/30 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer flex items-center justify-center gap-1.5">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
