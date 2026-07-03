import { motion } from 'framer-motion';
import { usePlayerStore } from '@/stores/playerStore';
import { SystemWindow } from '@/components/system/SystemWindow';
import { StatBar } from '@/components/system/StatBar';
import { RankBadge } from '@/components/system/RankBadge';
import { ManaOrb } from '@/components/system/ManaOrb';
import { GlitchText } from '@/components/system/GlitchText';
import { TickingNumber } from '@/components/system/TickingNumber';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatDistance } from '@/lib/units';
import { ClassPanel } from './ClassPanel';
import { InventoryPanel } from './InventoryPanel';
import { SystemAssessmentPanel } from './SystemAssessmentPanel';
import { levelProgress } from '@game/xpCurve.ts';
import { STAT_GROUPS, STAT_LABELS, RANK_TITLES, type Rank } from '@game/constants.ts';
import { classDef } from '@game/progression.ts';

export function StatusPage() {
  const { profile, stats, totals, messages } = usePlayerStore();
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  if (!profile) return null;

  const progress = levelProgress(profile.xp_total);
  const statMap = Object.fromEntries(stats.map((s) => [s.stat, Number(s.value)]));

  return (
    <div className="flex flex-col gap-4">
      {/* ── Identity ── */}
      <SystemWindow title="Status" scan>
        <div className="flex items-center gap-4">
          <RankBadge rank={profile.rank} size={52} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-xl font-bold uppercase tracking-wider">
              <GlitchText text={profile.display_name} />
            </div>
            <div className="font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
              {profile.rank}-Rank · {RANK_TITLES[profile.rank as Rank] ?? ''}
              {classDef(profile.class) && (
                <span className="text-accent-purple"> · {classDef(profile.class)!.name}</span>
              )}
              {profile.equipped_title && (
                <span className="text-accent-gold"> · {profile.equipped_title}</span>
              )}
            </div>
            <div className="mt-1 font-sys text-sm text-accent-cyan glow-text">
              LEVEL {profile.level}
            </div>
          </div>
          <ManaOrb mana={profile.mana} manaMax={profile.mana_max} />
        </div>

        <div className="mt-4">
          <StatBar
            value={progress.intoLevel}
            max={progress.forLevel}
            label={`XP ${progress.intoLevel.toLocaleString()} / ${progress.forLevel.toLocaleString()}`}
            sublabel={`Next: LV ${Math.min(progress.level + 1, 100)}`}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 font-sys text-center text-[0.65rem] uppercase tracking-widest">
          <div className="border border-accent-cyan/20 bg-bg-base/40 p-2">
            {/* A live streak breathes — it is the spine of everything. */}
            <div
              className={`text-base text-accent-gold glow-text ${
                (totals?.current_streak ?? 0) > 0 ? 'breathe' : ''
              }`}
            >
              <TickingNumber value={totals?.current_streak ?? 0} />
            </div>
            <div className="text-slate-500">Streak</div>
          </div>
          <div className="border border-accent-cyan/20 bg-bg-base/40 p-2">
            <div className="text-base text-essence glow-text">
              <TickingNumber value={profile.essence_stones} />
            </div>
            <div className="text-slate-500">Essence</div>
          </div>
          <div className="border border-accent-cyan/20 bg-bg-base/40 p-2">
            <div className="text-base text-mana glow-text">
              <TickingNumber value={profile.mana_potions} />
            </div>
            <div className="text-slate-500">Potions</div>
          </div>
        </div>
      </SystemWindow>

      {/* ── 9 stats ── */}
      <SystemWindow title="Attributes" delay={0.08}>
        <div className="flex flex-col gap-3">
          {STAT_GROUPS.map((group, gi) => (
            <div key={group.name}>
              <div className="mb-1 font-sys text-[0.6rem] uppercase tracking-[0.25em] text-slate-500">
                {group.name}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {group.stats.map((key, si) => (
                  <motion.div
                    key={key}
                    className="border border-accent-cyan/20 bg-bg-base/40 p-2 text-center"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + gi * 0.08 + si * 0.04 }}
                    title={STAT_LABELS[key]}
                  >
                    <div className="font-sys text-[0.65rem] uppercase tracking-widest text-accent-cyan">
                      {key}
                    </div>
                    <div className="font-sys text-lg text-white">
                      {statMap[key] ?? 10}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SystemWindow>

      {/* ── AI System Coach: weekly assessment ── */}
      <SystemAssessmentPanel />

      {/* ── Class ── */}
      <ClassPanel />

      {/* ── Inventory ── */}
      <InventoryPanel />

      {/* ── Lifetime record ── */}
      <SystemWindow title="Record" accent="purple" delay={0.16}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-sys text-xs uppercase tracking-wider">
          <Record label="Push-ups" value={totals?.total_pushups ?? 0} />
          <Record label="Sit-ups" value={totals?.total_situps ?? 0} />
          <Record label="Squats" value={totals?.total_squats ?? 0} />
          <Record label="Distance" value={formatDistance(Number(totals?.total_run_km ?? 0), distanceUnit)} />
          <Record label="Days trained" value={totals?.days_completed ?? 0} />
          <Record label="Best streak" value={totals?.best_streak ?? 0} />
        </div>
      </SystemWindow>

      {/* ── System log ── */}
      <SystemWindow title="System Log" accent="gold" delay={0.24}>
        {messages.length === 0 ? (
          <p className="font-sys text-xs text-slate-500">No messages.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.slice(0, 6).map((m) => (
              <li key={m.id} className="border-l-2 border-accent-gold/40 pl-3">
                <div className="font-display text-sm font-semibold">{m.title}</div>
                {m.body && <div className="mt-0.5 text-xs text-slate-400">{m.body}</div>}
                <div className="mt-0.5 font-sys text-[0.6rem] uppercase tracking-widest text-slate-600">
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SystemWindow>
    </div>
  );
}

function Record({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/5 pb-1">
      <span className="text-slate-500">{label}</span>
      <span className="text-white">{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  );
}
