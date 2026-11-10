import React, { useEffect, useState, useRef } from 'react';
import { useToast } from '../context/ToastContext';
import { Shield, X, Smartphone } from 'lucide-react';
import { getActiveTone, playTone } from '../utils/sounds';

interface FloatingOtpProps {
  message: { number: string; cli: string; message: string; time: string; burst?: number } | null;
  onDismiss: () => void;
}

export const LiveOtpFloatingCard: React.FC<FloatingOtpProps> = ({ message, onDismiss }) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const key = message ? `${message.number}|${message.time}` : '';
  const keyRef = useRef<string>('');
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);

  // Runs ONLY when a NEW message arrives → timer never resets on parent re-renders
  useEffect(() => {
    if (!key) return;
    if (keyRef.current !== key) {
      keyRef.current = key;
      setCopied(false);
      const t = getActiveTone();
      if (t !== 'none') playTone(t);
    }
    const timer = setTimeout(() => dismissRef.current(), 3000); // auto-hide after 3 seconds
    return () => clearTimeout(timer);
  }, [key]);

  if (!message) return null;
  const extractCode = (txt: string) => {
    const match = String(txt || '').match(/\b(\d{4,8})\b/);
    return match ? match[1] : null;
  };
  const code = extractCode(message.message);
  const handleCopy = async () => {
    const target = code || message.number;
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      showToast(`Copied ${target}`, 'success');
      setTimeout(() => dismissRef.current(), 800);
    } catch { showToast('Copy failed', 'error'); }
  };
  return (
    <div onClick={handleCopy}
      className="fixed bottom-24 sm:bottom-20 right-4 sm:right-6 z-50 w-[300px] sm:w-[330px] rounded-3xl glass-card bg-white/95 dark:bg-slate-900/95 border-2 border-cyan-500/50 shadow-2xl p-4 cursor-pointer hover:border-cyan-400 transition-all animate-in slide-in-from-bottom-5 duration-300 overflow-hidden">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-cyan-500 text-white flex items-center justify-center shrink-0"><Shield className="w-3.5 h-3.5" /></div>
          <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 truncate">{message.cli || 'New Inbound OTP'}</span>
          {(message.burst || 0) > 1 && (
            <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-extrabold font-mono shrink-0">+{message.burst}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] text-slate-400">{message.time}</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="py-2.5 space-y-1.5">
        {code && (
          <div className="inline-block px-3 py-1 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white font-mono font-extrabold text-lg tracking-widest shadow-md shadow-cyan-600/30">
            {code}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-slate-600 dark:text-slate-300">
          <Smartphone className="w-3 h-3 text-slate-400" /><span>{message.number}</span>
        </div>
        <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed font-sans">{message.message}</p>
      </div>
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] font-bold text-cyan-600 dark:text-cyan-400 text-right">
        {copied ? '✓ Copied to clipboard!' : 'Tap anywhere to copy code'}
      </div>
      {/* 3-second countdown bar */}
      <div className="absolute left-0 bottom-0 h-0.5 w-full bg-slate-200/40 dark:bg-slate-700/40">
        <div key={key} className="h-full bg-cyan-500/70 otp-timer-bar" />
      </div>
    </div>
  );
};
export default LiveOtpFloatingCard;
// === EOF: LiveOtpFloatingCard.tsx ===
