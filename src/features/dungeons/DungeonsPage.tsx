import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { SystemWindow } from '@/components/system/SystemWindow';
import { StatBar } from '@/components/system/StatBar';
import { GlitchText } from '@/components/system/GlitchText';
import {
  dungeonPhaseFor,
  allDungeonsCleared,
  isBossReady,
  demoSearchUrl,
  sessionKindFor,
  splitFor,
  MAX_DUNGEON_PHASE,
  SESSION_ORDER,
  SESSION_LABELS,
  WARMUPS,
  COOLDOWNS,
  type DungeonExercise,
  type SessionKind,
} from '@game/dungeons.ts';
import { MANA_COSTS } from '@game/mana.ts';
import type { DungeonProgress, LiftLog, XpAward } from '@/lib/types';

export function DungeonsPage() {
  const { profile, dungeon } = usePlayerStore();
  if (!profile || !dungeon) return null;

  if (allDungeonsCleared(dungeon.phase)) {
    return (
      <div className="flex flex-col gap-4">
        <SystemWindow title="Dungeons" accent="gold" scan>
          <div className="py-6 text-center">
            <div className="font-display text-2xl font-bold uppercase tracking-[0.3em] text-accent-gold glow-text">
              <GlitchText text="Campaign Cleared" />
            </div>
            <p className="mx-auto mt-4 max-w-xs text-sm text-slate-400">
              Every dungeon the System prepared has fallen — all {MAX_DUNGEON_PHASE} phases,{' '}
              {dungeon.cycles_cleared} bosses. Maintain the summit until the next expansion.
            </p>
          </div>
        </SystemWindow>
        <MetricsPanel />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <DungeonRunPanel />
      {isBossReady(dungeon.phase, dungeon.sessions_completed) && <BossPanel />}
      <MetricsPanel />
    </div>
  );
}

/** Last entry and all-time best for one exercise (logs come newest-first). */
function liftStats(logs: LiftLog[], exercise: string): { last: LiftLog | null; best: number } {
  let last: LiftLog | null = null;
  let best = 0;
  for (const l of logs) {
    if (l.exercise !== exercise) continue;
    if (!last) last = l;
    best = Math.max(best, Number(l.weight_kg));
  }
  return { last, best };
}

function DungeonRunPanel() {
  const { profile, dungeon, gymDoneToday, liftLogs, setDungeon, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const [busy, setBusy] = useState(false);
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  const [selected, setSelected] = useState<SessionKind | null>(null);
  const [liftFor, setLiftFor] = useState<string | null>(null);

  if (!profile || !dungeon) return null;
  const def = dungeonPhaseFor(dungeon.phase);
  const affordable = profile.mana >= MANA_COSTS.gym;
  const suggested = sessionKindFor(dungeon.sessions_completed);
  const kind = selected ?? suggested;

  async function clearRun() {
    if (busy || gymDoneToday || !affordable) return;
    setBusy(true);
    try {
      const res = await gameAction<{
        award: XpAward;
        dungeon: DungeonProgress;
        boss_ready: boolean;
      }>('complete-gym', { kind });
      setDungeon(res.dungeon, true);
      setTicked({});
      setSelected(null);
      pushAlert({
        kind: 'success',
        title: 'Dungeon run cleared',
        body: `+${res.award.credited} XP · −${MANA_COSTS.gym} mana${res.award.capped ? ' · DAILY XP SATURATED' : ''}`,
      });
      if (res.boss_ready) {
        pushAlert({
          kind: 'warning',
          title: `Boss detected — ${def.boss.name}`,
          body: 'The dungeon boss awaits your challenge.',
        });
      }
      if (res.award.leveled_up) showLevelUp(res.award.new_level);
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Run rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const split = splitFor(kind);

  return (
    <SystemWindow title={`Dungeon ${dungeon.phase}/${MAX_DUNGEON_PHASE} — ${def.name}`} scan>
      <p className="text-xs leading-relaxed text-slate-400">{def.description}</p>

      <div className="mt-3">
        <StatBar
          value={Math.min(dungeon.sessions_completed, def.sessionsRequired)}
          max={def.sessionsRequired}
          label={`Runs ${Math.min(dungeon.sessions_completed, def.sessionsRequired)} / ${def.sessionsRequired}`}
          sublabel={`Boss: ${def.boss.name}`}
          accent="purple"
        />
      </div>

      {/* Pick today's session — the cycle marks the suggested next one. */}
      <div className="mt-4 grid grid-cols-4 gap-1">
        {SESSION_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setSelected(k);
              setTicked({});
              setLiftFor(null);
            }}
            className={`border py-1 text-center font-sys text-[0.6rem] uppercase tracking-widest transition-colors ${
              k === kind
                ? 'border-accent-cyan/60 bg-accent-cyan/10 text-accent-cyan'
                : 'border-accent-cyan/15 text-slate-600'
            }`}
          >
            {SESSION_LABELS[k].title.split(' — ')[0]}
            {k === suggested && <span className="block text-[0.5rem] opacity-70">next</span>}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <div className="font-sys text-xs uppercase tracking-widest text-accent-cyan">
          {SESSION_LABELS[kind].title}
        </div>
        <div className="font-sys text-[0.65rem] uppercase tracking-widest text-slate-500">
          {SESSION_LABELS[kind].focus}
        </div>
      </div>

      <ExerciseBlock label="Warmup" exercises={WARMUPS[split]} />

      <div className="mt-3 flex flex-col gap-2">
        {def.sessions[kind].map((exercise, i) => {
          const { last, best } = liftStats(liftLogs, exercise.name);
          return (
            <div key={exercise.name}>
              <div
                className={`flex items-stretch border transition-colors ${
                  ticked[i]
                    ? 'border-accent-green/40 bg-accent-green/5 text-accent-green'
                    : 'border-accent-cyan/20 bg-bg-base/40 text-slate-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setTicked((t) => ({ ...t, [i]: !t[i] }))}
                  className="flex flex-1 items-center gap-3 p-2 text-left font-sys text-xs"
                >
                  <span className="w-4 text-center">{ticked[i] ? '✓' : '·'}</span>
                  <span>
                    {exercise.name}
                    <span className="ml-2 opacity-60">{exercise.scheme}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setLiftFor(liftFor === exercise.name ? null : exercise.name)}
                  className={`flex items-center border-l border-accent-cyan/20 px-2 font-sys text-[0.65rem] ${
                    last ? 'text-accent-gold/90' : 'text-slate-500'
                  }`}
                >
                  {last ? `${Number(last.weight_kg)}kg` : '+kg'}
                </button>
                <DemoLink exercise={exercise} />
              </div>
              {liftFor === exercise.name && (
                <LiftEditor
                  exercise={exercise.name}
                  last={last}
                  best={best}
                  onDone={() => setLiftFor(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      <ExerciseBlock label="Cooldown" exercises={COOLDOWNS[split]} />

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Four runs a week — e.g. Mon · Tue · Thu · Fri. The System suggests the next session in
        the cycle, but the choice is yours: pick any of the four above.
      </p>

      {gymDoneToday ? (
        <motion.div
          initial={{ scale: 2, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: -8 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none mx-auto mt-5 w-fit border-2 border-accent-green px-6 py-1 font-display text-xl font-bold uppercase tracking-[0.3em] text-accent-green"
          style={{ boxShadow: '0 0 18px rgba(16,185,129,0.4)' }}
        >
          Cleared Today
        </motion.div>
      ) : (
        <button className="sys-btn mt-5 w-full" disabled={busy || !affordable} onClick={clearRun}>
          {affordable ? `⬡ Clear Dungeon Run (−${MANA_COSTS.gym} ◈)` : 'Insufficient Mana'}
        </button>
      )}
    </SystemWindow>
  );
}

/** Inline top-set logger — one entry per exercise per day, PRs announced. */
function LiftEditor({
  exercise,
  last,
  best,
  onDone,
}: {
  exercise: string;
  last: LiftLog | null;
  best: number;
  onDone: () => void;
}) {
  const { refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const [weight, setWeight] = useState(last ? String(Number(last.weight_kg)) : '');
  const [reps, setReps] = useState(last && last.reps > 0 ? String(last.reps) : '');
  const [busy, setBusy] = useState(false);

  async function save() {
    const w = Number(weight);
    if (busy || !(w > 0)) return;
    setBusy(true);
    try {
      const res = await gameAction<{ pr: boolean; prev_best: number }>('log-lift', {
        exercise,
        weight_kg: w,
        reps: Number(reps) || 0,
      });
      pushAlert(
        res.pr
          ? {
              kind: 'success',
              title: `RECORD BROKEN — ${exercise}`,
              body: `${w} kg beats your previous best of ${res.prev_best} kg.`,
            }
          : { kind: 'success', title: 'Lift logged', body: `${exercise} — ${w} kg` },
      );
      onDone();
      await refresh();
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

  return (
    <div className="border border-t-0 border-accent-gold/25 bg-bg-base/60 p-2">
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
            Top set (kg)
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="mt-1 w-full border border-accent-cyan/30 bg-bg-base/60 px-2 py-1 text-center font-sys text-sm text-white outline-none focus:border-accent-cyan"
          />
        </label>
        <label className="flex-1">
          <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
            Reps
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="mt-1 w-full border border-accent-cyan/30 bg-bg-base/60 px-2 py-1 text-center font-sys text-sm text-white outline-none focus:border-accent-cyan"
          />
        </label>
        <button
          className="sys-btn sys-btn-ghost !min-h-[34px] flex-1 !py-1 !text-[0.65rem]"
          disabled={busy || !(Number(weight) > 0)}
          onClick={save}
        >
          Log
        </button>
      </div>
      {best > 0 && (
        <p className="mt-1 font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
          Best: {best} kg
        </p>
      )}
    </div>
  );
}

function DemoLink({ exercise }: { exercise: DungeonExercise }) {
  return (
    <a
      href={demoSearchUrl(exercise)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Demo: ${exercise.name}`}
      className="flex items-center border-l border-accent-cyan/20 px-3 font-sys text-xs text-accent-cyan/80 hover:text-accent-cyan"
    >
      ▶
    </a>
  );
}

/** Collapsible warmup/cooldown list — guidance, not tracked. */
function ExerciseBlock({ label, exercises }: { label: string; exercises: DungeonExercise[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between font-sys text-[0.6rem] uppercase tracking-widest text-slate-500"
      >
        <span>
          {label} · {exercises.length}
        </span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1">
          {exercises.map((exercise) => (
            <div
              key={exercise.name}
              className="flex items-stretch border border-accent-cyan/10 bg-bg-base/30 text-slate-400"
            >
              <span className="flex-1 p-1.5 pl-2 font-sys text-[0.7rem]">
                {exercise.name}
                <span className="ml-2 opacity-60">{exercise.scheme}</span>
              </span>
              <DemoLink exercise={exercise} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BossPanel() {
  const { dungeon, setDungeon, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  if (!dungeon) return null;
  const def = dungeonPhaseFor(dungeon.phase);
  const today = new Date();
  const attemptedToday =
    dungeon.last_boss_attempt != null &&
    dungeon.last_boss_attempt === today.toLocaleDateString('en-CA');
  const allConfirmed = def.boss.benchmarks.every((b) => confirmed[b.key]);

  async function challenge() {
    if (busy || attemptedToday) return;
    setBusy(true);
    try {
      const res = await gameAction<{
        victory: boolean;
        boss: string;
        award?: XpAward;
        dungeon?: DungeonProgress;
      }>('attempt-boss', { confirmed });
      if (res.victory && res.dungeon) {
        setDungeon(res.dungeon);
        pushAlert({
          kind: 'success',
          title: `DUNGEON CLEARED — ${res.boss} has fallen`,
          body: res.award ? `+${res.award.credited} XP · Daily targets rise.` : undefined,
        });
        if (res.award?.leveled_up) showLevelUp(res.award.new_level);
      } else {
        pushAlert({
          kind: 'warning',
          title: `${res.boss} stands`,
          body: 'Not every benchmark fell. Train, recover, challenge again tomorrow.',
        });
      }
      await refresh();
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'Challenge rejected',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow title={`Boss Fight — ${def.boss.name}`} accent="red" scan delay={0.08}>
      <p className="text-xs leading-relaxed text-slate-400">
        Perform the benchmarks in one session, then report honestly which ones fell. Defeat
        requires all of them. One attempt per day.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {def.boss.benchmarks.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setConfirmed((c) => ({ ...c, [b.key]: !c[b.key] }))}
            className={`flex items-center gap-3 border p-2 text-left font-sys text-xs transition-colors ${
              confirmed[b.key]
                ? 'border-accent-red/50 bg-accent-red/10 text-accent-red'
                : 'border-accent-cyan/20 bg-bg-base/40 text-slate-300'
            }`}
          >
            <span className="w-4 text-center">{confirmed[b.key] ? '⚔' : '·'}</span>
            {b.label}
          </button>
        ))}
      </div>
      <button
        className={`sys-btn mt-4 w-full ${allConfirmed ? 'animate-pulse-glow' : ''}`}
        disabled={busy || attemptedToday}
        onClick={challenge}
      >
        {attemptedToday ? 'Attempted Today — Return Tomorrow' : '⚔ Report Boss Challenge'}
      </button>
    </SystemWindow>
  );
}

const METRIC_FIELDS = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg' },
  { key: 'body_fat_pct', label: 'Body fat', unit: '%' },
  { key: 'waist_cm', label: 'Waist', unit: 'cm' },
] as const;

function MetricsPanel() {
  const { metrics, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function log() {
    const payload: Record<string, number> = {};
    for (const f of METRIC_FIELDS) {
      const v = Number(values[f.key]);
      if (values[f.key] && Number.isFinite(v) && v > 0) payload[f.key] = v;
    }
    if (busy || Object.keys(payload).length === 0) return;
    setBusy(true);
    try {
      await gameAction('log-metrics', payload);
      setValues({});
      pushAlert({ kind: 'success', title: 'Metrics recorded', body: 'The System is watching.' });
      await refresh();
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

  return (
    <SystemWindow title="Body Metrics" accent="gold" delay={0.12}>
      {metrics && (
        <p className="mb-3 font-sys text-[0.65rem] uppercase tracking-widest text-slate-400">
          Last entry {metrics.local_date}
          {metrics.weight_kg != null && ` · ${Number(metrics.weight_kg)} kg`}
          {metrics.body_fat_pct != null && ` · ${Number(metrics.body_fat_pct)}% bf`}
          {metrics.waist_cm != null && ` · ${Number(metrics.waist_cm)} cm waist`}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {METRIC_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
              {f.label} ({f.unit})
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="mt-1 w-full border border-accent-cyan/30 bg-bg-base/60 px-2 py-1 text-center font-sys text-sm text-white outline-none focus:border-accent-cyan"
            />
          </label>
        ))}
      </div>
      <button
        className="sys-btn sys-btn-ghost mt-3 w-full !min-h-[34px] !py-1 !text-[0.65rem]"
        disabled={busy}
        onClick={log}
      >
        Record Measurements
      </button>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Weekly check-in, same conditions each time. One entry per week — logging again this week
        refines it. The scale is data, not judgment.
      </p>
    </SystemWindow>
  );
}
