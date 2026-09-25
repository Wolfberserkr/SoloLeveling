// Pick-your-session for the Gym Dungeon: the same rules as the Reset portal
// (src/lib/sessionPick.ts) — suggest the split session trained longest ago,
// skip a body region still inside its 48h recovery window, warn softly.
// Runs are no longer expected on fixed weekdays or in a fixed A→B→C→D cycle.
import { SESSION_ORDER, isSessionKind, splitFor, type SessionKind } from '@game/dungeons.ts';
import type { PickOption, TrainedEntry } from '@/lib/sessionPick';

/** A logged dungeon run: which split session, and when it was cleared. */
export type GymRun = { kind: SessionKind; date: string };

/** Map gym_sessions rows to runs. Rows from before session_kind was recorded
 *  (an empty kind) carry no muscle focus, so they cannot inform a suggestion. */
export function gymRunsFrom(rows: unknown): GymRun[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r: { session_kind?: unknown; created_at?: unknown }) =>
    isSessionKind(r.session_kind) && typeof r.created_at === 'string'
      ? [{ kind: r.session_kind, date: r.created_at }]
      : []);
}

/** The four split sessions as pick options, regions from their split. */
export function gymPickOptions(): PickOption[] {
  return SESSION_ORDER.map((k) => ({ id: k, region: splitFor(k) }));
}

export function gymTrained(runs: GymRun[]): TrainedEntry[] {
  return runs.map((r) => ({ id: r.kind, date: r.date }));
}
