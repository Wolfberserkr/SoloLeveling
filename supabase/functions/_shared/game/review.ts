// ─────────────────────────────────────────────────────────────────────────────
// review — PHASE 10: the AI System Coach. Pure week-summary math.
//
// The edge function fetches a week's raw rows; this aggregates them into a
// structured ReviewSummary, and _shared/ai.ts turns that summary into the
// System's prose. No IO, no AI, no Deno here — keep it pure and unit-tested,
// the way every other game/ module is. First slice: read-only summary, no
// adaptive targets.
// ─────────────────────────────────────────────────────────────────────────────

export type WeekWindow = { start: string; end: string };

/**
 * The Monday–Sunday ISO week most recently *completed* before `today`
 * (a YYYY-MM-DD string). Reviews look back at the week that just ended, so the
 * window is always seven full days and stable for a given calendar week — which
 * makes one-review-per-week idempotency trivial (key on `start`).
 */
export function weekWindow(today: string): WeekWindow {
  const thisMonday = startOfWeek(today);
  const end = shiftDays(thisMonday, -1); // last Sunday
  const start = startOfWeek(end); // that Sunday's Monday
  return { start, end };
}

// Only the fields the summary actually reads — callers pass DB rows directly.
export type ReviewTrainingQuest = {
  status: string;
  variant?: string | null;
  perfect_clear?: boolean | null;
  pushups_done: number;
  situps_done: number;
  squats_done: number;
  run_km_done: number | string;
};
export type ReviewSleepLog = { hours: number | string };
export type ReviewLedgerEntry = { credited: number };
export type ReviewReadingSession = { pages: number };
export type ReviewBodyMetric = { local_date: string; weight_kg: number | null };

export type ReviewInput = {
  window: WeekWindow;
  trainingQuests: ReviewTrainingQuest[];
  sideQuestsCompleted: number;
  sleepLogs: ReviewSleepLog[];
  ledger: ReviewLedgerEntry[];
  readingSessions: ReviewReadingSession[];
  booksFinished: number;
  liftPrs: number;
  newShadows: number;
  /** Sorted ascending by local_date; weight may be null on a given reading. */
  bodyMetrics: ReviewBodyMetric[];
  streakEnd: number;
};

export type ReviewSummary = {
  weekStart: string;
  weekEnd: string;
  daysCompleted: number;
  daysFailed: number;
  recoveryDays: number;
  perfectClears: number;
  pushups: number;
  situps: number;
  squats: number;
  runKm: number;
  sideQuestsCompleted: number;
  nightsLogged: number;
  avgSleepHours: number; // 0 when no nights were logged
  xpEarned: number;
  pagesRead: number;
  booksFinished: number;
  liftPrs: number;
  newShadows: number;
  /** last − first logged weight within the window, or null if < 2 readings. */
  weightChangeKg: number | null;
  streakEnd: number;
  /** True when nothing measurable happened — lets the narrator change tone. */
  quiet: boolean;
  /** Adaptive target tuning for the week ahead; set by the coach, not summarizeWeek. */
  load?: LoadAdjustment;
};

// ── Adaptive targets (AI System Coach) ──────────────────────────────────────
// The Daily Training Quest already scales with level and dungeon cycles. On top
// of that, the coach nudges a persistent per-player load multiplier once a week:
// a strong, well-recovered week earns progressive overload; a rough or
// under-recovered one earns a deload. Bounded and gentle — it ratchets in small
// steps and can never run away.
export const ADAPT_LOAD_MAX = 1.5;
export const ADAPT_LOAD_MIN = 0.7;
export const ADAPT_PROGRESS_STEP = 0.05;
export const ADAPT_DELOAD_STEP = 0.1;

export type LoadReason = 'progress' | 'deload' | 'hold';
export type LoadAdjustment = {
  before: number;
  after: number;
  delta: number;
  reason: LoadReason;
};

export function clampLoad(load: number): number {
  const n = Number(load);
  if (!Number.isFinite(n)) return 1;
  return round2(Math.min(ADAPT_LOAD_MAX, Math.max(ADAPT_LOAD_MIN, n)));
}

/**
 * Decide next week's load multiplier from the week just summarized and the
 * current multiplier. Pure: the caller persists `after` and re-feeds it next
 * week. The reason is derived from the *actual* change, so a move blocked by a
 * cap reports 'hold'.
 */
export function adaptiveLoad(summary: ReviewSummary, currentLoad: number): LoadAdjustment {
  const before = clampLoad(currentLoad);
  const decide = (target: number): LoadAdjustment => {
    const after = clampLoad(target);
    const reason: LoadReason = after > before ? 'progress' : after < before ? 'deload' : 'hold';
    return { before, after, delta: round2(after - before), reason };
  };

  const trainingDays = summary.daysCompleted + summary.daysFailed;
  // Too little signal (a quiet/new/sparse week): hold steady, never punish.
  if (summary.quiet || trainingDays < 3) return decide(before);

  const underRecovered = summary.nightsLogged >= 3 && summary.avgSleepHours < 5.5;
  const rough =
    summary.daysFailed >= 3 ||
    (summary.daysCompleted <= 2 && summary.daysFailed >= 1) ||
    underRecovered;
  if (rough) return decide(before - ADAPT_DELOAD_STEP);

  // Strong only counts non-recovery days: a week of light recovery isn't overload.
  const hardDaysCompleted = summary.daysCompleted - summary.recoveryDays;
  const wellRecovered = summary.nightsLogged === 0 || summary.avgSleepHours >= 6.5;
  const strong = hardDaysCompleted >= 6 && summary.daysFailed === 0 && wellRecovered;
  if (strong) return decide(before + ADAPT_PROGRESS_STEP);

  return decide(before);
}

const num = (v: number | string): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function summarizeWeek(input: ReviewInput): ReviewSummary {
  let daysCompleted = 0;
  let daysFailed = 0;
  let recoveryDays = 0;
  let perfectClears = 0;
  let pushups = 0;
  let situps = 0;
  let squats = 0;
  let runKm = 0;

  for (const q of input.trainingQuests) {
    if (q.status === 'completed') {
      daysCompleted += 1;
      if (q.variant === 'recovery') recoveryDays += 1;
      if (q.perfect_clear) perfectClears += 1;
      pushups += num(q.pushups_done);
      situps += num(q.situps_done);
      squats += num(q.squats_done);
      runKm += num(q.run_km_done);
    } else if (q.status === 'failed') {
      daysFailed += 1;
    }
  }

  const nightsLogged = input.sleepLogs.length;
  const sleepTotal = input.sleepLogs.reduce((s, l) => s + num(l.hours), 0);
  const avgSleepHours = nightsLogged > 0 ? round1(sleepTotal / nightsLogged) : 0;

  const xpEarned = input.ledger.reduce((s, e) => s + num(e.credited), 0);
  const pagesRead = input.readingSessions.reduce((s, r) => s + num(r.pages), 0);

  const weights = input.bodyMetrics
    .map((m) => m.weight_kg)
    .filter((w): w is number => typeof w === 'number' && Number.isFinite(w));
  const weightChangeKg =
    weights.length >= 2 ? round1(weights[weights.length - 1] - weights[0]) : null;

  const quiet =
    daysCompleted === 0 &&
    input.sideQuestsCompleted === 0 &&
    xpEarned === 0 &&
    pagesRead === 0 &&
    input.booksFinished === 0 &&
    input.liftPrs === 0 &&
    nightsLogged === 0;

  return {
    weekStart: input.window.start,
    weekEnd: input.window.end,
    daysCompleted,
    daysFailed,
    recoveryDays,
    perfectClears,
    pushups,
    situps,
    squats,
    runKm: round2(runKm),
    sideQuestsCompleted: input.sideQuestsCompleted,
    nightsLogged,
    avgSleepHours,
    xpEarned,
    pagesRead,
    booksFinished: input.booksFinished,
    liftPrs: input.liftPrs,
    newShadows: input.newShadows,
    weightChangeKg,
    streakEnd: input.streakEnd,
    quiet,
  };
}

// ── pure date helpers (UTC-noon anchored, like the other game/ modules) ──────
function startOfWeek(localDate: string): string {
  const d = new Date(`${localDate}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function shiftDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;
