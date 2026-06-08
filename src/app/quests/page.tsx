import { redirect } from 'next/navigation';
import { getCurrentHunter } from '@/lib/auth';
import { getStats } from '@/lib/leveling';
import { ensureDailyQuests } from '@/lib/quests';
import { AppShell } from '@/components/AppShell';
import { QuestList } from './QuestList';
import { titleFor } from '@/lib/achievements';

export const dynamic = 'force-dynamic';

export default async function QuestsPage() {
  const user = await getCurrentHunter();
  if (!user) redirect('/login');
  const stats = await getStats(user.id);
  const quests = await ensureDailyQuests(user.id, stats.level);

  return (
    <AppShell hunterName={user.hunter_name} rank={stats.rank} level={stats.level} title={titleFor(user.active_title)} currentTz={user.timezone}>
      <QuestList initial={quests} streak={stats.streak} />
    </AppShell>
  );
}
