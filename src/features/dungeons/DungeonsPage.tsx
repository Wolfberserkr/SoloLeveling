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
  MAX_DUNGEON_PHASE,
} from '@game/dungeons.ts';
import { MANA_COSTS } from '@game/mana.ts';
import type { DungeonProgress, XpAward } from '@/lib/types';

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

function DungeonRunPanel() {
  const { profile, dungeon, gymDoneToday, setDungeon, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const [busy, setBusy] = useState(false);
  const [ticked, setTicked] = useState<Record<number, boolean>>({});

  if (!profile || !dungeon) return null;
  const def = dungeonPhaseFor(dungeon.phase);
  const affordable = profile.mana >= MANA_COSTS.gym;

  async function clearRun() {
    if (busy || gymDoneToday || !affordable) return;
    setBusy(true);
    try {
      const res = await gameAction<{
        award: XpAward;
        dungeon: DungeonProgress;
        boss_ready: boolean;
      }>('complete-gym');
      setDungeon(res.dungeon, true);
      setTicked({});
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

      <div className="mt-4 flex flex-col gap-2">
        {def.template.map((exercise, i) => (
          <button
            key={exercise}
            type="button"
            onClick={() => setTicked((t) => ({ ...t, [i]: !t[i] }))}
            className={`flex items-center gap-3 border p-2 text-left font-sys text-xs transition-colors ${
              ticked[i]
                ? 'border-accent-green/40 bg-accent-green/5 text-accent-green'
                : 'border-accent-cyan/20 bg-bg-base/40 text-slate-300'
            }`}
          >
            <span className="w-4 text-center">{ticked[i] ? '✓' : '·'}</span>
            {exercise}
          </button>
        ))}
      </div>

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
