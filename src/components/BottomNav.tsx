'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const PRIMARY = [
  { href: '/dashboard', label: 'STATUS',  icon: '◈' },
  { href: '/quests',    label: 'QUEST',   icon: '◉' },
  { href: '/workout',   label: 'DUNGEON', icon: '⚔' },
  { href: '/progress',  label: 'PROGRESS',icon: '▲' },
];

const MORE = [
  { href: '/shadows',      label: 'ARMY',        icon: '☽' },
  { href: '/skills',       label: 'SKILLS',      icon: '✦' },
  { href: '/achievements', label: 'ACHIEVEMENTS',icon: '★' },
  { href: '/inventory',    label: 'INVENTORY',   icon: '◆' },
];

export function BottomNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const moreActive = MORE.some((t) => path?.startsWith(t.href));

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-[calc(4rem+env(safe-area-inset-bottom))] left-3 right-3 sys-window sys-window-cyan p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sys-title text-[10px] mb-3 tracking-[0.3em]">[ NAVIGATION ]</div>
            <div className="grid grid-cols-2 gap-2">
              {MORE.map((t) => {
                const active = path?.startsWith(t.href);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2 px-3 py-3 font-mono text-[11px] tracking-[0.15em] border rounded-sm transition-all ${
                      active
                        ? 'border-accent-cyan/70 text-accent-cyan bg-accent-cyan/10'
                        : 'border-accent-cyan/20 text-[#a9c7e0]'
                    }`}
                  >
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
        style={{
          background: 'rgba(5,6,13,0.96)',
          borderTop: '1px solid rgba(78,203,255,0.2)',
          backdropFilter: 'blur(12px)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex">
          {PRIMARY.map((t) => {
            const active = path?.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 font-mono text-[9px] tracking-[0.12em] transition-all ${
                  active ? 'text-accent-cyan' : 'text-[#465e7a]'
                }`}
                style={active ? { textShadow: '0 0 10px rgba(78,203,255,0.8)' } : undefined}
              >
                <span className="text-[1.1rem] leading-none">{t.icon}</span>
                <span>{t.label}</span>
              </Link>
            );
          })}

          <button
            onClick={() => setOpen((o) => !o)}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 font-mono text-[9px] tracking-[0.12em] transition-all ${
              moreActive || open ? 'text-accent-cyan' : 'text-[#465e7a]'
            }`}
            style={(moreActive || open) ? { textShadow: '0 0 10px rgba(78,203,255,0.8)' } : undefined}
          >
            <span className="text-[1.1rem] leading-none">···</span>
            <span>MORE</span>
          </button>
        </div>
      </nav>
    </>
  );
}
