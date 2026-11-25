// Project Viking — the Telegram recap of an import, its confirm buttons and the
// suggestion buttons. Pure: no Node, Deno or DOM APIs. Copy is Telegram HTML.
import { SESS, type SessionKey } from './data.ts';
import { dayOfSession } from './bikeLogic.ts';
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

export function recapText(
  r: ImportResult, before: Record<string, Progress>, after: Record<string, Progress>, realigned: boolean,
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
      + `Reply e.g. "${e.ex} ${e.sets.length}×${reps + 1}" if you did more.`);
  }
  if (realigned) lines.push(`🔄 Cycle moved: ${SESS[r.session].n} is day ${dayOfSession(r.session)}, so the plan carries on from there.`);
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
  return [[{ text: `✅ Reset to ${s.kg} kg`, data: `vk:${s.id}:ok` }, { text: '✖️ Not now', data: `vk:${s.id}:no` }]];
}

export function notVikingText(name: string, date: string): string {
  return `Garmin strength “${escapeHtml(name)}” on ${garminDate(date)} didn't look like a Viking session, so I left it out.`;
}

export function poisonText(date: string): string {
  return `Couldn't read the Garmin session of ${garminDate(date)}. Send me the sets, e.g. 'Lower A today: squat 3×5 at 110', or ignore this.`;
}
