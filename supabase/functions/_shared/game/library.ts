// ─────────────────────────────────────────────────────────────────────────────
// LIBRARY — Phase 4. The intellect engine: Read → Reflect → Apply → Retain.
//
// Books are tomes. A reading session is one entry per tome per day: it costs
// mana (MANA_COSTS.reading) and pays XP scaled by pages. Writing a real
// reflection alongside it pays a bonus. Applying an insight — one concrete
// action taken because of the book — pays again. Retention is the long game:
// while reading, the Player banks their own questions; the System re-asks
// them on a spaced-repetition schedule, and honest recall pays XP until the
// question is mastered. Finishing a tome is a one-shot, cap-exempt clear.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_ACTIVE_BOOKS = 10;
export const MAX_QUESTIONS_PER_BOOK = 20;
export const MAX_SESSION_PAGES = 500;
export const MIN_BOOK_PAGES = 10;
export const MAX_BOOK_PAGES = 5000;

/** A reflection must be a real paragraph, not a checkbox, to earn its bonus. */
export const MIN_REFLECTION_CHARS = 80;
/** An applied insight must be described concretely. */
export const MIN_APPLICATION_CHARS = 10;

// Reading XP: ~0.8 XP per page, floored so a short honest session still pays
// and capped so a marathon can't drain the whole daily cap in one log.
export const READING_XP_MIN = 10;
export const READING_XP_MAX = 50;

export function readingXp(pages: number): number {
  return Math.max(READING_XP_MIN, Math.min(READING_XP_MAX, Math.round(pages * 0.8)));
}

// Finishing a tome: one-shot per book, cap-exempt (like a boss clear).
// Thicker books pay more — 200 pages ≈ 50 XP, 600+ pages caps at 150.
export const BOOK_FINISH_XP_MIN = 50;
export const BOOK_FINISH_XP_MAX = 150;

export function bookFinishXp(totalPages: number): number {
  return Math.max(BOOK_FINISH_XP_MIN, Math.min(BOOK_FINISH_XP_MAX, Math.round(totalPages / 4)));
}

export function isBookFinished(pagesRead: number, totalPages: number): boolean {
  return pagesRead >= totalPages;
}

// ── Retention schedule ───────────────────────────────────────────────────────
// Days until the next check, indexed by stage (= consecutive successful
// recalls). A banked question first surfaces the next day; each pass pushes
// it further out; passing the final stage masters it. A failed recall sends
// it back to the start of the ladder.

export const RETENTION_INTERVALS = [1, 3, 7, 14, 30] as const;

/** YYYY-MM-DD that is `days` after `localDate` (a YYYY-MM-DD string). */
export function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A freshly banked question is first tested tomorrow. */
export function initialDueDate(today: string): string {
  return addDays(today, RETENTION_INTERVALS[0]);
}

export type ReviewOutcome = {
  stage: number;
  /** Null once mastered — the System stops asking. */
  dueDate: string | null;
  mastered: boolean;
};

/** Resolve one knowledge check: honest recall climbs, a lapse resets. */
export function reviewOutcome(stage: number, recalled: boolean, today: string): ReviewOutcome {
  if (!recalled) {
    return { stage: 0, dueDate: addDays(today, RETENTION_INTERVALS[0]), mastered: false };
  }
  const next = stage + 1;
  if (next >= RETENTION_INTERVALS.length) {
    return { stage: next, dueDate: null, mastered: true };
  }
  return { stage: next, dueDate: addDays(today, RETENTION_INTERVALS[next]), mastered: false };
}
