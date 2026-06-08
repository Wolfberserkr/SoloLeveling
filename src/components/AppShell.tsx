import { NavBar } from './NavBar';
import { NoticeStack } from './Notice';
import { TimezoneSync } from './TimezoneSync';

export function AppShell({
  hunterName,
  rank,
  level,
  title,
  currentTz = 'UTC',
  children,
}: {
  hunterName: string;
  rank: string;
  level: number;
  title?: { title: string; rarity: string } | null;
  currentTz?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <NavBar hunterName={hunterName} rank={rank} level={level} title={title} />
      <TimezoneSync currentTz={currentTz} />
      <NoticeStack />
      <main className="max-w-6xl mx-auto px-3 md:px-4 py-4 md:py-8 space-y-4 md:space-y-6">{children}</main>
      <footer className="text-center text-[10px] tracking-widest font-mono text-[#465e7a] py-6 md:py-8 safe-bottom">
        [ THE SYSTEM v1.0 · UNOFFICIAL SOLO LEVELING FAN PROJECT ]
      </footer>
    </div>
  );
}
