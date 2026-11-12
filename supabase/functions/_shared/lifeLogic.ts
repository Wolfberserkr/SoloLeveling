// ═════════════════════════════════════════════════════════════════════════
// lifeLogic — the Life Assistant's rules as pure functions.
//
// No Deno, no network, no clock: every function takes `now`/dates as
// arguments so the edge function and tests/life.test.ts share one copy.
//   • money     — quick-log parsing, AWG normalisation, budgets, bill dues
//   • time      — timezone-safe local ↔ UTC conversion
//   • day plan  — sleep / wake / nap / briefing / training window per shift
//   • nudges    — wind-down, steps, bills, budgets
// ═════════════════════════════════════════════════════════════════════════

// ── Money ────────────────────────────────────────────────────────────────

/** Fixed rates into AWG. The florin is pegged to the dollar at 1.79. */
export const AWG_RATES: Record<string, number> = { AWG: 1, USD: 1.79 };

export function toAwgMinor(amountMinor: number, currency: string): number | null {
  const rate = AWG_RATES[currency.toUpperCase()];
  return rate === undefined ? null : Math.round(amountMinor * rate);
}

export function formatMoney(minor: number, currency = 'AWG'): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor) / 100;
  const sym = currency === 'USD' ? '$' : currency === 'AWG' ? 'ƒ' : `${currency} `;
  return `${sign}${sym}${abs.toFixed(2)}`;
}

/** Keyword → category. First match wins; keep specific words above generic ones. */
export const CATEGORY_KEYWORDS: Array<[string, string[]]> = [
  ['groceries', ['grocery', 'groceries', 'supermarket', 'ling & sons', 'superfood', 'price smart', 'pricesmart', 'kong hing', 'certified']],
  ['dining', ['lunch', 'dinner', 'breakfast', 'restaurant', 'coffee', 'cafe', 'pizza', 'burger', 'snack', 'takeout', 'kfc', 'mcdonald', 'subway']],
  ['fuel', ['gas', 'fuel', 'petrol', 'valero', 'texaco', 'esso']],
  ['transport', ['taxi', 'uber', 'bus', 'parking', 'car wash', 'tire', 'mechanic']],
  ['subscriptions', ['netflix', 'spotify', 'disney', 'youtube', 'icloud', 'google one', 'strava', 'garmin connect', 'chatgpt', 'claude', 'prime', 'subscription']],
  ['utilities', ['electric', 'elmar', 'water', 'web aruba', 'internet', 'setar', 'digicel', 'phone bill', 'utility']],
  ['housing', ['rent', 'mortgage', 'hoa']],
  ['health', ['pharmacy', 'botica', 'doctor', 'dentist', 'supplement', 'protein', 'creatine', 'gym', 'physio']],
  ['training', ['bike', 'cycling', 'shoes', 'chain', 'tube', 'helmet']],
  ['shopping', ['amazon', 'shein', 'temu', 'clothes', 'shopping', 'store']],
  ['fun', ['movie', 'cinema', 'bar', 'beer', 'drinks', 'party', 'concert', 'game']],
  ['family', ['gift', 'birthday', 'kids', 'school']],
  ['insurance', ['insurance', 'ennia', 'fatum', 'nagico']],
  ['income', ['salary', 'payroll', 'paycheck', 'refund', 'bonus', 'tips']],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Words start on a boundary; short ones (≤ 4 chars) must also end on one,
// so "gas" doesn't match "vegas" and "bar" doesn't match "barber".
const KEYWORD_RES: Array<[string, RegExp[]]> = CATEGORY_KEYWORDS.map(([cat, words]) => [
  cat,
  words.map((w) => new RegExp(`\\b${escapeRe(w)}${w.length <= 4 ? '\\b' : ''}`, 'i')),
]);

export function categorise(text: string): string {
  for (const [cat, res] of KEYWORD_RES) {
    if (res.some((re) => re.test(text))) return cat;
  }
  return 'uncategorised';
}

export type QuickLog = {
  amountMinor: number;   // negative = spend, positive = income
  currency: 'AWG' | 'USD';
  description: string;
  category: string;
};

/**
 * Parse a one-line spend from Telegram: "25 lunch", "$12.50 netflix",
 * "usd 40 gas", "40usd gas", "afl 30 groceries", "+2500 salary".
 * Returns null when the line isn't a money entry, so the bot can hand it
 * to the conversational path instead.
 */
/**
 * Only trust the regex on its own when the line is unmistakably money:
 * a currency marker, a sign, or a known category. "3 things to do today"
 * parses but goes to the conversational path instead.
 */
export function isConfidentQuickLog(input: string, q: QuickLog | null): q is QuickLog {
  if (!q) return false;
  if (/^\s*[+-]|\$|ƒ|\b(usd|awg|afl|fl)\b/i.test(input)) return true;
  return q.category !== 'uncategorised';
}

export function parseQuickLog(input: string): QuickLog | null {
  const s = input.trim();
  const m = s.match(
    /^([+-])?\s*(\$|ƒ|usd|awg|afl|fl)?\s*(\d{1,7}(?:[.,]\d{1,2})?)\s*(\$|usd|awg|afl|fl)?(?=\s|$)\s*(.*)$/i,
  );
  if (!m) return null;
  const [, sign, pre, num, post, rest] = m;
  const description = rest.trim();
  if (!description) return null; // a bare number is too ambiguous to log
  const cur = (pre ?? post ?? '').toLowerCase();
  const currency: 'AWG' | 'USD' = cur === '$' || cur === 'usd' ? 'USD' : 'AWG';
  const value = Math.round(parseFloat(num.replace(',', '.')) * 100);
  if (!Number.isFinite(value) || value <= 0) return null;
  let category = categorise(description);
  const income = sign === '+' || category === 'income';
  if (sign === '+' && category === 'uncategorised') category = 'income';
  return { amountMinor: income ? value : -value, currency, description, category };
}

export type BudgetLevel = 'ok' | 'warn' | 'over';
export function budgetStatus(spentMinor: number, limitMinor: number): { pct: number; level: BudgetLevel } {
  const pct = limitMinor > 0 ? Math.round((spentMinor / limitMinor) * 100) : 0;
  return { pct, level: pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok' };
}

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'once';

/** Next due date after a payment. Month-end dates clamp (31 Jan → 28/29 Feb). */
export function advanceDue(isoDate: string, cadence: Cadence): string | null {
  if (cadence === 'once') return null;
  const [y, mo, d] = isoDate.split('-').map(Number);
  if (cadence === 'weekly') {
    const t = new Date(Date.UTC(y, mo - 1, d + 7));
    return t.toISOString().slice(0, 10);
  }
  const add = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : 12;
  const target = new Date(Date.UTC(y, mo - 1 + add, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);
}

// ── Time ─────────────────────────────────────────────────────────────────

export function safeTz(tz: unknown, fallback = 'America/Aruba'): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: String(tz) });
    return String(tz);
  } catch {
    return fallback;
  }
}

export type LocalParts = { date: string; hour: number; minute: number; weekday: number };

export function localParts(at: Date, tz: string): LocalParts {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at).map((x) => [x.type, x.value]),
  );
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, hour: Number(p.hour), minute: Number(p.minute), weekday: new Date(`${date}T12:00:00Z`).getUTCDay() };
}

/** Offset of `tz` from UTC at instant `at`, in minutes (Aruba → -240). */
function tzOffsetMin(at: Date, tz: string): number {
  const lp = localParts(at, tz);
  const asUtc = Date.UTC(+lp.date.slice(0, 4), +lp.date.slice(5, 7) - 1, +lp.date.slice(8, 10), lp.hour, lp.minute);
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** The UTC instant of local wall-clock `hhmm` on local date `isoDate` in `tz`. */
export function zonedTime(isoDate: string, hhmm: string, tz: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const guess = Date.UTC(+isoDate.slice(0, 4), +isoDate.slice(5, 7) - 1, +isoDate.slice(8, 10), h, m);
  const off1 = tzOffsetMin(new Date(guess), tz);
  const first = guess - off1 * 60000;
  const off2 = tzOffsetMin(new Date(first), tz); // re-check across a DST edge
  return new Date(guess - off2 * 60000);
}

export function addDays(isoDate: string, n: number): string {
  const t = new Date(`${isoDate}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export function hhmm(at: Date, tz: string): string {
  const lp = localParts(at, tz);
  return `${String(lp.hour).padStart(2, '0')}:${String(lp.minute).padStart(2, '0')}`;
}

const MIN = 60000;
const HOUR = 60 * MIN;

// ── Day plan ─────────────────────────────────────────────────────────────

export type ShiftKind = 'morning' | 'mid' | 'night';
export type Shift = { id?: string; startsAt: Date; endsAt: Date; label?: string };

export type LifePrefs = {
  sleepHours: number;       // target main sleep
  prepMinutes: number;      // wake → leave for a shift
  offDayWake: string;       // HH:MM
  offDayBriefing: string;   // HH:MM
  windDownMinutes: number;
  stepTarget: number;
};
export const DEFAULT_PREFS: LifePrefs = {
  sleepHours: 8, prepMinutes: 90, offDayWake: '07:30', offDayBriefing: '08:30', windDownMinutes: 45, stepTarget: 10000,
};
export function readPrefs(raw: unknown): LifePrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (k: keyof LifePrefs, lo: number, hi: number) => {
    const v = Number(r[k]);
    return Number.isFinite(v) && v >= lo && v <= hi ? v : (DEFAULT_PREFS[k] as number);
  };
  const time = (k: keyof LifePrefs) => (typeof r[k] === 'string' && /^\d{2}:\d{2}$/.test(r[k] as string) ? (r[k] as string) : (DEFAULT_PREFS[k] as string));
  return {
    sleepHours: num('sleepHours', 5, 10), prepMinutes: num('prepMinutes', 20, 240),
    offDayWake: time('offDayWake'), offDayBriefing: time('offDayBriefing'),
    windDownMinutes: num('windDownMinutes', 0, 180), stepTarget: num('stepTarget', 1000, 40000),
  };
}

/** Classify by local start hour, matching the bike plan's three shifts
 *  (Morning 05–14, Mid 13–22, Night 21–05). */
export function shiftKind(startsAt: Date, tz: string): ShiftKind {
  const h = localParts(startsAt, tz).hour;
  if (h >= 3 && h < 11) return 'morning';
  if (h >= 11 && h < 19) return 'mid';
  return 'night';
}

export type DayPlan = {
  date: string;
  kind: ShiftKind | 'off';
  shift?: Shift;
  wakeAt: Date;
  bedAt: Date;          // bedtime that precedes wakeAt
  napFrom?: Date;
  napTo?: Date;
  briefingAt: Date;
  trainWindow: string;  // human text, local time
  notes: string[];
};

/**
 * Plan local date `date`: when to sleep (the night before), wake, nap,
 * get the briefing, and train. `shift` is the shift that STARTS on `date`
 * (if any); `prevShift` is the most recent shift ending before it.
 */
export function planDay(date: string, shift: Shift | undefined, prevShift: Shift | undefined, prefs: LifePrefs, tz: string): DayPlan {
  const sleepMs = prefs.sleepHours * HOUR;
  const notes: string[] = [];
  // A shift that ended in the small hours of `date` (a night shift, or a
  // mid running late) pushes the main sleep into the morning.
  const prevEndLocal = prevShift ? localParts(prevShift.endsAt, tz) : null;
  const cameOffNight = !!prevShift && prevEndLocal!.date === date && prevEndLocal!.hour >= 3 && prevEndLocal!.hour < 11;
  const cameOffLate = !!prevShift && !cameOffNight &&
    prevShift.endsAt.getTime() > zonedTime(addDays(date, -1), '20:00', tz).getTime() &&
    prevShift.endsAt.getTime() <= zonedTime(date, '03:00', tz).getTime();

  if (!shift) {
    if (cameOffNight) {
      // Coming off nights: an anchor sleep straight after, then back to normal.
      const bedAt = new Date(prevShift!.endsAt.getTime() + 60 * MIN);
      const wakeAt = new Date(bedAt.getTime() + Math.min(sleepMs, 5 * HOUR));
      notes.push('Anchor sleep after the night shift, then an early night to reset.');
      return { date, kind: 'off', wakeAt, bedAt, briefingAt: new Date(wakeAt.getTime() + HOUR), trainWindow: 'Late afternoon, easy only (Z1–Z2)', notes };
    }
    const wakeAt = zonedTime(date, prefs.offDayWake, tz);
    const bedAt = new Date(wakeAt.getTime() - sleepMs);
    return { date, kind: 'off', wakeAt, bedAt, briefingAt: zonedTime(date, prefs.offDayBriefing, tz), trainWindow: '06:30–10:30 (avoid 11:00–16:00 heat)', notes };
  }

  const kind = shiftKind(shift.startsAt, tz);
  const start = shift.startsAt.getTime();

  if (kind === 'morning') {
    const wakeAt = new Date(start - prefs.prepMinutes * MIN);
    const bedAt = new Date(wakeAt.getTime() - sleepMs);
    const briefingAt = new Date(Math.min(wakeAt.getTime() + HOUR, start - 30 * MIN));
    const end = hhmm(new Date(shift.endsAt.getTime() + 2.5 * HOUR), tz);
    const endTo = hhmm(new Date(shift.endsAt.getTime() + 4.5 * HOUR), tz);
    notes.push('Eat after the shift, before riding.');
    return { date, kind, shift, wakeAt, bedAt, briefingAt, trainWindow: `${end}–${endTo}`, notes };
  }

  if (kind === 'mid') {
    let bedAt: Date, wakeAt: Date;
    if (cameOffLate || cameOffNight) {
      bedAt = new Date(prevShift!.endsAt.getTime() + 90 * MIN);
      wakeAt = new Date(bedAt.getTime() + sleepMs);
    } else {
      wakeAt = zonedTime(date, prefs.offDayWake, tz);
      bedAt = new Date(wakeAt.getTime() - sleepMs);
    }
    const latestWake = start - prefs.prepMinutes * MIN - 2 * HOUR;
    if (wakeAt.getTime() > latestWake) wakeAt = new Date(latestWake);
    const from = hhmm(new Date(wakeAt.getTime() + 30 * MIN), tz);
    notes.push('Small snack before riding.');
    return { date, kind, shift, wakeAt, bedAt, briefingAt: new Date(wakeAt.getTime() + HOUR), trainWindow: `${from}–11:00`, notes };
  }

  // Night shift.
  if (cameOffNight) {
    // Back-to-back nights: sleep straight after the last one, nap optional.
    const bedAt = new Date(prevShift!.endsAt.getTime() + 60 * MIN);
    const wakeAt = new Date(bedAt.getTime() + Math.max(sleepMs - HOUR, 6 * HOUR));
    notes.push('Back-to-back nights: protect the morning sleep (dark, cool, phone on silent).');
    return { date, kind, shift, wakeAt, bedAt, briefingAt: new Date(wakeAt.getTime() + HOUR), trainWindow: 'Late afternoon after sleep, easy only', notes };
  }
  const wakeAt = zonedTime(date, prefs.offDayWake, tz);
  const bedAt = new Date(wakeAt.getTime() - sleepMs);
  const napFrom = new Date(start - 6 * HOUR);
  const napTo = new Date(start - 3.5 * HOUR);
  notes.push('First night: nap in the afternoon. Never ride hard straight off a night shift.');
  return { date, kind, shift, wakeAt, bedAt, napFrom, napTo, briefingAt: new Date(wakeAt.getTime() + HOUR), trainWindow: '07:00–10:30, before the nap', notes };
}

// ── Nudges ───────────────────────────────────────────────────────────────

/** True when `now` falls in [at, at + slackMin). The tick runs every minute;
 *  slack keeps a missed tick from costing the nudge. Dedupe happens in the DB. */
export function isDue(at: Date, now: Date, slackMin = 20): boolean {
  const d = now.getTime() - at.getTime();
  return d >= 0 && d < slackMin * MIN;
}

export function windDownAt(plan: DayPlan, prefs: LifePrefs): Date {
  return new Date(plan.bedAt.getTime() - prefs.windDownMinutes * MIN);
}

/** "You're short on steps" — only in the evening, only when well short,
 *  never on a day you're at work during the evening. */
export function stepsNudge(steps: number | undefined, target: number, localHour: number, workingEvening: boolean): string | null {
  if (steps === undefined || workingEvening || localHour < 17 || localHour > 20) return null;
  const short = target - steps;
  if (steps >= target * 0.6 || short <= 0) return null;
  return `You're at ${steps.toLocaleString('en-US')} steps, ${short.toLocaleString('en-US')} short of ${target.toLocaleString('en-US')}. A 30-minute walk covers about 3,500.`;
}

export type BillLite = { name: string; next_due: string; amount_minor: number | null; currency: string; autopay: boolean };
/** Bills to flag today: due in 3 days or tomorrow, or overdue (not autopay). */
export function billsToFlag(bills: BillLite[], today: string): Array<BillLite & { days: number }> {
  return bills
    .map((b) => ({ ...b, days: daysBetween(today, b.next_due) }))
    .filter((b) => b.days === 3 || b.days === 1 || b.days === 0 || (b.days < 0 && !b.autopay))
    .sort((a, b) => a.days - b.days);
}

// ── Claude API spend ────────────────────────────────────────────────────

/** List prices in $ per million tokens. Cache writes are the 5-minute TTL
 *  (1.25 × input), which is what the bot's cache_control uses. */
export const MODEL_RATES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export type TokenUsage = { input: number; output: number; cacheRead: number; cacheWrite: number };

/** Cost in micro-dollars ($ per million tokens × tokens = µ$). Unknown models
 *  are priced as Opus 5.5 so a new model never shows as free. */
export function apiCostMicros(u: TokenUsage, model: string): number {
  const r = MODEL_RATES[model] ?? MODEL_RATES['claude-opus-5-5'];
  return Math.round(u.input * r.in + u.output * r.out + u.cacheRead * r.cacheRead + u.cacheWrite * r.cacheWrite);
}

export type ApiUsageSummary = { yesterdayMsgs: number; yesterdayUsd: number; monthMsgs: number; monthUsd: number; budgetUsd: number; month: string };

/** One briefing line, e.g. "🤖 Jarvis API: yesterday 14 msgs · $0.38 · Nov so far $2.10 of $10 (21%)". */
export function apiUsageLine(s: ApiUsageSummary): string {
  const usd = (n: number) => `$${Number(n).toFixed(2)}`;
  const budget = Number(s.budgetUsd);
  const pct = budget > 0 ? Math.round((Number(s.monthUsd) / budget) * 100) : 0;
  const yesterday = Number(s.yesterdayMsgs) ? `yesterday ${s.yesterdayMsgs} msg${Number(s.yesterdayMsgs) === 1 ? '' : 's'} · ${usd(s.yesterdayUsd)}` : 'no chat yesterday';
  const warn = pct >= 100 ? ' 🔴' : pct >= 80 ? ' 🟠' : '';
  return `🤖 Jarvis API: ${yesterday} · ${s.month} so far ${usd(s.monthUsd)} of $${budget % 1 ? budget.toFixed(2) : budget} (${pct}%)${warn}`;
}

/** Telegram HTML needs only these three escaped. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
