// Pick-your-own-session helpers, shared by the Reset portal and the RPG Gym
// Dungeon. Training no longer follows fixed weekdays: the player picks what to
// train today, and the app only *suggests* — the session trained longest ago —
// and warns (softly, never blocks) when the same body region is still inside
// its recovery window. Pure: every function takes its clock as an argument.

/** Body region a session loads. Sessions sharing a region share recovery. */
export type Region = 'upper' | 'lower' | 'mobility';

export type PickOption = { id: string; region: Region };

/** One logged workout: which session, and when (ISO timestamp). */
export type TrainedEntry = { id: string; date: string };

/** How long a region counts as "still recovering" after it was trained. */
export const RECOVERY_HOURS = 48;
const HOUR = 3_600_000;

/** Latest timestamp (ms) each session id was trained, from any-order history. */
export function lastTrainedMap(history: TrainedEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const h of history) {
    const t = Date.parse(h.date);
    if (Number.isNaN(t)) continue;
    if (t > (out.get(h.id) ?? -Infinity)) out.set(h.id, t);
  }
  return out;
}

/** The most recent workout of all, or null before the first one. */
export function mostRecent(history: TrainedEntry[]): TrainedEntry | null {
  let best: TrainedEntry | null = null;
  let bestT = -Infinity;
  for (const h of history) {
    const t = Date.parse(h.date);
    if (!Number.isNaN(t) && t > bestT) { best = h; bestT = t; }
  }
  return best;
}

/** Latest time (ms) any session of `region` was trained, or null. */
export function regionLastTrained(
  options: PickOption[], history: TrainedEntry[], region: Region,
): number | null {
  const ids = new Set(options.filter((o) => o.region === region).map((o) => o.id));
  let best: number | null = null;
  for (const [id, t] of lastTrainedMap(history)) {
    if (ids.has(id) && (best == null || t > best)) best = t;
  }
  return best;
}

/** Hours since `region` was last trained while still inside the recovery
 *  window, or null when it is recovered (or never trained). Mobility never
 *  needs recovery — it is the thing you do while the rest recovers. */
export function recoveringHours(
  options: PickOption[], history: TrainedEntry[], region: Region, now: number,
): number | null {
  if (region === 'mobility') return null;
  const last = regionLastTrained(options, history, region);
  if (last == null) return null;
  const hrs = (now - last) / HOUR;
  return hrs >= 0 && hrs < RECOVERY_HOURS ? hrs : null;
}

/** Today's suggestion: the strength session trained longest ago (never
 *  trained counts as longest; ties keep list order), skipping any whose
 *  region is still recovering. If every strength region is recovering, the
 *  suggestion is a mobility session — or null when there is none. */
export function suggestSession(
  options: PickOption[], history: TrainedEntry[], now: number,
): string | null {
  const last = lastTrainedMap(history);
  const strength = options.filter((o) => o.region !== 'mobility');
  const byOldest = (list: PickOption[]) =>
    [...list].sort((a, b) => (last.get(a.id) ?? -Infinity) - (last.get(b.id) ?? -Infinity));
  const ready = strength.filter((o) => recoveringHours(options, history, o.region, now) == null);
  if (ready.length) return byOldest(ready)[0].id;
  const mobility = options.filter((o) => o.region === 'mobility');
  if (mobility.length) return byOldest(mobility)[0].id;
  return strength.length ? byOldest(strength)[0].id : null;
}

/** "today" / "yesterday" / "3 days ago" — whole local calendar days between
 *  the two instants, so 23:50 → 00:10 already reads "yesterday". */
export function daysAgoLabel(then: number, now: number): string {
  const a = new Date(then); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  const days = Math.round((+b - +a) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export const REGION_LABEL: Record<Region, string> = {
  upper: 'Upper body',
  lower: 'Lower body',
  mobility: 'Mobility',
};

/** The soft 48h warning shown when a recovering region is picked, or null. */
export function recoveryWarning(
  options: PickOption[], history: TrainedEntry[], pickedId: string, now: number,
): string | null {
  const picked = options.find((o) => o.id === pickedId);
  if (!picked) return null;
  const hrs = recoveringHours(options, history, picked.region, now);
  if (hrs == null) return null;
  const when = daysAgoLabel(now - hrs * HOUR, now);
  const other: Region = picked.region === 'upper' ? 'lower' : 'upper';
  const otherFree = recoveringHours(options, history, other, now) == null;
  const tip = otherFree ? ` — consider ${REGION_LABEL[other].toLowerCase()} today` : ' — consider mobility today';
  return `${REGION_LABEL[picked.region]} was trained ${when} (under ${RECOVERY_HOURS}h)${tip}.`;
}
