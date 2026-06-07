import { redirect } from 'next/navigation';
import { getCurrentHunter } from '@/lib/auth';
import { getStats } from '@/lib/leveling';
import { AppShell } from '@/components/AppShell';
import { SystemWindow } from '@/components/SystemWindow';
import { ACHIEVEMENTS, getUnlocked, titleFor } from '@/lib/achievements';
import { TitleEquipButton } from './TitleEquipButton';

export const dynamic = 'force-dynamic';

export default async function AchievementsPage() {
  const user = await getCurrentHunter();
  if (!user) redirect('/login');
  const stats = await getStats(user.id);
  const unlocked = new Map((await getUnlocked(user.id)).map((u) => [u.key, u.unlocked_at]));

  return (
    <AppShell hunterName={user.hunter_name} rank={stats.rank} level={stats.level} title={titleFor(user.active_title)}>
      <SystemWindow title={`ACHIEVEMENTS · ${unlocked.size} / ${ACHIEVEMENTS.length}`} scan>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {ACHIEVEMENTS.map((a) => {
            const got = unlocked.has(a.key);
            return (
              <div
                key={a.key}
                className={`p-3 border rounded-sm transition-all rarity-${a.rarity} ${
                  got ? 'bg-bg-elevated/60' : 'opacity-50 grayscale'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 flex items-center justify-center font-bold border ${got ? '' : 'border-dashed'} rounded-sm`}>
                    {got ? a.icon : '?'}
                  </div>
                  <div>
                    <div className="font-mono text-xs tracking-widest uppercase">{a.title}</div>
                    <div className="text-[10px] font-mono text-[#7aa0c2]">{a.rarity.toUpperCase()}</div>
                  </div>
                </div>
                <p className="text-xs mt-2 text-[#a9c7e0]">{a.description}</p>
                {got && (
                  <>
                    <div className="mt-2 text-[10px] font-mono text-accent-cyan">
                      [ UNLOCKED {new Date(unlocked.get(a.key)!).toLocaleDateString()} ]
                    </div>
                    <TitleEquipButton
                      achievementKey={a.key}
                      isActive={user.active_title === a.key}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </SystemWindow>
    </AppShell>
  );
}
