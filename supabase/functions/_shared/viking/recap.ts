// Project Viking — the Telegram recap of an import, its confirm and skip
// buttons, the swap messages and the suggestion buttons. Pure: no Node, Deno
// or DOM APIs. Copy is Telegram HTML.
import { SESS, type SessionKey } from './data.ts';
import { cycleDay } from './bikeLogic.ts';
import { garminDate, type StrengthTarget } from './garmin.ts';
import { assumptionsFor, shortName, type ImportResult } from './garminImport.ts';
import type { VikingData, WorkoutDoc } from './logic.ts';
import type { Progress } from './targets.ts';
import type { Suggestion } from './weekly.ts';
import { escapeHtml } from '../lifeLogic.ts';

/** Structurally the same as life-bot's telegram.ts Keyboard. */
export type Keyboard = Array<Array<{ text: string; data: string }>>;

const MAX_ROWS = 4;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const repsAssumed = (e: WorkoutDoc['entries'][number]) => e.sets.some((s) => s.est?.includes('reps'));

/** The ImportResult a retry rebuilds from the stored doc: same assumption builder as the import. */
export function resultFromDoc(
  doc: WorkoutDoc, docId: string, session: SessionKey, planned: Record<string, StrengthTarget> | null,
  D: VikingData, dropped: number,
): ImportResult {
  const assumptions = assumptionsFor(doc, planned, D);
  if (dropped > 0) assumptions.push(`${dropped} unrecognised set${dropped === 1 ? '' : 's'} left out`);
  return { session, docId, doc, assumptions, dropped, merged: false };
}

/** A cycle day's name: its gym session, else what the day is for. */
export function dayName(n: number): string {
  const cd = cycleDay(n);
  if (cd.gym) return SESS[cd.gym].n;
  if (!cd.ride.length) return 'Rest day';
  if (!cd.note) return 'Ride';
  return /ride/i.test(cd.note) ? cd.note : `${cd.note} ride`;
}

/** "A", "A and B", "A, B and C", "A, B, C and 2 more". */
function dayNames(days: number[]): string {
  const n = days.map(dayName);
  if (n.length > 3) return `${n.slice(0, 3).join(', ')} and ${n.length - 3} more`;
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n.join('');
}

/** A gym session done early: the first day it passed and where that day goes now. */
export function swapLine(early: number[], to: string): string {
  return `↔️ Swapped: ${dayName(early[0])} moves to ${to}.`;
}

/** A session on a day already done this lap started a new one. */
export function newLapLine(sk: SessionKey, passed: number[]): string {
  const head = `🔄 New lap: ${SESS[sk].n} started it`;
  return passed.length ? `${head}, so ${dayNames(passed)} ${passed.length === 1 ? 'was' : 'were'} passed.` : `${head}.`;
}

/** A ride on a gym day that counted as a ride day of the lap. */
export function rideSwapText(date: string, gym: SessionKey, day: number): string {
  const g = SESS[gym].n;
  return `↔️ You rode on ${garminDate(date)} instead of ${g}: the ride counts as day ${day}, and ${g} is next.`;
}

/** One skip button per passed day (at most 3), plus "all" from two days.
 *  `ref` is the activity id, or `r<date>` for a ride swap. */
export function skipKeyboard(ref: string, days: number[]): Keyboard | null {
  if (!days.length) return null;
  return [
    ...days.slice(0, 3).map((d) => [{ text: `✖️ Skip ${dayName(d)}`, data: `vks:${ref}:${d}` }]),
    ...(days.length >= 2 ? [[{ text: '✖️ Skip all', data: `vks:${ref}:all` }]] : []),
  ];
}

/** `swap`: the open days a session done early passed, and where the first one
 *  is planned now. `newLap`: the days passed when the session started a new lap. */
export function recapText(
  r: ImportResult, before: Record<string, Progress>, after: Record<string, Progress>,
  swap: { early: number[]; to: string } | null, newLap: number[] | null,
): string {
  const lines = [`🏋️ <b>${SESS[r.session].n} saved</b> · ${garminDate(r.doc.date)}`];
  for (const a of r.assumptions) lines.push(`• ${escapeHtml(a)}`);

  const up: string[] = [];
  for (const ex of SESS[r.session].ex) {
    const b = before[ex.k]?.kg, a = after[ex.k]?.kg;
    if (b != null && a != null && a > b) up.push(`${shortName(ex.k)} ${b}→${a} kg`);
  }
  if (up.length) lines.push(`Next time: ${up.slice(0, MAX_ROWS).join(', ')}`);

  const unknown = r.doc.entries.filter((e) => repsAssumed(e) || after[e.ex]?.repsUnknown);
  if (unknown.length) {
    const e = unknown[0];
    const reps = e.sets.find((s) => s.est?.includes('reps'))?.reps ?? after[e.ex]?.reps ?? 5;
    lines.push(`Reps weren't counted on ${plural(unknown.length, 'exercise')}, so their targets stay. `
      + `Reply e.g. "${shortName(e.ex)} ${e.sets.length}×${reps + 1}" if you did more.`);
  }
  if (swap?.early.length) lines.push(swapLine(swap.early, swap.to));
  if (newLap) lines.push(newLapLine(r.session, newLap));
  return lines.join('\n');
}

/** One button per exercise with assumed reps (at most 4), then "all". Null when nothing was assumed. */
export function confirmKeyboard(r: ImportResult, activityId: string): Keyboard | null {
  const exs = r.doc.entries.filter(repsAssumed).map((e) => e.ex);
  if (!exs.length) return null;
  return [
    ...exs.slice(0, MAX_ROWS).map((ex) => [{ text: `✅ ${shortName(ex)} as planned`, data: `vr:${activityId}:${ex}` }]),
    [{ text: '✅ All as planned', data: `vr:${activityId}:all` }],
  ];
}

/** A message's keyboard as Telegram returns it in `reply_markup`. */
export type TgRows = Array<Array<{ text?: string; callback_data?: string }>>;

/** The rows left after a confirm (`vr:`) or skip (`vks:`) tap. Each family
 *  (kind plus activity) takes only its own rows: an "all" tap every row of
 *  its family, any other tap just its row. [] means settle the message. */
export function rowsAfterTap(rows: TgRows | undefined, data: string): TgRows {
  const cut = data.lastIndexOf(':');
  const family = data.slice(0, cut + 1), all = data.slice(cut + 1) === 'all';
  return (rows ?? []).filter((row) => !row.some((b) =>
    b.callback_data === data || (all && !!b.callback_data?.startsWith(family))));
}

/** The owner confirmed the planned reps: they count as recorded from now on. */
export function confirmReps(doc: WorkoutDoc, ex: string | 'all'): WorkoutDoc {
  return {
    ...doc,
    entries: doc.entries.map((e) => (ex !== 'all' && e.ex !== ex ? e : {
      ...e,
      sets: e.sets.map((s) => {
        if (!s.est) return s;
        const est = s.est.filter((x) => x !== 'reps');
        const { est: _drop, ...rest } = s;
        return est.length ? { ...rest, est } : rest;
      }),
    })),
  };
}

export function suggestionText(s: Suggestion): string {
  const n = escapeHtml(shortName(s.ex));
  return `📉 <b>${n}</b> has stalled. Reset ${n} to ${s.kg} kg and build back?`;
}

export function suggestionKeyboard(s: Suggestion): Keyboard {
  return [[{ text: '✅ Reset', data: `vk:${s.id}:ok` }, { text: '✖️ Keep pushing', data: `vk:${s.id}:no` }]];
}

export function notVikingText(name: string, date: string): string {
  return `Garmin strength “${escapeHtml(name)}” on ${garminDate(date)} didn't look like a Viking session, so I left it out.`;
}

export function poisonText(date: string): string {
  return `Couldn't read the Garmin session of ${garminDate(date)}. Send me the sets, e.g. 'Lower A today: squat 3×5 at 110', or ignore this.`;
}
