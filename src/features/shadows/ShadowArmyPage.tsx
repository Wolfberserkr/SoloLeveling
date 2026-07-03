import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { GlitchText } from '@/components/system/GlitchText';
import {
  SHADOW_EXTRACT_MANA,
  armyCapacity,
  extractChance,
  shadowPassive,
  type ShadowGrade,
} from '@game/shadows.ts';
import type { Shadow } from '@/lib/types';

function passiveText(shadow: Shadow): string {
  const p = shadowPassive(shadow.source_type, shadow.grade);
  if (p.kind === 'mana_regen') return `+${p.amount} daily mana regeneration`;
  if (p.kind === 'stat') return `+${Math.round((p.mult - 1) * 100)}% attribute gains`;
  const where = p.sources === 'all' ? 'all sources' : 'its domain';
  return `+${Math.round((p.mult - 1) * 100)}% XP from ${where}`;
}

export function ShadowArmyPage() {
  const { profile, shadows, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showTakeover = useUiStore((s) => s.showTakeover);
  const [busy, setBusy] = useState<string | null>(null);
  if (!profile) return null;

  const capacity = armyCapacity(profile.rank);
  const available = shadows.filter((s) => s.status === 'available');
  const arisen = shadows.filter((s) => s.status === 'arisen');
  const deployedCount = arisen.filter((s) => s.deployed).length;

  async function run(action: 'extract-shadow' | 'deploy-shadow' | 'recall-shadow', shadow: Shadow) {
    if (busy) return;
    setBusy(shadow.id);
    try {
      const res = await gameAction<{ success?: boolean }>(action, { shadow_id: shadow.id });
      await refresh();
      if (action === 'extract-shadow') {
        if (res.success) {
          showTakeover({
            kind: 'arise',
            title: 'Arise',
            subtitle: `${shadow.name} · ${shadow.grade} shadow joins your army`,
          });
        } else {
          pushAlert({
            kind: 'warning',
            title: `${shadow.name} resists`,
            body: `${SHADOW_EXTRACT_MANA} mana spent. Try again.`,
          });
        }
      } else {
        pushAlert({
          kind: 'success',
          title: action === 'deploy-shadow' ? `${shadow.name} deployed` : `${shadow.name} recalled`,
        });
      }
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Command rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SystemWindow title="Shadow Army" scan>
        <div className="flex items-center justify-between">
          <p className="font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
            Deployed shadows lend their power
          </p>
          <div className="font-sys text-sm text-accent-purple glow-text">
            {deployedCount} / {capacity} deployed
          </div>
        </div>
        {shadows.length === 0 && (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Your army is empty. Defeat a dungeon boss — the fallen can be raised.
          </p>
        )}
      </SystemWindow>

      {available.length > 0 && (
        <SystemWindow
          title="Fallen — Awaiting Arise"
          accent="red"
          delay={0.06}
          collapsible
          defaultCollapsed
          attention
        >
          <ul className="flex flex-col gap-2">
            {available.map((shadow) => {
              const chance = Math.round(extractChance(shadow.grade as ShadowGrade, profile.rank) * 100);
              const affordable = profile.mana >= SHADOW_EXTRACT_MANA;
              return (
                <li key={shadow.id} className="border border-accent-red/30 bg-bg-base/40 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-sm font-semibold text-white">{shadow.name}</span>
                    <span className="shrink-0 font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
                      {shadow.grade}
                    </span>
                  </div>
                  <div className="mt-0.5 font-sys text-[0.65rem] text-slate-400">{passiveText(shadow)}</div>
                  <button
                    className="sys-btn mt-2 w-full !min-h-[34px] !py-1 !text-[0.65rem]"
                    disabled={busy === shadow.id || !affordable}
                    onClick={() => run('extract-shadow', shadow)}
                  >
                    {affordable
                      ? `⚑ ARISE — ${chance}% (−${SHADOW_EXTRACT_MANA} mana)`
                      : 'Insufficient mana'}
                  </button>
                </li>
              );
            })}
          </ul>
        </SystemWindow>
      )}

      <SystemWindow
        title={`Army — ${arisen.length}`}
        accent="purple"
        delay={0.12}
        collapsible
        defaultCollapsed
        attention={deployedCount < capacity && arisen.some((s) => !s.deployed)}
      >
        {arisen.length === 0 ? (
          <p className="font-sys text-xs text-slate-500">No shadows raised yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {arisen.map((shadow) => (
              <li
                key={shadow.id}
                className={`border p-3 ${shadow.deployed ? 'border-accent-purple bg-accent-purple/10' : 'border-accent-cyan/20 bg-bg-base/40'}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-sm font-semibold text-white">
                    <GlitchText text={shadow.name} />
                  </span>
                  <span className="shrink-0 font-sys text-[0.6rem] uppercase tracking-widest text-accent-purple">
                    {shadow.grade}
                  </span>
                </div>
                <div className="mt-0.5 font-sys text-[0.65rem] text-slate-400">{passiveText(shadow)}</div>
                <button
                  className="sys-btn sys-btn-ghost mt-2 w-full !min-h-[34px] !py-1 !text-[0.65rem]"
                  disabled={
                    busy === shadow.id || (!shadow.deployed && deployedCount >= capacity)
                  }
                  onClick={() => run(shadow.deployed ? 'recall-shadow' : 'deploy-shadow', shadow)}
                >
                  {shadow.deployed
                    ? 'Recall'
                    : deployedCount >= capacity
                      ? 'Army at capacity'
                      : 'Deploy'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SystemWindow>
    </div>
  );
}
