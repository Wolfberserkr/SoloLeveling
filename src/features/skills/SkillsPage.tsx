import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import {
  SKILLS,
  skillPrereqError,
  skillCooldownRemaining,
  type SkillDef,
} from '@game/progression.ts';
import { RANKS, type Rank } from '@game/constants.ts';

export function SkillsPage() {
  const { profile, skills, training, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const [busy, setBusy] = useState<string | null>(null);
  if (!profile) return null;

  const today = training?.local_date ?? new Date().toISOString().slice(0, 10);
  const owned = new Map(skills.map((s) => [s.skill_key, s]));
  const rankIndex = Math.max(0, RANKS.indexOf(profile.rank as Rank));

  async function act(action: 'unlock-skill' | 'use-skill', def: SkillDef) {
    if (busy) return;
    setBusy(def.key);
    try {
      await gameAction(action, { skill_key: def.key });
      await refresh();
      pushAlert({
        kind: 'success',
        title: action === 'unlock-skill' ? `${def.name} learned` : `${def.name} used`,
        body: def.description,
      });
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: action === 'unlock-skill' ? 'Cannot learn skill' : 'Cannot use skill',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  const passives = SKILLS.filter((s) => s.type === 'passive');
  const actives = SKILLS.filter((s) => s.type === 'active');

  return (
    <div className="flex flex-col gap-4">
      <SystemWindow title="Skills" scan>
        <div className="flex items-center justify-between">
          <p className="font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
            Spend Essence to learn abilities
          </p>
          <div className="font-sys text-sm text-essence glow-text">
            {profile.essence_stones} ◆
          </div>
        </div>
      </SystemWindow>

      <SystemWindow title="Passives" accent="purple" delay={0.08}>
        <ul className="flex flex-col gap-2">
          {passives.map((def) => (
            <SkillRow
              key={def.key}
              def={def}
              owned={Boolean(owned.get(def.key))}
              prereq={skillPrereqError(def, { level: profile.level, rankIndex })}
              essence={profile.essence_stones}
              busy={busy === def.key}
              onUnlock={() => act('unlock-skill', def)}
            />
          ))}
        </ul>
      </SystemWindow>

      <SystemWindow title="Active Abilities" accent="gold" delay={0.16}>
        <ul className="flex flex-col gap-2">
          {actives.map((def) => {
            const row = owned.get(def.key);
            const cooldown = row
              ? skillCooldownRemaining(row.last_used_at, def.cooldownDays ?? 0, today)
              : 0;
            return (
              <SkillRow
                key={def.key}
                def={def}
                owned={Boolean(row)}
                prereq={skillPrereqError(def, { level: profile.level, rankIndex })}
                essence={profile.essence_stones}
                busy={busy === def.key}
                cooldown={cooldown}
                onUnlock={() => act('unlock-skill', def)}
                onUse={() => act('use-skill', def)}
              />
            );
          })}
        </ul>
      </SystemWindow>
    </div>
  );
}

function SkillRow({
  def,
  owned,
  prereq,
  essence,
  busy,
  cooldown = 0,
  onUnlock,
  onUse,
}: {
  def: SkillDef;
  owned: boolean;
  prereq: string | null;
  essence: number;
  busy: boolean;
  cooldown?: number;
  onUnlock: () => void;
  onUse?: () => void;
}) {
  const affordable = essence >= def.essenceCost;
  const cooldownLabel =
    cooldown > 0 ? `On cooldown — ${cooldown}d` : null;

  return (
    <li className={`border p-3 ${owned ? 'border-accent-cyan/30 bg-bg-base/40' : 'border-white/10 bg-bg-base/20'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-sm font-semibold text-white">{def.name}</span>
        {!owned && (
          <span className={`shrink-0 font-sys text-[0.6rem] uppercase tracking-widest ${affordable ? 'text-essence' : 'text-slate-600'}`}>
            {def.essenceCost} ◆
          </span>
        )}
      </div>
      <div className="mt-0.5 font-sys text-[0.65rem] text-slate-400">{def.description}</div>

      {owned ? (
        onUse ? (
          <button
            className="sys-btn sys-btn-ghost mt-2 w-full !min-h-[34px] !py-1 !text-[0.65rem]"
            disabled={busy || cooldown > 0}
            onClick={onUse}
          >
            {cooldownLabel ?? `Use${def.manaCost ? ` (−${def.manaCost} mana)` : ''}`}
          </button>
        ) : (
          <div className="mt-2 font-sys text-[0.6rem] uppercase tracking-widest text-accent-cyan">
            Learned · always active
          </div>
        )
      ) : (
        <button
          className="sys-btn mt-2 w-full !min-h-[34px] !py-1 !text-[0.65rem]"
          disabled={busy || Boolean(prereq) || !affordable}
          onClick={onUnlock}
        >
          {prereq ?? (affordable ? 'Learn' : 'Not enough Essence')}
        </button>
      )}
    </li>
  );
}
