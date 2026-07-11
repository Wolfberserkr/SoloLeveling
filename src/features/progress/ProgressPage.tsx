import { useMemo, useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatDistance } from '@/lib/units';
import { SystemWindow } from '@/components/system/SystemWindow';
import { LineChart } from '@/components/system/LineChart';
import { GlitchText } from '@/components/system/GlitchText';
import { useProgressData, type TrainingDay } from './useProgressData';

const fmtDay = (iso: string): string =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function ProgressPage() {
  const { profile, totals } = usePlayerStore();
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const data = useProgressData();

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-4">
      <SystemWindow title="Progress" scan>
        <p className="font-sys text-[0.7rem] uppercase leading-relaxed tracking-widest text-slate-400">
          The shape of the climb — <GlitchText text={profile.display_name} />, since{' '}
          {profile.journey_started_at}.
        </p>
        {data.degraded && (
          <p className="mt-2 font-sys text-[0.6rem] uppercase tracking-widest text-accent-red">
            Some history could not be read — showing what the System could recover.
          </p>
        )}
      </SystemWindow>

      {/* ── XP & Level trajectory ── */}
      <XpPanel data={data} level={profile.level} totalXp={profile.xp_total} />

      {/* ── Training streak calendar ── */}
      <StreakPanel
        trainingDays={data.trainingDays}
        currentStreak={Number(totals?.current_streak ?? 0)}
        bestStreak={Number(totals?.best_streak ?? 0)}
      />

      {/* ── Body metrics ── */}
      <BodyPanel data={data} distanceUnit={distanceUnit} />

      {/* ── Lifetime & weekly recap ── */}
      <LifetimePanel data={data} distanceUnit={distanceUnit} />
    </div>
  );
}

// ── XP & Level ───────────────────────────────────────────────────────────────
function XpPanel({
  data,
  level,
  totalXp,
}: {
  data: ReturnType<typeof useProgressData>;
  level: number;
  totalXp: number;
}) {
  const levelSeries = data.xpDays.map((d) => d.level);
  const xpBars = data.xpDays.map((d) => d.xp);
  const first = data.xpDays[0];
  const levelsGained = first ? level - first.level : 0;

  return (
    <SystemWindow title="XP & Level" accent="cyan" delay={0.04}>
      <div className="mb-3 grid grid-cols-2 gap-2 font-sys text-center text-[0.65rem] uppercase tracking-widest">
        <div className="border border-accent-cyan/20 bg-bg-base/40 p-2">
          <div className="text-base text-accent-cyan glow-text">{level}</div>
          <div className="text-slate-500">Level</div>
        </div>
        <div className="border border-accent-cyan/20 bg-bg-base/40 p-2">
          <div className="text-base text-white">{totalXp.toLocaleString()}</div>
          <div className="text-slate-500">Total XP</div>
        </div>
      </div>
      <LineChart
        points={levelSeries}
        bars={xpBars}
        ariaLabel="Level climb over time, with daily XP in the background"
        caption={
          first
            ? `Level ${level} · +${levelsGained} since ${fmtDay(first.date)} · bars = daily XP`
            : undefined
        }
        emptyHint="Complete quests to start charting your climb — your XP history will appear here."
      />
    </SystemWindow>
  );
}

// ── Streak calendar ──────────────────────────────────────────────────────────
function StreakPanel({
  trainingDays,
  currentStreak,
  bestStreak,
}: {
  trainingDays: TrainingDay[];
  currentStreak: number;
  bestStreak: number;
}) {
  return (
    <SystemWindow title="Training Streak" accent="gold" delay={0.08}>
      <div className="mb-3 grid grid-cols-2 gap-2 font-sys text-center text-[0.65rem] uppercase tracking-widest">
        <div className="border border-accent-gold/20 bg-bg-base/40 p-2">
          <div className={`text-base text-accent-gold glow-text ${currentStreak > 0 ? 'breathe' : ''}`}>
            {currentStreak}
          </div>
          <div className="text-slate-500">Current streak</div>
        </div>
        <div className="border border-accent-gold/20 bg-bg-base/40 p-2">
          <div className="text-base text-accent-gold glow-text">{bestStreak}</div>
          <div className="text-slate-500">Best streak</div>
        </div>
      </div>
      <StreakCalendar trainingDays={trainingDays} />
      <div className="mt-3 flex items-center justify-center gap-4 font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 border border-accent-cyan/40 bg-accent-cyan/30" />
          Completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 border border-accent-gold/50 bg-accent-gold/40" />
          Perfect clear
        </span>
      </div>
    </SystemWindow>
  );
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Month grid of training days. Completed days glow cyan; perfect clears glow
 * gold. Per the README "Calendar grid" note, the first day is positioned with
 * gridColumnStart — never padded with leading placeholder cells, which can
 * inflate a row's height against a stale container width.
 */
function StreakCalendar({ trainingDays }: { trainingDays: TrainingDay[] }) {
  const [monthStr, setMonthStr] = useState(todayISO().slice(0, 7));

  const { completed, perfect } = useMemo(() => {
    const c = new Set<string>();
    const p = new Set<string>();
    for (const d of trainingDays) {
      if (d.status === 'completed') {
        c.add(d.date);
        if (d.perfectClear) p.add(d.date);
      }
    }
    return { completed: c, perfect: p };
  }, [trainingDays]);

  const [y, m] = monthStr.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const startDow = (first.getDay() + 6) % 7; // Mon=0 … Sun=6
  const today = todayISO();

  function shift(delta: number) {
    const d = new Date(y, m - 1 + delta, 1);
    setMonthStr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const cells: React.ReactNode[] = [];
  for (let d = 1; d <= last.getDate(); d++) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isPerfect = perfect.has(iso);
    const isDone = completed.has(iso);
    const isToday = iso === today;
    const tone = isPerfect
      ? 'border-accent-gold/50 bg-accent-gold/40 text-bg-base'
      : isDone
        ? 'border-accent-cyan/40 bg-accent-cyan/25 text-accent-cyan'
        : 'border-white/5 text-slate-600';
    cells.push(
      <div
        key={iso}
        title={isDone ? `${iso}${isPerfect ? ' · Perfect Clear' : ''}` : iso}
        className={`flex aspect-square items-center justify-center border font-sys text-[0.6rem] ${tone} ${
          isToday ? 'ring-1 ring-accent-cyan' : ''
        }`}
        style={d === 1 ? { gridColumnStart: startDow + 1 } : undefined}
      >
        {d}
      </div>,
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between font-sys text-[0.65rem] uppercase tracking-widest text-slate-300">
        <button type="button" onClick={() => shift(-1)} className="px-2 text-accent-cyan" aria-label="Previous month">
          ‹
        </button>
        <span>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <button type="button" onClick={() => shift(1)} className="px-2 text-accent-cyan" aria-label="Next month">
          ›
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center font-sys text-[0.55rem] uppercase tracking-widest text-slate-600">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">{cells}</div>
    </div>
  );
}

// ── Body metrics ─────────────────────────────────────────────────────────────
function BodyPanel({
  data,
  distanceUnit,
}: {
  data: ReturnType<typeof useProgressData>;
  distanceUnit: 'km' | 'mi';
}) {
  void distanceUnit; // weight is always kg; measurements are cm — no conversion.
  const weights = data.metrics
    .map((m) => ({ date: m.local_date, kg: m.weight_kg }))
    .filter((w): w is { date: string; kg: number } => typeof w.kg === 'number');
  const series = weights.map((w) => Number(w.kg));
  const latest = series[series.length - 1];
  const diff = series.length >= 2 ? series[series.length - 1] - series[0] : 0;
  const sign = diff > 0 ? '+' : '';

  return (
    <SystemWindow title="Body Metrics" accent="purple" delay={0.12} collapsible defaultCollapsed>
      <LineChart
        points={series}
        color="#a855f7"
        ariaLabel="Body weight over time"
        caption={
          series.length >= 2
            ? `${latest.toFixed(1)} kg · ${sign}${diff.toFixed(1)} kg over ${series.length} weigh-ins`
            : undefined
        }
        emptyHint="Log at least two weigh-ins (Dungeons → body metrics) to see your weight trend."
      />
    </SystemWindow>
  );
}

// ── Lifetime & weekly recap ──────────────────────────────────────────────────
function LifetimePanel({
  data,
  distanceUnit,
}: {
  data: ReturnType<typeof useProgressData>;
  distanceUnit: 'km' | 'mi';
}) {
  const { totals } = usePlayerStore();
  const totalReps =
    Number(totals?.total_pushups ?? 0) +
    Number(totals?.total_situps ?? 0) +
    Number(totals?.total_squats ?? 0);

  return (
    <SystemWindow title="Lifetime & Weekly" accent="green" delay={0.16} collapsible defaultCollapsed>
      <div className="grid grid-cols-2 gap-2 font-sys text-center text-[0.65rem] uppercase tracking-widest">
        <Tile label="Total reps" value={totalReps.toLocaleString()} />
        <Tile label="Distance" value={formatDistance(Number(totals?.total_run_km ?? 0), distanceUnit)} />
        <Tile label="Days trained" value={String(totals?.days_completed ?? 0)} />
        <Tile label="Best streak" value={String(totals?.best_streak ?? 0)} />
      </div>

      <div className="mt-4 mb-2 font-sys text-[0.6rem] uppercase tracking-[0.25em] text-slate-500">
        Weekly assessments
      </div>
      {data.reviews.length === 0 ? (
        <p className="font-sys text-xs text-slate-500">
          No weekly assessments yet — the System Coach reviews each week you finish.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.reviews.map((r) => (
            <li key={r.id} className="border-l-2 border-accent-green/40 pl-3">
              <div className="flex items-baseline justify-between gap-2 font-sys text-[0.6rem] uppercase tracking-widest text-slate-400">
                <span>
                  {fmtDay(r.week_start)} – {fmtDay(r.week_end)}
                </span>
                <span className="text-accent-green">{r.summary.daysCompleted}/7 days</span>
              </div>
              <div className="mt-0.5 font-sys text-[0.6rem] uppercase tracking-widest text-slate-500">
                {r.summary.xpEarned.toLocaleString()} XP ·{' '}
                {formatDistance(Number(r.summary.runKm ?? 0), distanceUnit)}
                {r.summary.perfectClears > 0 && ` · ${r.summary.perfectClears} perfect`}
                {r.summary.weightChangeKg != null &&
                  ` · ${r.summary.weightChangeKg > 0 ? '+' : ''}${r.summary.weightChangeKg} kg`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SystemWindow>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-accent-green/20 bg-bg-base/40 p-2">
      <div className="text-base text-white normal-case">{value}</div>
      <div className="mt-0.5 text-slate-500">{label}</div>
    </div>
  );
}
