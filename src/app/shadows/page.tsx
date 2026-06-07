import { redirect } from 'next/navigation';
import { getCurrentHunter } from '@/lib/auth';
import { getStats } from '@/lib/leveling';
import { AppShell } from '@/components/AppShell';
import { SystemWindow } from '@/components/SystemWindow';
import { listArmy, totalArmyPower, rarityColor, type Rarity } from '@/lib/shadows';
import { titleFor } from '@/lib/achievements';

export const dynamic = 'force-dynamic';

const RARITY_GLOW: Record<Rarity, string> = {
  common: '',
  rare: 'shadow-[0_0_18px_rgba(78,203,255,0.4)]',
  epic: 'shadow-[0_0_22px_rgba(168,85,247,0.5)]',
  legendary: 'shadow-[0_0_28px_rgba(255,209,102,0.6)]',
};

export default async function ShadowsPage() {
  const user = await getCurrentHunter();
  if (!user) redirect('/login');
  const stats = await getStats(user.id);
  const army = await listArmy(user.id);
  const power = totalArmyPower(army);

  // Bucket counts by rarity for the summary line.
  const byRarity: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const s of army) byRarity[s.rarity as Rarity] += 1;

  return (
    <AppShell hunterName={user.hunter_name} rank={stats.rank} level={stats.level} title={titleFor(user.active_title)}>
      <SystemWindow title="SHADOW ARMY" variant="purple" scan>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <div className="text-[10px] font-mono tracking-widest text-accent-cyan/70">ARMY POWER</div>
            <div className="text-3xl text-accent-gold glow-text">{power.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-widest text-accent-cyan/70">COUNT</div>
            <div className="text-3xl text-accent-cyan glow-text">{army.length}</div>
          </div>
          {(['legendary', 'epic'] as Rarity[]).map((r) => (
            <div key={r}>
              <div
                className="text-[10px] font-mono tracking-widest"
                style={{ color: rarityColor(r) }}
              >
                {r.toUpperCase()}
              </div>
              <div className="text-2xl font-mono" style={{ color: rarityColor(r) }}>
                {byRarity[r]}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#a9c7e0] font-mono">
          [ Shadows are extracted by clearing dungeons. PRs and deload weeks
          dramatically increase rarity. ]
        </p>
      </SystemWindow>

      <SystemWindow title="RECRUITED">
        {army.length === 0 ? (
          <p className="text-sm text-[#a9c7e0] font-mono">
            [ EMPTY · CLEAR A DUNGEON TO EXTRACT YOUR FIRST SHADOW ]
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {army.map((s) => {
              const color = rarityColor(s.rarity as Rarity);
              return (
                <div
                  key={s.id}
                  className={`p-3 border rounded-sm bg-bg-elevated/60 ${RARITY_GLOW[s.rarity as Rarity]}`}
                  style={{ borderColor: color }}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className="w-9 h-9 flex items-center justify-center font-bold font-mono text-lg"
                      style={{ color, textShadow: `0 0 8px ${color}` }}
                    >
                      ☽
                    </div>
                    <div className="text-[10px] font-mono tracking-widest" style={{ color }}>
                      {s.rarity.toUpperCase()}
                    </div>
                  </div>
                  <div
                    className="font-mono mt-1 tracking-wider uppercase glow-text"
                    style={{ color }}
                  >
                    {s.name}
                  </div>
                  <div className="text-[11px] font-mono text-[#a9c7e0] mt-1">
                    Power <span className="text-accent-gold">+{s.power}</span>
                  </div>
                  <div className="text-[9px] font-mono text-[#5d7a96] mt-1">
                    {new Date(s.extracted_at).toLocaleDateString()} · {s.source_session || 'unknown'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SystemWindow>
    </AppShell>
  );
}
