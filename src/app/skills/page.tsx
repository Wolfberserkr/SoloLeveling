import { redirect } from 'next/navigation';
import { getCurrentHunter } from '@/lib/auth';
import { getStats } from '@/lib/leveling';
import { AppShell } from '@/components/AppShell';
import { SystemWindow } from '@/components/SystemWindow';
import { SKILLS, listOwned } from '@/lib/skills';
import { titleFor } from '@/lib/achievements';
import { ensureDailyQuests } from '@/lib/quests';
import { SkillTree } from './SkillTree';

export const dynamic = 'force-dynamic';

export default async function SkillsPage() {
  const user = await getCurrentHunter();
  if (!user) redirect('/login');
  const stats = await getStats(user.id);
  const owned = await listOwned(user.id);
  const quests = await ensureDailyQuests(user.id, stats.level);
  const inProgressQuests = quests
    .filter((q) => !q.completed)
    .map((q) => ({ key: q.key, label: q.label }));

  return (
    <AppShell
      hunterName={user.hunter_name}
      rank={stats.rank}
      level={stats.level}
      title={titleFor(user.active_title)}
    >
      <SystemWindow
        title="MONARCH'S SKILLS"
        variant="purple"
        scan
        right={
          <div className="flex gap-4 text-[11px] font-mono tracking-widest">
            <span className="text-accent-gold">
              ✦ {stats.skill_points} SP
            </span>
            <span className="text-accent-purple">
              MANA {stats.mana}/{stats.mana_max}
            </span>
            <span className="text-accent-cyan">RANK {stats.rank}</span>
          </div>
        }
      >
        <p className="text-xs text-[#a9c7e0] font-mono leading-relaxed mb-4">
          The Monarch's path forks at every rank. Earn a skill point per level
          and spend them to learn abilities — most cost mana, a few are passive.
          Hover a card to inspect its prerequisites.
        </p>
        <SkillTree
          catalog={SKILLS}
          owned={owned}
          rank={stats.rank}
          skillPoints={stats.skill_points}
          mana={stats.mana}
          inProgressQuests={inProgressQuests}
        />
      </SystemWindow>
    </AppShell>
  );
}
