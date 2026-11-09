import React from 'react';
import { ArrowLeft } from 'lucide-react';
export const Card: React.FC<{ className?: string; children?: React.ReactNode; onClick?: () => void }> = ({ className = '', children, onClick }) => (
  <div onClick={onClick} className={`glass-card ${className}`}>{children}</div>
);
export const PageHead: React.FC<{ title: string; chip?: string | number; sub?: string; onBack?: () => void; right?: React.ReactNode }> = ({ title, chip, sub, onBack, right }) => (
  <div className="flex items-center justify-between gap-2 px-0.5">
    <div className="flex items-center gap-2 min-w-0">
      {onBack && (
        <button type="button" onClick={onBack} className="w-8 h-8 rounded-xl glass-card flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 active:scale-95 transition-all cursor-pointer shrink-0" aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="text-[15px] font-extrabold font-heading tracking-tight text-slate-900 dark:text-white leading-tight flex items-center gap-1.5 truncate">
          {title}
          {chip !== undefined && <span className="text-[10px] px-1.5 py-0.2 rounded-md font-bold font-mono bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shrink-0">{chip}</span>}
        </h1>
        {sub && <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 truncate">{sub}</p>}
      </div>
    </div>
    <div className="flex items-center gap-1.5 shrink-0">{right}</div>
  </div>
);
export const IconBtn: React.FC<{ onClick?: () => void; title?: string; active?: boolean; disabled?: boolean; children?: React.ReactNode }> = ({ onClick, title, active, disabled, children }) => (
  <button type="button" onClick={onClick} title={title} disabled={disabled}
    className={`w-8 h-8 rounded-xl flex items-center justify-center active:scale-95 transition-all cursor-pointer shrink-0 border disabled:opacity-50 ${
      active ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400'
             : 'glass-card border-slate-200/70 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400'}`}>
    {children}
  </button>
);
export const StatStrip: React.FC<{ items: { label: string; value: React.ReactNode; tone?: string }[] }> = ({ items }) => (
  <div className="glass-card px-1 py-2 flex items-stretch">
    {items.map((it, i) => (
      <div key={it.label} className={`flex-1 min-w-0 text-center px-1 ${i ? 'border-l border-slate-100 dark:border-slate-800' : ''}`}>
        <div className={`font-heading font-extrabold text-[15px] leading-none tabular-nums truncate ${it.tone || 'text-slate-900 dark:text-white'}`}>{it.value}</div>
        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-1 truncate">{it.label}</div>
      </div>
    ))}
  </div>
);
export const Empty: React.FC<{ icon: React.ElementType; text: string }> = ({ icon: Icon, text }) => (
  <div className="p-8 text-center glass-card border-dashed">
    <Icon className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600 mb-1.5" />
    <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{text}</p>
  </div>
);
export const Seg: React.FC<{ options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }> = ({ options, value, onChange }) => (
  <div className="flex items-center gap-0.5 p-0.5 rounded-xl glass-card shrink-0">
    {options.map((o) => (
      <button key={o.id} type="button" onClick={() => onChange(o.id)}
        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
          value === o.id ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
        {o.label}
      </button>
    ))}
  </div>
);
export const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string; icon: React.ElementType }> = ({ value, onChange, placeholder, icon: Icon }) => (
  <div className="relative flex-1 min-w-0">
    <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full pl-8 pr-3 py-2 rounded-xl glass-card text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-1 focus:ring-cyan-500/40" />
  </div>
);
