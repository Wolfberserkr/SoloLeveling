// Timezone-aware local date helpers (Deno/Node/browser safe — uses Intl only).

/** Returns YYYY-MM-DD for `date` in the given IANA timezone. */
export function localDateInTz(tz: string, date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date); // en-CA gives YYYY-MM-DD
}

/** An unknown IANA name would throw in Intl and 500 every action — fall back. */
function safeTz(tz: string): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** YYYY-MM-DD of the day before `localDate` (a YYYY-MM-DD string). */
export function previousDate(localDate: string): string {
  const d = new Date(`${localDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD of the Monday starting the ISO week containing `localDate`. */
export function startOfIsoWeek(localDate: string): string {
  const d = new Date(`${localDate}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

/** Local hour (0-23) right now in the given timezone. */
export function localHourInTz(tz: string, date: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz(tz),
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(fmt.format(date), 10) % 24;
}
