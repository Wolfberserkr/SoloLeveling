import { getAdminSupabase } from './supabase/admin';

// All "today"/"yesterday" computations in the app run through these helpers
// so the date rollover honours each user's local timezone (stored on
// profiles.timezone, set by TimezoneSync on first dashboard load).

export async function getUserTz(userId: string): Promise<string> {
  const sb = getAdminSupabase();
  const { data } = await sb
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle();
  return (data?.timezone as string) || 'UTC';
}

// en-CA locale outputs YYYY-MM-DD natively.
export function dateInTz(tz: string, when: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(when);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(when);
  }
}

export function todayInTz(tz: string): string {
  return dateInTz(tz);
}

export function yesterdayInTz(tz: string): string {
  return dateInTz(tz, new Date(Date.now() - 86400000));
}

// 0 = Sun, 1 = Mon, ... 6 = Sat — in the user's timezone.
export function dayOfWeekInTz(tz: string): number {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(new Date());
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
}

// Loose validation — Intl will throw on totally bogus strings, but we don't
// want to ship every IANA name in a regex.
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string' || tz.length > 80) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
