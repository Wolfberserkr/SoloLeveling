import { redirect } from 'next/navigation';
import { getCurrentHunter } from '@/lib/auth';
import { getStats, processDailyEvents } from '@/lib/leveling';
import { AppShell } from '@/components/AppShell';
import { StatusPanel } from '@/components/StatusPanel';
import { SystemWindow } from '@/components/SystemWindow';
import { ensureDailyQuests } from '@/lib/quests';
import { getUnlocked, titleFor } from '@/lib/achievements';
import { inventory } from '@/lib/powerups';
import { listArmy, totalArmyPower } from '@/lib/shadows';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const user = await getCurrentHunter();
  if (!user) redirect('/login');
  await processDailyEvents(user.id);
  const stats = await getStats(user.id);
  const quests = await ensureDailyQuests(user.id, stats.level);
  const cleared = quests.every((q) => q.completed);
  const completedCount = quests.filter((q) => q.completed).length;
  const ach = await getUnlocked(user.id);
  const inv = await inventory(user.id);
  const army = await listArmy(user.id);
  const armyPower = totalArmyPower(army);

  return (
    <AppShell hunterName={user.hunter_name} rank={stats.rank} level={stats.level} title={titleFor(user.active_title)}>
      <StatusPanel
        hunterName={user.hunter_name}
        stats={stats}
        armyPower={armyPower}
        armyCount={army.length}
      />

      <div className="grid md:grid-cols-2 gap-6">
        <SystemWindow
          title="DAILY QUEST"
          variant={cleared ? 'gold' : 'red'}
          right={<Link href="/quests" className="sys-btn !py-1 !text-[10px]">OPEN</Link>}
        >
          <p className="text-xs text-[#a9c7e0] mb-2 font-mono">
            [ {cleared ? 'CLEARED' : `${completedCount} / ${quests.length} CLEARED`} ]
          </p>
          <ul className="space-y-1.5">
            {quests.map((q) => {
              const pct = Math.min(100, (q.progress / q.target) * 100);
              return (
                <li key={q.id} className="text-sm">
                  <div className="flex justify-between font-mono">
                    <span className={q.completed ? 'text-accent-green' : ''}>
                      {q.completed ? '✓' : '○'} {q.label}
                    </span>
                    <span className="text-[#a9c7e0]">
                      {q.progress}/{q.target} {q.unit}
                    </span>
                  </div>
                  <div className="h-1 bg-bg-base mt-0.5 border border-accent-cyan/15">
                    <div
                      className="h-full bg-gradient-to-r from-accent-cyan to-accent-purple"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </SystemWindow>

        <SystemWindow
          title="DUNGEONS"
          variant="purple"
          right={<Link href="/workout" className="sys-btn !py-1 !text-[10px]">ENTER</Link>}
        >
          <p className="text-xs text-[#a9c7e0] mb-2 font-mono">
            [ 4-DAY UPPER/LOWER · BEGINNER GATE ]
          </p>
          <p className="text-sm text-[#cfe6fb]">
            Heavy compounds, linear progression. Sessions run 45–60 minutes including warmup and
            cooldown. Deload week every 5 weeks.
          </p>
          <ul className="text-xs mt-3 grid grid-cols-2 gap-2 font-mono text-[#a9c7e0]">
            <li>Mon — Upper A</li>
            <li>Tue — Lower A</li>
            <li>Thu — Upper B</li>
            <li>Fri — Lower B</li>
          </ul>
        </SystemWindow>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <SystemWindow
          title="RECENT ACHIEVEMENTS"
          right={<Link href="/achievements" className="sys-btn !py-1 !text-[10px]">ALL</Link>}
        >
          {ach.length === 0 ? (
            <p className="text-xs text-[#a9c7e0]">No achievements yet. Clear your first quest to begin.</p>
          ) : (
            <ul className="text-sm space-y-1 font-mono">
              {ach.slice(-5).reverse().map((a) => (
                <li key={a.key} className="text-accent-cyan">✦ {a.key}</li>
              ))}
            </ul>
          )}
        </SystemWindow>

        <SystemWindow
          title="INVENTORY"
          variant="gold"
          right={<Link href="/inventory" className="sys-btn !py-1 !text-[10px]">OPEN</Link>}
        >
          {inv.length === 0 ? (
            <p className="text-xs text-[#a9c7e0]">Empty. Clear daily quests to earn items.</p>
          ) : (
            <ul className="text-sm space-y-1 font-mono">
              {inv.map((i) => (
                <li key={i.def.key} className="flex justify-between">
                  <span><span className="text-accent-gold">{i.def.icon}</span> {i.def.name}</span>
                  <span className="text-accent-gold">×{i.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </SystemWindow>
      </div>
    </AppShell>
  );
}
