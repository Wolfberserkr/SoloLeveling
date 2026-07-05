import { useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useUiStore } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { gameAction } from '@/lib/gameApi';
import { formatDistance } from '@/lib/units';
import { SystemWindow } from '@/components/system/SystemWindow';
import { weekWindow } from '@game/review.ts';
import type { WeeklyReview } from '@/lib/types';

/** Local YYYY-MM-DD in the player's own timezone (matches the server's clock). */
function localToday(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const fmtDay = (iso: string): string =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function SystemAssessmentPanel() {
  const { profile, weeklyReview, refresh } = usePlayerStore();
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const pushAlert = useUiStore((s) => s.pushAlert);
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  const target = weekWindow(localToday(profile.timezone));
  // A newer completed week exists than the one we last assessed (or none yet).
  const canRequest = !weeklyReview || weeklyReview.week_start < target.start;

  async function request() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await gameAction<{ review: WeeklyReview; fresh: boolean }>('weekly-review');
      await refresh();
      pushAlert({
        kind: res.fresh ? 'success' : 'info',
        title: res.fresh ? 'Assessment delivered' : 'Already assessed',
        body: res.fresh
          ? 'The System has reviewed the week that passed.'
          : 'This week has already been reviewed.',
      });
    } catch (err) {
      pushAlert({
        kind: 'danger',
        title: 'The Coach is silent',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow
      title="System Assessment"
      accent="cyan"
      delay={0.2}
      collapsible
      defaultCollapsed
      attention={canRequest}
    >
      {weeklyReview ? (
        <>
          <div className="font-sys text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
            Week of {fmtDay(weeklyReview.week_start)} – {fmtDay(weeklyReview.week_end)}
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-200">
            {weeklyReview.narrative}
          </p>
          <div
            className={`mt-3 grid gap-2 font-sys text-center text-[0.6rem] uppercase tracking-widest ${
              weeklyReview.summary.daysFueled != null ? 'grid-cols-5' : 'grid-cols-4'
            }`}
          >
            <Stat label="Days" value={`${weeklyReview.summary.daysCompleted}/7`} />
            <Stat label="XP" value={weeklyReview.summary.xpEarned.toLocaleString()} />
            <Stat
              label="Sleep"
              value={
                weeklyReview.summary.nightsLogged > 0
                  ? `${weeklyReview.summary.avgSleepHours}h`
                  : '—'
              }
            />
            <Stat
              label="Distance"
              value={formatDistance(weeklyReview.summary.runKm, distanceUnit)}
            />
            {weeklyReview.summary.daysFueled != null && (
              <Stat label="Fueled" value={`${weeklyReview.summary.daysFueled}/7`} />
            )}
          </div>

          {weeklyReview.summary.load && weeklyReview.summary.load.reason !== 'hold' && (
            <div
              className={`mt-3 border-l-2 pl-3 font-sys text-[0.65rem] uppercase tracking-widest ${
                weeklyReview.summary.load.reason === 'progress'
                  ? 'border-accent-gold/60 text-accent-gold'
                  : 'border-mana/60 text-mana'
              }`}
            >
              {weeklyReview.summary.load.reason === 'progress' ? 'Overload' : 'Deload'} — training
              load {weeklyReview.summary.load.delta > 0 ? '+' : '−'}
              {Math.round(Math.abs(weeklyReview.summary.load.delta) * 100)}% →{' '}
              {Math.round(weeklyReview.summary.load.after * 100)}% this week
            </div>
          )}
        </>
      ) : (
        <p className="font-sys text-xs uppercase tracking-widest text-slate-500">
          The System Coach can review the week you just finished — your training, sleep, reading,
          and records, weighed and assessed.
        </p>
      )}

      {canRequest && (
        <button
          disabled={busy}
          onClick={request}
          className="mt-3 w-full border border-accent-cyan/40 bg-bg-base/40 p-2 font-sys text-[0.65rem] uppercase tracking-widest text-accent-cyan transition-colors hover:border-accent-cyan disabled:opacity-50"
        >
          {busy ? 'Reviewing the week…' : 'Request weekly assessment'}
        </button>
      )}
    </SystemWindow>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-accent-cyan/20 bg-bg-base/40 p-2">
      <div className="text-sm text-white normal-case">{value}</div>
      <div className="mt-0.5 text-slate-500">{label}</div>
    </div>
  );
}
