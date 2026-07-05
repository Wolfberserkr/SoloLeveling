import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { gameAction } from '@/lib/gameApi';
import { fromKm, toKm, formatDistance } from '@/lib/units';
import { SystemWindow } from '@/components/system/SystemWindow';
import { StatBar } from '@/components/system/StatBar';
import type { PenaltyQuest } from '@/lib/types';

type ExerciseKey = 'pushups' | 'situps' | 'squats' | 'run_km';

const EXERCISES: Array<{ key: ExerciseKey; label: string; unit: string; steps: number[] }> = [
  { key: 'pushups', label: 'Push-ups', unit: 'reps', steps: [5, 10, 20] },
  { key: 'situps', label: 'Sit-ups', unit: 'reps', steps: [5, 10, 20] },
  { key: 'squats', label: 'Squats', unit: 'reps', steps: [5, 10, 20] },
  { key: 'run_km', label: 'Run', unit: 'distance', steps: [0.25, 0.5, 1] },
];

function doneOf(p: PenaltyQuest, key: ExerciseKey): number {
  return Number(p[`${key}_done` as const]);
}
function targetOf(p: PenaltyQuest, key: ExerciseKey): number {
  return Number(p[`${key}_target` as const]);
}

/**
 * The Penalty Quest — "The System does not forgive. It tests." A broken streak
 * offers one redemption: clear the missed targets (harder) before midnight and
 * the streak is restored.
 */
export function PenaltyPanel() {
  const { penalty, setPenalty, setStreak, refresh } = usePlayerStore();
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showTakeover = useUiStore((s) => s.showTakeover);
  const [busy, setBusy] = useState(false);

  if (!penalty || penalty.status !== 'pending') return null;

  const allMet = EXERCISES.every((e) => doneOf(penalty, e.key) >= targetOf(penalty, e.key));

  async function log(key: ExerciseKey, amount: number) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await gameAction<{ penalty: PenaltyQuest }>('log-penalty', { [key]: amount });
      setPenalty(res.penalty);
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Log rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    if (busy || !allMet) return;
    setBusy(true);
    try {
      const res = await gameAction<{ streak: number; shield_earned: boolean }>('complete-penalty');
      setStreak(res.streak);
      setPenalty(null);
      showTakeover({
        kind: 'perfect',
        title: 'Penalty Cleared',
        subtitle: `Streak restored to ${res.streak}${res.shield_earned ? ' · Shield of Resolve earned' : ''}`,
      });
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Redemption rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title="Penalty Quest" accent="red" scan attention>
      <p className="text-xs leading-relaxed text-accent-red">
        Your {penalty.streak_to_restore}-day streak has broken. Clear this quest before midnight and
        it is restored — no XP, only redemption. The System tests who gets back up.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {EXERCISES.map((e) => {
          const done = doneOf(penalty, e.key);
          const target = targetOf(penalty, e.key);
          const met = done >= target;
          const label =
            e.unit === 'distance'
              ? `${formatDistance(done, distanceUnit)} / ${formatDistance(target, distanceUnit)}`
              : `${done} / ${target}`;
          return (
            <div key={e.key}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className={`font-display text-sm font-semibold ${met ? 'text-accent-green' : 'text-white'}`}>
                  {met ? '✓ ' : ''}
                  {e.label}
                </span>
                <span className="font-sys text-xs text-slate-400">{label}</span>
              </div>
              <StatBar value={done} max={target} accent={met ? 'green' : 'red'} height={6} />
              {!met && (
                <div className="mt-2 flex gap-2">
                  {e.steps.map((step) => (
                    <button
                      key={step}
                      className="sys-btn sys-btn-ghost flex-1 !min-h-[32px] !py-1 !text-[0.65rem]"
                      disabled={busy}
                      onClick={() =>
                        log(e.key, e.unit === 'distance' ? toKm(step, distanceUnit) : step)
                      }
                    >
                      +{e.unit === 'distance' ? `${fromKm(toKm(step, distanceUnit), distanceUnit)} ${distanceUnit}` : step}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        className={`sys-btn mt-4 w-full ${allMet ? 'animate-pulse-glow' : ''}`}
        disabled={busy || !allMet}
        onClick={redeem}
      >
        {allMet ? '⚔ Redeem — Restore Streak' : 'Meet every target to redeem'}
      </button>
    </SystemWindow>
  );
}
