import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { FOCUS_DURATIONS, MAX_MOBS, focusXp, type FocusDuration } from '@game/focus.ts';
import type { FocusRun } from '@/lib/types';

/**
 * Instant Dungeon launcher — commit to timed, focused work on 1–3 "mobs"
 * (subtasks). Hidden while a run is active (the full-screen overlay takes over).
 */
export function FocusPanel() {
  const { focus, focusKeysLeft, setFocus } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const [duration, setDuration] = useState<FocusDuration>(25);
  const [mobs, setMobs] = useState<string[]>(['']);
  const [busy, setBusy] = useState(false);

  // While a dungeon is open, the overlay owns the screen — no launcher here.
  if (focus && focus.status === 'active') return null;

  const filledMobs = mobs.map((m) => m.trim()).filter(Boolean);
  const canStart = focusKeysLeft > 0 && filledMobs.length > 0 && !busy;

  async function start() {
    if (!canStart) return;
    setBusy(true);
    try {
      const res = await gameAction<{ focus: FocusRun; keys_left: number }>('start-focus', {
        duration_min: duration,
        mobs: filledMobs,
      });
      setFocus(res.focus, res.keys_left);
      setMobs(['']);
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Dungeon did not open',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title="Instant Dungeon" accent="purple" delay={0.04} collapsible defaultCollapsed>
      <p className="font-sys text-[0.7rem] leading-relaxed text-slate-400">
        Enter a timed dungeon for deep work, study, or practice. Name your mobs, commit to the
        clock, and see it through — leaving collapses the dungeon.
      </p>

      <div className="mt-3 flex items-center justify-between">
        <span className="font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
          Keys today
        </span>
        <span className="font-sys text-sm text-accent-purple glow-text">
          {'◈'.repeat(focusKeysLeft) || '—'}
          <span className="ml-1 text-slate-500">×{focusKeysLeft}</span>
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {FOCUS_DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDuration(d)}
            className={`border py-2 text-center font-sys text-xs uppercase tracking-widest transition-colors ${
              d === duration
                ? 'border-accent-purple/60 bg-accent-purple/10 text-accent-purple'
                : 'border-accent-cyan/15 text-slate-400'
            }`}
          >
            {d}m
            <span className="block text-[0.55rem] text-slate-500">+{focusXp(d, filledMobs.length || 1)} XP</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {mobs.map((mob, i) => (
          <input
            key={i}
            className="sys-input"
            placeholder={i === 0 ? 'Mob 1 — e.g. draft the report' : `Mob ${i + 1} (optional)`}
            maxLength={120}
            value={mob}
            onChange={(e) =>
              setMobs((m) => m.map((v, j) => (j === i ? e.target.value : v)))
            }
          />
        ))}
        {mobs.length < MAX_MOBS && (
          <button
            type="button"
            className="text-left font-sys text-[0.65rem] uppercase tracking-widest text-accent-cyan/70 hover:text-accent-cyan"
            onClick={() => setMobs((m) => [...m, ''])}
          >
            + Add a mob
          </button>
        )}
      </div>

      <button className="sys-btn mt-4 w-full" disabled={!canStart} onClick={start}>
        {focusKeysLeft <= 0 ? 'No keys left today' : '⟢ Enter Dungeon'}
      </button>
    </SystemWindow>
  );
}
