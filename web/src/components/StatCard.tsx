import React from 'react';
interface StatCardProps { icon: React.ElementType; chip: string; tone: string; label: string; value: string | number; sub?: string }
export const StatCard: React.FC<StatCardProps> = ({ icon: Icon, chip, tone, label, value, sub }) => (
<div className="p-2.5 rounded-xl glass-card border border-slate-200/70 dark:border-slate-800 flex items-center gap-2.5 min-w-0">
<span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${chip}`}><Icon className="w-4 h-4" /></span>
<div className="min-w-0">
<div className={`font-heading font-extrabold text-lg leading-none tabular-nums truncate ${tone}`}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
<div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 truncate mt-0.5">{label}</div>
{sub && <div className="text-[9px] text-slate-400 truncate">{sub}</div>}
</div>
</div>
);
export default StatCard;
