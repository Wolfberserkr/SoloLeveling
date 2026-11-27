import type { PlanCurrent } from '../../../supabase/functions/_shared/viking/planner.ts';
import { EXBY, SESS } from './vikingData';
import { RIDES } from './bikePlan';

export type WatchRow = { name: string; rx: string };
export type WatchCard =
  | { none: 'no-plan' | 'rest' | 'offline' }
  | { date: string; kind: 'gym' | 'ride'; title: string; sub: string; rows: WatchRow[]; reason: string | null };

/** What the card knows: undefined while the first load is in flight, 'offline' when it failed with
 *  nothing loaded yet, null when Jarvis has no plan. */
export type PlanState = PlanCurrent | null | undefined | 'offline';

/** Fold one load of `plan/current` into the card's state. A failed reload keeps the last plan. */
export function nextPlanState(prev: PlanState, res: { data: unknown; error: unknown }): PlanState {
  if (res.error) return prev === undefined || prev === 'offline' ? 'offline' : prev;
  return ((res.data as { data?: PlanCurrent } | null)?.data) ?? null;
}

/** The first training day from `today` in Jarvis's plan: the session or ride, its top 3 targets and why it changed. */
export function nextOnWatch(plan: PlanCurrent | null | 'offline', today: string): WatchCard {
  if (plan === 'offline') return { none: 'offline' };
  if (!plan?.days) return { none: 'no-plan' };
  const d = plan.days.find((x) => x.date >= today && x.kind !== 'rest');
  if (!d) return { none: 'rest' };
  if (d.kind === 'ride' && d.ride) {
    const { code, from, minutes } = d.ride;
    const why = d.ride.reason ?? d.reason ?? null;
    return {
      date: d.date, kind: 'ride', title: RIDES[code]?.n ?? code, sub: `${code} · ${minutes} min`, rows: [],
      reason: from ? `${from} ${RIDES[from]?.n ?? ''} → ${code}${why ? `: ${why}` : ''}` : why,
    };
  }
  const s = d.session ? SESS[d.session] : null;
  const tg = d.targets ?? {};
  const rows = (s?.ex ?? []).filter((e) => tg[e.k]).slice(0, 3).map((e) => {
    const x = tg[e.k];
    const load = x.assistKg != null && x.assistKg > 0 ? `assist ${x.assistKg} kg · ` : x.kg != null && x.kg > 0 ? `${x.kg} kg · ` : '';
    return { name: EXBY[e.k]?.n ?? e.k, rx: `${load}${x.sets} × ${x.reps}${e.u === 'm' ? ' m' : ''}` };
  });
  return { date: d.date, kind: 'gym', title: s?.n ?? 'Gym', sub: s?.sub ?? '', rows, reason: d.reason ?? null };
}
