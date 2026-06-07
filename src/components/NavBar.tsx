'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const TABS = [
  { href: '/dashboard', label: 'STATUS' },
  { href: '/quests', label: 'DAILY QUEST' },
  { href: '/workout', label: 'DUNGEONS' },
  { href: '/shadows', label: 'ARMY' },
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
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className={`rank-badge rank-${rank}`}>{rank}</div>
          <div className="leading-tight">
            <div className="font-mono text-[10px] tracking-[0.3em] text-accent-cyan/80">HUNTER</div>
            <div className="font-mono uppercase text-sm tracking-widest glow-text text-accent-cyan">
              {hunterName} <span className="opacity-60">Lv.{level}</span>
            </div>
            {title && (
              <div
                className={`font-mono text-[9px] tracking-[0.25em] uppercase mt-0.5 ${RARITY_COLOR[title.rarity] || 'text-accent-cyan'}`}
                title="Active title"
              >
                « {title.title} »
              </div>
            )}
          </div>
        </Link>
        <nav className="flex flex-wrap gap-1 md:gap-1 md:ml-4 flex-1">
          {TABS.map((t) => {
            const active = path?.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-3 py-1.5 text-[11px] tracking-[0.2em] font-mono uppercase border rounded-sm transition-all ${
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
        <button onClick={logout} className="sys-btn sys-btn-ghost sys-btn-danger text-[10px]">
          Disconnect
        </button>
      </div>
    </header>
  );
}
