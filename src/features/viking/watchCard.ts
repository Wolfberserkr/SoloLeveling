import type { PlanCurrent } from '../../../supabase/functions/_shared/viking/planner.ts';
import { EXBY, SESS } from './vikingData';
import { RIDES } from './bikePlan';

export type WatchRow = { name: string; rx: string };
export type WatchCard =
  | { none: 'no-plan' | 'rest' }
  | { date: string; kind: 'gym' | 'ride'; title: string; sub: string; rows: WatchRow[]; reason: string | null };

/** The first training day from `today` in Jarvis's plan: the session or ride, its top 3 targets and why it changed. */
export function nextOnWatch(plan: PlanCurrent | null, today: string): WatchCard {
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
