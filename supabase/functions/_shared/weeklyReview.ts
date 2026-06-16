// Generate (or fetch) a player's weekly assessment — shared by the `game`
// function's on-demand `weekly-review` action and the `cron` Monday tick,
// whichever reaches the new week first. The weekly_reviews table has a unique
// (user_id, week_start), so double invocation cannot double-generate: the
// second caller finds the row and returns it.
//
// Pure aggregation lives in _shared/game/review.ts; the narrative comes from
// _shared/ai.ts. This module is the IO seam between them. Deno-only.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { weekWindow, summarizeWeek } from './game/review.ts';
import { aiAvailable, generateWeeklyReview } from './ai.ts';

export type WeeklyReviewRow = {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  summary: unknown;
  narrative: string;
  generated_at: string;
};

// Discriminated so callers can react precisely: the game action turns no_ai /
// ai_silent into 503 / 502, and cron only pushes on a fresh `created`.
export type WeeklyReviewResult =
  | { status: 'exists'; review: WeeklyReviewRow }
  | { status: 'created'; review: WeeklyReviewRow }
  | { status: 'no_ai' }
  | { status: 'ai_silent' };

async function findReview(
  db: SupabaseClient,
  userId: string,
  weekStart: string,
): Promise<WeeklyReviewRow | null> {
  const { data } = await db
    .from('weekly_reviews')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();
  return (data as WeeklyReviewRow) ?? null;
}

/**
 * Ensure the assessment for the most recently completed Mon–Sun week exists.
 * Idempotent and free: it reports, it never rewards or changes targets.
 */
export async function ensureWeeklyReview(
  db: SupabaseClient,
  userId: string,
  today: string,
): Promise<WeeklyReviewResult> {
  const window = weekWindow(today);

  const existing = await findReview(db, userId, window.start);
  if (existing) return { status: 'exists', review: existing };
  if (!aiAvailable()) return { status: 'no_ai' };

  // shadows / lift PRs are timestamped, not date-keyed — bound by day edges.
  const dayStart = `${window.start}T00:00:00Z`;
  const dayEnd = `${window.end}T23:59:59.999Z`;

  const [quests, sideQuests, sleep, ledger, reading, books, prs, newShadows, metrics, totals] =
    await Promise.all([
      db
        .from('training_quests')
        .select('status, variant, perfect_clear, pushups_done, situps_done, squats_done, run_km_done')
        .eq('user_id', userId)
        .gte('local_date', window.start)
        .lte('local_date', window.end),
      db
        .from('daily_quests')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'completed')
        .gte('local_date', window.start)
        .lte('local_date', window.end),
      db
        .from('sleep_logs')
        .select('hours')
        .eq('user_id', userId)
        .gte('local_date', window.start)
        .lte('local_date', window.end),
      db
        .from('xp_ledger')
        .select('credited')
        .eq('user_id', userId)
        .gte('local_date', window.start)
        .lte('local_date', window.end),
      db
        .from('reading_sessions')
        .select('pages')
        .eq('user_id', userId)
        .gte('local_date', window.start)
        .lte('local_date', window.end),
      db
        .from('books')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'finished')
        .gte('finished_date', window.start)
        .lte('finished_date', window.end),
      db
        .from('system_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('kind', 'lift_pr')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd),
      db
        .from('shadows')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd),
      db
        .from('body_metrics')
        .select('local_date, weight_kg')
        .eq('user_id', userId)
        .gte('local_date', window.start)
        .lte('local_date', window.end)
        .order('local_date', { ascending: true }),
      db.from('training_totals').select('current_streak').eq('user_id', userId).maybeSingle(),
    ]);

  const summary = summarizeWeek({
    window,
    trainingQuests: quests.data ?? [],
    sideQuestsCompleted: sideQuests.count ?? 0,
    sleepLogs: sleep.data ?? [],
    ledger: ledger.data ?? [],
    readingSessions: reading.data ?? [],
    booksFinished: books.count ?? 0,
    liftPrs: prs.count ?? 0,
    newShadows: newShadows.count ?? 0,
    bodyMetrics: metrics.data ?? [],
    streakEnd: totals.data?.current_streak ?? 0,
  });

  const narrative = await generateWeeklyReview(summary);
  if (!narrative) return { status: 'ai_silent' };

  const { data: review, error } = await db
    .from('weekly_reviews')
    .insert({
      user_id: userId,
      week_start: window.start,
      week_end: window.end,
      summary,
      narrative,
    })
    .select('*')
    .single();
  if (error) {
    // A racing caller may have inserted first — return the winner, not an error.
    if (error.code === '23505') {
      const dup = await findReview(db, userId, window.start);
      if (dup) return { status: 'exists', review: dup };
    }
    console.error('weekly_reviews insert failed:', error);
    return { status: 'ai_silent' };
  }

  await db.from('system_messages').insert({
    user_id: userId,
    kind: 'weekly_review',
    title: 'SYSTEM ASSESSMENT — the week has been reviewed.',
    body: 'The System has weighed the week that passed. Read its assessment in your Status.',
    payload: { week_start: window.start },
  });

  return { status: 'created', review: review as WeeklyReviewRow };
}
