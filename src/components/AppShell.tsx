import { NavBar } from './NavBar';
import { NoticeStack } from './Notice';
import { LevelUpCinema } from './LevelUpCinema';
import { BottomNav } from './BottomNav';
import { TimezoneSync } from './TimezoneSync';
import { PushPermission } from './PushPermission';

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
      <LevelUpCinema />
      <NoticeStack />
      <BottomNav />
      <main className="max-w-6xl mx-auto px-3 md:px-4 py-4 md:py-8 pb-24 md:pb-8 space-y-4 md:space-y-6">{children}</main>
      <footer className="flex flex-col items-center gap-3 text-center text-[10px] tracking-widest font-mono text-[#465e7a] py-6 md:py-8 safe-bottom">
        <PushPermission />
        [ THE SYSTEM v1.0 · UNOFFICIAL SOLO LEVELING FAN PROJECT ]
      </footer>
    </div>
  );
}
