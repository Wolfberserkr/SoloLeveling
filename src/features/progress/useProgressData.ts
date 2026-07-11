import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { levelFromTotalXp } from '@game/xpCurve.ts';
import type { BodyMetrics, WeeklyReview } from '@/lib/types';

/** One calendar day of activity, oldest → newest. */
export type XpDay = {
  date: string; // YYYY-MM-DD
  xp: number; // XP credited that day (post-cap)
  cumulativeXp: number; // running total up to and including this day
  level: number; // level implied by the running total
};

/** A completed/failed training day, keyed for the streak calendar. */
export type TrainingDay = {
  date: string;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  perfectClear: boolean;
};

export type ProgressData = {
  loading: boolean;
  /** True when one or more history reads failed (partial data may still show). */
  degraded: boolean;
  xpDays: XpDay[];
  trainingDays: TrainingDay[];
  metrics: BodyMetrics[]; // ascending by local_date
  reviews: WeeklyReview[]; // newest first
};

const DAY_MS = 86_400_000;
const isoDaysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);

/**
 * Lazily loads the player's time-series history for the Progress page. The main
 * playerStore only keeps the latest row of each of these tables, so this hook
 * reads the windows the charts need directly (RLS scopes every query to the
 * signed-in user). Mounted only by ProgressPage, so it never weighs on boot.
 */
export function useProgressData(): ProgressData {
  const [state, setState] = useState<ProgressData>({
    loading: true,
    degraded: false,
    xpDays: [],
    trainingDays: [],
    metrics: [],
    reviews: [],
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [ledgerRes, questsRes, metricsRes, reviewsRes] = await Promise.all([
        supabase
          .from('xp_ledger')
          .select('credited, local_date')
          .gte('local_date', isoDaysAgo(120))
          .order('local_date', { ascending: true }),
        supabase
          .from('training_quests')
          .select('local_date, status, perfect_clear')
          .gte('local_date', isoDaysAgo(180))
          .order('local_date', { ascending: true }),
        supabase
          .from('body_metrics')
          .select('*')
          .order('local_date', { ascending: true }),
        supabase
          .from('weekly_reviews')
          .select('*')
          .order('week_start', { ascending: false })
          .limit(12),
      ]);

      if (!alive) return;

      const degraded = [ledgerRes, questsRes, metricsRes, reviewsRes].some((r) => r.error != null);

      // Fold the ledger into per-day XP totals, then a running cumulative sum so
      // each day carries the level it implies (the climb line).
      const perDay = new Map<string, number>();
      for (const row of (ledgerRes.data ?? []) as Array<{ credited: number; local_date: string }>) {
        perDay.set(row.local_date, (perDay.get(row.local_date) ?? 0) + Number(row.credited ?? 0));
      }
      // The 120-day window is a slice of a longer history, so start the running
      // total from the XP already banked before the window opened.
      let running = 0;
      const preRes = await supabase
        .from('xp_ledger')
        .select('credited')
        .lt('local_date', isoDaysAgo(120));
      if (alive && !preRes.error) {
        running = (preRes.data ?? []).reduce(
          (s: number, r: { credited: number }) => s + Number(r.credited ?? 0),
          0,
        );
      }
      const xpDays: XpDay[] = [...perDay.keys()]
        .sort()
        .map((date) => {
          const xp = perDay.get(date) ?? 0;
          running += xp;
          return { date, xp, cumulativeXp: running, level: levelFromTotalXp(running) };
        });

      const trainingDays: TrainingDay[] = (
        (questsRes.data ?? []) as Array<{
          local_date: string;
          status: TrainingDay['status'];
          perfect_clear: boolean | null;
        }>
      ).map((r) => ({
        date: r.local_date,
        status: r.status,
        perfectClear: Boolean(r.perfect_clear),
      }));

      setState({
        loading: false,
        degraded,
        xpDays,
        trainingDays,
        metrics: (metricsRes.data ?? []) as BodyMetrics[],
        reviews: (reviewsRes.data ?? []) as WeeklyReview[],
      });
    })().catch(() => {
      if (alive) setState((s) => ({ ...s, loading: false, degraded: true }));
    });

    return () => {
      alive = false;
    };
  }, []);

  return state;
}
