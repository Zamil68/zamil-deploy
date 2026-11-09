import React from 'react';
import { Radio, Inbox, Ship, Trophy, FileSpreadsheet } from 'lucide-react';
export type ActiveTab = 'ranges' | 'numbers' | 'inbox' | 'add' | 'top10' | 'dor';
interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  smsCountToday: number;
  hasDorAccess: boolean;
}
export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange, smsCountToday, hasDorAccess }) => {
  const navItems: { id: ActiveTab; label: string; icon: any; badge: number | string | null }[] = [
    { id: 'ranges', label: 'Ranges', icon: Radio, badge: null },
    { id: 'inbox', label: 'Live OTP', icon: Inbox, badge: smsCountToday > 0 ? (smsCountToday > 999 ? '999+' : smsCountToday) : null },
    { id: 'add', label: 'Ship', icon: Ship, badge: null },
    { id: 'top10', label: 'Top 10', icon: Trophy, badge: null },
    ...(hasDorAccess ? [{ id: 'dor' as ActiveTab, label: 'DOR', icon: FileSpreadsheet, badge: null }] : [])
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 glass-panel border-t border-slate-200/70 dark:border-slate-800/70">
      <div className="max-w-md mx-auto px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id || (item.id === 'ranges' && activeTab === 'numbers');
            return (
              <button key={item.id} type="button" onClick={() => onTabChange(item.id)}
                className="relative flex flex-col items-center justify-center gap-1 flex-1 cursor-pointer">
                <span className={`relative w-11 h-8 rounded-xl flex items-center justify-center transition-all duration-150 ${
                  isActive ? 'bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-md shadow-cyan-600/30' : 'text-slate-400 dark:text-slate-500'}`}>
                  <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.9]'}`} />
                  {item.badge !== null && (
                    <span className="absolute -top-0.5 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center border border-white dark:border-slate-900 font-mono shadow-sm">{item.badge}</span>
                  )}
                </span>
                <span className={`text-[9px] leading-none tracking-tight ${isActive ? 'text-cyan-600 dark:text-cyan-400 font-extrabold' : 'text-slate-400 dark:text-slate-500 font-semibold'}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
