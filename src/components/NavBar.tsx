'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const TABS = [
  { href: '/dashboard', label: 'STATUS' },
  { href: '/quests', label: 'DAILY QUEST' },
  { href: '/workout', label: 'DUNGEONS' },
  { href: '/shadows', label: 'ARMY' },
  { href: '/skills', label: 'SKILLS' },
  { href: '/progress', label: 'PROGRESS' },
  { href: '/achievements', label: 'ACHIEVEMENTS' },
  { href: '/inventory', label: 'INVENTORY' },
];

const RARITY_COLOR: Record<string, string> = {
  common: 'text-[#9ca3af]',
  rare: 'text-accent-cyan',
  epic: 'text-accent-purple',
  legendary: 'text-accent-gold',
};

export function NavBar({
  hunterName,
  rank,
  level,
  title,
}: {
  hunterName: string;
  rank: string;
  level: number;
  title?: { title: string; rarity: string } | null;
}) {
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-bg-base/70 border-b border-accent-cyan/30">
      <div className="max-w-6xl mx-auto px-3 md:px-4 py-2 md:py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
            <div className={`rank-badge rank-${rank} shrink-0`}>{rank}</div>
            <div className="leading-tight min-w-0">
              <div className="font-mono text-[10px] tracking-[0.3em] text-accent-cyan/80">HUNTER</div>
              <div className="font-mono uppercase text-sm tracking-widest glow-text text-accent-cyan truncate">
                {hunterName} <span className="opacity-60">Lv.{level}</span>
              </div>
              {title && (
                <div
                  className={`font-mono text-[9px] tracking-[0.25em] uppercase mt-0.5 truncate ${RARITY_COLOR[title.rarity] || 'text-accent-cyan'}`}
                  title="Active title"
                >
                  « {title.title} »
                </div>
              )}
            </div>
          </Link>
          <button
            onClick={logout}
            className="sys-btn sys-btn-ghost sys-btn-danger text-[10px] md:hidden shrink-0"
            aria-label="Disconnect"
          >
            EXIT
          </button>
        </div>
        <nav className="nav-tabs-scroll hidden md:flex md:flex-wrap gap-1 md:ml-4 md:flex-1 md:px-0">
          {TABS.map((t) => {
            const active = path?.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-3 py-2 md:py-1.5 text-[11px] tracking-[0.2em] font-mono uppercase border rounded-sm transition-all whitespace-nowrap ${
                  active
                    ? 'text-accent-cyan border-accent-cyan/70 bg-accent-cyan/10 shadow-[0_0_12px_rgba(78,203,255,0.35)]'
                    : 'text-[#a9c7e0] border-transparent hover:border-accent-cyan/30 hover:text-accent-cyan'
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <button onClick={logout} className="sys-btn sys-btn-ghost sys-btn-danger text-[10px] hidden md:inline-flex">
          Disconnect
        </button>
      </div>
    </header>
  );
}
