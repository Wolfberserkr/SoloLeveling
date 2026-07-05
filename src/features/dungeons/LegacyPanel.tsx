import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { gameAction } from '@/lib/gameApi';
import { todayInTz } from '@/lib/dates';
import { SystemWindow } from '@/components/system/SystemWindow';
import { GlitchText } from '@/components/system/GlitchText';
import { LEGACY_DIMENSIONS, LEGACY_HORIZON_DAYS, type LegacyMetrics } from '@game/legacy.ts';
import type { XpAward } from '@/lib/types';

type DimensionResult = {
  key: keyof LegacyMetrics;
  label: string;
  core: boolean;
  unit?: string;
  past: number;
  current: number;
  comparable: boolean;
  improved: boolean;
};

type Verdict = {
  dimensions: DimensionResult[];
  victory: boolean;
  coreRequired: number;
  coreBeaten: number;
  bonusBeaten: number;
};

const ONE_DAY = 86_400_000;

function fmt(n: number, unit?: string): string {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return unit ? `${v} ${unit}` : v;
}

export function LegacyPanel() {
  const { legacy, training, profile, refresh } = usePlayerStore();
  const pushAlert = useUiStore((s) => s.pushAlert);
  const showLevelUp = useUiStore((s) => s.showLevelUp);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  if (!legacy) return null;

  // Server-day first, then profile timezone — never the raw device clock.
  const today = training?.local_date ?? todayInTz(profile?.timezone);
  const daysLeft = Math.max(
    0,
    Math.ceil((Date.parse(legacy.due_date) - Date.parse(today)) / ONE_DAY),
  );
  const due = legacy.due_date <= today;
  const attemptedToday = legacy.last_attempt === today;

  async function challenge() {
    if (busy || attemptedToday) return;
    setBusy(true);
    try {
      const res = await gameAction<{ victory: boolean; verdict: Verdict; award?: XpAward }>(
        'challenge-legacy',
      );
      setVerdict(res.verdict);
      pushAlert(
        res.victory
          ? {
              kind: 'success',
              title: 'PAST SELF SURPASSED',
              body: res.award ? `+${res.award.credited} XP. A new snapshot is sealed.` : undefined,
            }
          : {
              kind: 'warning',
              title: 'Your past self stands',
              body: `${res.verdict.coreBeaten}/${res.verdict.coreRequired} core measures beaten.`,
            },
      );
      if (res.victory && res.award?.leveled_up) showLevelUp(res.award.new_level);
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

  // Post-challenge: show the full comparison verdict.
  if (verdict) {
    return (
      <SystemWindow title="Legacy Boss — Your Past Self" accent="red" scan>
        <div className="mb-3 text-center font-display text-xl font-bold uppercase tracking-[0.25em] glow-text">
          <GlitchText text={verdict.victory ? 'Surpassed' : 'Not Yet'} />
        </div>
        <ul className="flex flex-col gap-1">
          {verdict.dimensions.map((d) => (
            <li
              key={d.key}
              className={`flex items-center justify-between border px-2 py-1 font-sys text-[0.7rem] ${
                !d.comparable
                  ? 'border-white/5 text-slate-600'
                  : d.improved
                    ? 'border-accent-green/40 text-accent-green'
                    : 'border-accent-red/40 text-accent-red'
              }`}
            >
              <span>
                {d.label}
                {d.core && <span className="ml-1 opacity-50">★</span>}
              </span>
              <span>
                {fmt(d.past, d.unit)} → {fmt(d.current, d.unit)}{' '}
                {!d.comparable ? '—' : d.improved ? '✓' : '✗'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
          ★ core — every comparable core measure must be beaten to win
        </p>
      </SystemWindow>
    );
  }

  return (
    <SystemWindow
      title="Legacy Boss — Your Past Self"
      accent={due ? 'red' : 'purple'}
      scan
      collapsible
      defaultCollapsed
      attention={due}
    >
      {due ? (
        <>
          <p className="text-xs leading-relaxed text-slate-400">
            The self the System recorded {LEGACY_HORIZON_DAYS} days ago has risen. Surpass it on
            every core measure — level, attributes, and the lifts you had logged — to clear the boss.
          </p>
          <SnapshotGrid metrics={legacy.metrics} />
          <button
            className="sys-btn mt-4 w-full animate-pulse-glow"
            disabled={busy || attemptedToday}
            onClick={challenge}
          >
            {attemptedToday ? 'Faced Today — Return Tomorrow' : '⚔ Face Your Past Self'}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-slate-400">
            The System sealed a snapshot of you on {legacy.taken_on}. In{' '}
            <span className="text-accent-purple">{daysLeft} days</span> it rises as a boss — be
            stronger than you are now.
          </p>
          <SnapshotGrid metrics={legacy.metrics} />
        </>
      )}
    </SystemWindow>
  );
}

function SnapshotGrid({ metrics }: { metrics: LegacyMetrics }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      {LEGACY_DIMENSIONS.map((d) => {
        const v = metrics[d.key] ?? 0;
        if (d.unit === 'kg' && v === 0) return null; // skip un-logged lifts
        return (
          <div key={d.key} className="border border-accent-cyan/15 bg-bg-base/40 p-1.5 text-center">
            <div className="font-sys text-[0.55rem] uppercase tracking-widest text-slate-500">
              {d.label}
            </div>
            <div className="font-sys text-sm text-white">{fmt(v, d.unit)}</div>
          </div>
        );
      })}
    </div>
  );
}
