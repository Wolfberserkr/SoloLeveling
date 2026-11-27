import { describe, expect, it } from 'vitest';
import { nextOnWatch } from '@/features/viking/watchCard';
import type { PlanCurrent, PlanDay } from '../supabase/functions/_shared/viking/planner.ts';

const t = (kg: number | null, reps: number, sets: number, extra: Record<string, unknown> = {}) =>
  ({ kg, reps, sets, note: '', stalled: false, lastTop: null, repsUnknown: false, ...extra });

function plan(days: PlanDay[], over: Partial<PlanCurrent> = {}): PlanCurrent {
  return {
    builtAt: '2026-11-27T10:00:00Z', date: '2026-11-27', week: 7, phase: '1', deload: false, cycleDay: 4,
    hash: 'h', days, suggestions: [], ...over,
  };
}

describe('next on your watch', () => {
  it('says Jarvis has no plan yet when there is none', () => {
    expect(nextOnWatch(null, '2026-11-27')).toEqual({ none: 'no-plan' });
  });

  it('shows the first training day from today, the top 3 targets in session order', () => {
    const p = plan([
      { date: '2026-11-26', cycleDay: 3, kind: 'ride', ride: { code: 'E1', minutes: 60 } },
      { date: '2026-11-27', cycleDay: 4, kind: 'rest' },
      {
        date: '2026-11-28', cycleDay: 4, kind: 'gym', session: 'UB',
        // stored out of session order on purpose (jsonb reorders keys)
        targets: { scrow: t(87.5, 10, 3), pullup: t(null, 7, 3, { assistKg: 20 }), incbb: t(60, 9, 3), mpress: t(60, 11, 3) },
      },
    ]);
    expect(nextOnWatch(p, '2026-11-27')).toEqual({
      date: '2026-11-28', kind: 'gym', title: 'Upper B', sub: 'Size · shoulders, arms, traps',
      rows: [
        { name: 'Incline barbell / Smith press', rx: '60 kg · 3 × 9' },
        { name: 'Pull-up (assisted is fine)', rx: 'assist 20 kg · 3 × 7' },
        { name: 'Machine shoulder press', rx: '60 kg · 3 × 11' },
      ],
      reason: null,
    });
  });

  it('words metres and bodyweight moves', () => {
    const p = plan([{
      date: '2026-11-27', cycleDay: 2, kind: 'gym', session: 'LA', reason: 'Deload week',
      targets: { farmer: t(24, 40, 2), squat: t(110, 5, 2), crunch: t(0, 15, 2) },
    }]);
    const c = nextOnWatch(p, '2026-11-27');
    expect(c).toMatchObject({ title: 'Lower A', sub: 'Squat focus + core', reason: 'Deload week' });
    expect('rows' in c && c.rows).toEqual([
      { name: 'Back squat / hack squat', rx: '110 kg · 2 × 5' },
      { name: 'Cable crunch', rx: '2 × 15' },
      { name: "Farmer's carry", rx: '24 kg · 2 × 40 m' },
    ]);
  });

  it('shows a swapped ride with its reason', () => {
    const p = plan([{
      date: '2026-11-27', cycleDay: 3, kind: 'ride', reason: 'hard-ride cap: 1 in the last 8 days',
      ride: { code: 'E1', from: 'H1', minutes: 60 },
    }]);
    expect(nextOnWatch(p, '2026-11-27')).toEqual({
      date: '2026-11-27', kind: 'ride', title: 'Endurance', sub: 'E1 · 60 min', rows: [],
      reason: 'H1 Hill repeats → E1: hard-ride cap: 1 in the last 8 days',
    });
  });

  it('says rest when every planned day ahead is rest', () => {
    const p = plan([{ date: '2026-11-27', cycleDay: 8, kind: 'rest' }, { date: '2026-11-25', cycleDay: 2, kind: 'gym', session: 'LA' }]);
    expect(nextOnWatch(p, '2026-11-27')).toEqual({ none: 'rest' });
  });
});
