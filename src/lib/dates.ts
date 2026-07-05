// The server keys every daily row off profiles.timezone, not the device
// clock. All client-side "today" math must go through these helpers so a
// traveling (or mis-synced) device agrees with the System about the date.

/** YYYY-MM-DD for `date` in the given IANA timezone (falls back to device). */
export function todayInTz(tz: string | null | undefined, date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

/** Milliseconds until the next local midnight in the given timezone. */
export function msUntilMidnight(tz: string | null | undefined, now: Date = new Date()): number {
  const today = todayInTz(tz, now);
  // Walk forward until the local date changes; hour granularity then binary
  // refinement is overkill — a minute-step scan stays trivially correct
  // across DST because it only ever asks "has the local date flipped?".
  let lo = 0;
  let hi = 36 * 60 * 60 * 1000; // beyond any DST-stretched day
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (todayInTz(tz, new Date(now.getTime() + mid)) === today) lo = mid;
    else hi = mid;
  }
  return hi;
}
