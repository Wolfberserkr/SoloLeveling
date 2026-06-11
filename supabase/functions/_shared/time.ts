// Timezone-aware local date helpers (Deno/Node/browser safe — uses Intl only).

/** Returns YYYY-MM-DD for `date` in the given IANA timezone. */
export function localDateInTz(tz: string, date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date); // en-CA gives YYYY-MM-DD
}

/** YYYY-MM-DD of the day before `localDate` (a YYYY-MM-DD string). */
export function previousDate(localDate: string): string {
  const d = new Date(`${localDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Local hour (0-23) right now in the given timezone. */
export function localHourInTz(tz: string, date: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || 'UTC',
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(fmt.format(date), 10) % 24;
}
