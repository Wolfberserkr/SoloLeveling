import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { gameAction } from '@/lib/gameApi';
import { fromKm, toKm } from '@/lib/units';
import { SystemWindow } from '@/components/system/SystemWindow';
import { StatBar } from '@/components/system/StatBar';
import { GateCountdown } from '@/components/system/GateCountdown';
import { PenaltyPanel } from '@/features/training/PenaltyPanel';
import { SideQuestsPanel } from '@/features/training/SideQuestsPanel';
import { NutritionPanel } from '@/features/training/NutritionPanel';
import { RecoveryPanel } from '@/features/training/RecoveryPanel';
import { EventPanel } from '@/features/training/EventPanel';
import { EncounterPanel } from '@/features/training/EncounterPanel';
import type { TrainingQuest, XpAward } from '@/lib/types';

type ExerciseKey = 'pushups' | 'situps' | 'squats' | 'run_km';

const EXERCISES: Array<{
  key: ExerciseKey;
  label: string;
  unit: string;
  steps: number[];
}> = [
  { key: 'pushups', label: 'Push-ups', unit: 'reps', steps: [5, 10, 20] },
  { key: 'situps', label: 'Sit-ups', unit: 'reps', steps: [5, 10, 20] },
  { key: 'squats', label: 'Squats', unit: 'reps', steps: [5, 10, 20] },
  // Distance steps are in the player's display unit; storage stays km.
  { key: 'run_km', label: 'Run', unit: 'distance', steps: [0.25, 0.5, 1] },
];

function doneOf(q: TrainingQuest, key: ExerciseKey): number {
  return Number(q[`${key}_done` as const]);
}
function targetOf(q: TrainingQuest, key: ExerciseKey): number {
  return Number(q[`${key}_target` as const]);
}

export function TrainingPage() {
  const { training, setTraining, refresh, applyAward, setStreak } = usePlayerStore();
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const burstXp = useUiStore((s) => s.burstXp);
  const showTakeover = useUiStore((s) => s.showTakeover);
  const [busy, setBusy] = useState(false);

  if (!training) {
    return (
      <SystemWindow title="Daily Quest" accent="red">
        <p className="font-sys text-xs text-slate-400">
          No training quest found. Tap the ⟳ sync control (top right) to re-enter the System.
        </p>
      </SystemWindow>
    );
  }

  const allMet = EXERCISES.every((e) => doneOf(training, e.key) >= targetOf(training, e.key));
  const resolved = training.status !== 'pending';

  async function log(key: ExerciseKey, amount: number) {
    if (busy || resolved) return;
    setBusy(true);
    try {
      const res = await gameAction<{ training: TrainingQuest }>('log-training', {
        [key]: amount,
      });
      setTraining(res.training);
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

  async function complete(at?: { x: number; y: number }) {
    if (busy || resolved || !allMet) return;
    setBusy(true);
    try {
      const res = await gameAction<{
        award: XpAward;
        streak: number;
        perfect: XpAward | null;
        training: TrainingQuest;
      }>('complete-training');
      burstXp(res.award.credited, at);
      pushAlert({
        kind: 'success',
        title: 'Daily Quest Complete',
        body: `+${res.award.credited} XP · Streak ${res.streak}${res.award.capped ? ' · DAILY XP SATURATED' : ''}`,
      });
      if (res.perfect) {
        showTakeover({
          kind: 'perfect',
          title: 'Perfect Clear',
          subtitle: `Every quest today completed · +${res.perfect.credited} XP`,
        });
      }
      if (res.award.leveled_up || res.perfect?.leveled_up) {
        showLevelUp(res.perfect?.leveled_up ? res.perfect.new_level : res.award.new_level);
      }
      // The response carries the whole delta; only a level-up (possible
      // rank/title changes) justifies refetching everything.
      setTraining(res.training);
      applyAward(res.perfect ?? res.award);
      setStreak(res.streak);
      if (res.award.leveled_up || res.perfect?.leveled_up) await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Completion rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <GateCountdown />
      <PenaltyPanel />
      <EventPanel />
      <EncounterPanel />
      <SystemWindow title="Daily Quest — Train to Become Strong" scan>
        <div className="mb-3 flex items-center justify-between font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
          <span>{training.local_date}</span>
          <span className="flex items-center gap-2">
            {training.variant !== 'standard' && (
              <span className={training.variant === 'recovery' ? 'text-accent-purple' : 'text-accent-cyan'}>
                {training.variant}
              </span>
            )}
            {Number(training.load_modifier) < 1 && (
              <span className="text-accent-gold">Load {Math.round(Number(training.load_modifier) * 100)}%</span>
            )}
            <span
              className={
                training.status === 'completed'
                  ? 'text-accent-green'
                  : training.status === 'pending'
                    ? 'text-accent-cyan'
                    : 'text-accent-red'
              }
            >
              {training.status}
            </span>
          </span>
        </div>

        <div className="flex flex-col gap-4">
          {EXERCISES.map((ex) => {
            const done = doneOf(training, ex.key);
            const target = targetOf(training, ex.key);
            const met = done >= target;
            const isDistance = ex.unit === 'distance';
            const show = (v: number) => (isDistance ? fromKm(v, distanceUnit).toFixed(2) : v);
            return (
              <div key={ex.key}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span
                    className={`font-display text-sm font-semibold uppercase tracking-wider ${met ? 'text-accent-green' : ''}`}
                  >
                    {met && (
                      <motion.span
                        className="inline-block"
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 14 }}
                      >
                        ✓{' '}
                      </motion.span>
                    )}
                    {ex.label}
                  </span>
                  <span className="font-sys text-xs text-slate-400">
                    {show(done)} / {show(target)} {isDistance ? distanceUnit : ex.unit}
                  </span>
                </div>
                <StatBar value={done} max={target} accent={met ? 'green' : 'cyan'} height={8} />
                {!resolved && !met && (
                  <div className="mt-2 flex gap-2">
                    {ex.steps.map((step) => (
                      <button
                        key={step}
                        className="sys-btn sys-btn-ghost flex-1 !min-h-[34px] !py-1 !text-[0.65rem]"
                        disabled={busy}
                        onClick={() => log(ex.key, isDistance ? toKm(step, distanceUnit) : step)}
                      >
                        +{step}
                        {isDistance ? ` ${distanceUnit}` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <AnimatePresence>
          {!resolved && (
            <motion.button
              className={`sys-btn mt-5 w-full ${allMet ? 'animate-pulse-glow' : ''}`}
              disabled={!allMet || busy}
              onClick={(e) => complete({ x: e.clientX, y: e.clientY })}
              exit={{ opacity: 0 }}
            >
              {allMet ? '⚔ Report Completion' : 'Targets Incomplete'}
            </motion.button>
          )}
        </AnimatePresence>

        {training.status === 'completed' && (
          <motion.div
            initial={{ scale: 2.6, opacity: 0, rotate: -14 }}
            animate={{ scale: 1, opacity: 1, rotate: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none mx-auto mt-5 w-fit border-2 border-accent-green px-6 py-1 font-display text-xl font-bold uppercase tracking-[0.3em] text-accent-green"
            style={{ boxShadow: '0 0 18px rgba(16,185,129,0.4)' }}
          >
            {training.perfect_clear ? 'Perfect Clear' : 'Complete'}
          </motion.div>
        )}
      </SystemWindow>

      <SideQuestsPanel />
      <NutritionPanel />
      <RecoveryPanel />

      <SystemWindow title="Directive" accent="purple" delay={0.1}>
        <p className="text-sm leading-relaxed text-slate-300">
          The Daily Training Quest is non-negotiable. It scales as you level — slow, earned,
          physically real. Incomplete days reduce tomorrow's load instead of punishing you.
          <span className="text-accent-cyan"> Form over failure.</span>
        </p>
      </SystemWindow>
    </div>
  );
}
