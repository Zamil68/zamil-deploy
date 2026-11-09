import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, Sparkles, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'live';

interface ToastItem {
  id: string;
  message: string;
  title?: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, title?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastToastRef = useRef<{ msg: string; time: number }>({ msg: '', time: 0 });

  const showToast = useCallback((message: string, type: ToastType = 'info', title?: string) => {
    const msgStr = String(message || '').trim();
    if (!msgStr) return;

    const lower = msgStr.toLowerCase();
    if (lower.includes('live list empty') || lower.includes('showing cached') || lower.includes('background refresh')) return;

    const now = Date.now();
    if (msgStr === lastToastRef.current.msg && (now - lastToastRef.current.time) < 3500) return;
    lastToastRef.current = { msg: msgStr, time: now };

    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastItem = { id, message: msgStr, title, type };
    setToasts((prev) => [...prev.slice(-1), newToast]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none max-w-[92vw] w-max">
        {toasts.map((toast) => {
          let icon = <Info className="w-4 h-4 text-cyan-400 shrink-0" />;
          let borderGlow = 'border-cyan-500/30 shadow-[0_10px_30px_rgba(6,182,212,0.2)]';
          if (toast.type === 'success') {
            icon = <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
            borderGlow = 'border-emerald-500/30 shadow-[0_10px_30px_rgba(16,185,129,0.2)]';
          } else if (toast.type === 'error') {
            icon = <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />;
            borderGlow = 'border-rose-500/30 shadow-[0_10px_30px_rgba(244,63,94,0.2)]';
          } else if (toast.type === 'live') {
            icon = <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />;
            borderGlow = 'border-amber-500/30 shadow-[0_10px_30px_rgba(245,158,11,0.2)]';
          }
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center gap-3 px-5 py-2.5 rounded-full backdrop-blur-xl bg-slate-900/90 text-white border text-xs sm:text-sm font-medium transition-all animate-in fade-in slide-in-from-bottom-3 duration-200 ${borderGlow}`}
            >
              {icon}
              <div className="flex flex-col min-w-0">
                {toast.title && <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">{toast.title}</span>}
                <span className="truncate max-w-[280px] sm:max-w-md">{toast.message}</span>
              </div>
              <button type="button" onClick={() => removeToast(toast.id)} className="text-slate-400 hover:text-white p-0.5 rounded-full transition-colors ml-1" aria-label="Dismiss">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};
