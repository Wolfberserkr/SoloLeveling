import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getStats } from '@/lib/leveling';
import { ensureDailyQuests } from '@/lib/quests';
import { AppShell } from '@/components/AppShell';
import { QuestList } from './QuestList';

export const dynamic = 'force-dynamic';

export default function QuestsPage() {
  const user = getCurrentUser();
  if (!user) redirect('/login');
  const stats = getStats(user.id);
  const quests = ensureDailyQuests(user.id, stats.level);

  return (
    <AppShell hunterName={user.hunter_name} rank={stats.rank} level={stats.level}>
      <QuestList initial={quests} streak={stats.streak} />
    </AppShell>
  );
}
