import { describe, it, expect, beforeEach } from 'vitest';
import {
  PLAN, RESERVE, exerciseById, weekNote, weekPhase, weekPrescription, estimateSeconds,
  type Exercise, type PhaseKind,
} from '../src/features/reset/resetData';
import { dayCount, resolvedExercise, sessionTally, useResetStore } from '../src/features/reset/resetStore';
import { defaultState, type ResetState } from '../src/features/reset/resetDb';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const legPress = exerciseById('leg-press')!;       // 4 × 12–15
const legCurl = exerciseById('leg-curl-seated')!;  // 3 × 12–15, superset
const squat = exerciseById('back-squat-mon')!;     // 4 × 6–8, ramp
const stairs = exerciseById('stair-intervals')!;   // 5 × 40 sec, conditioning
const strengthDays = PLAN.filter((d) => d.kind === 'strength');
const mobilityDays = PLAN.filter((d) => d.kind === 'mobility');
const strengthEx = strengthDays.flatMap((d) => d.ex);
const at = (week: number, deloadWeeks: number[] = []): ResetState => ({ ...defaultState(), week, deloadWeeks });

// One representative week per phase kind, block 1 and block 2.
const P = {
  rampIn: weekPhase(1),
  load: weekPhase(2),
  density: weekPhase(4),
  peak: weekPhase(5),
  deload: weekPhase(6),
  base2: weekPhase(7),
  load2: weekPhase(8),
  density2: weekPhase(10),
  peak2: weekPhase(11),
  deload2: weekPhase(12),
};

describe('prescription — each phase of the block', () => {
  it('load weeks and a later block\'s base week run exactly as written', () => {
    for (const ph of [P.load, weekPhase(3), P.base2, P.load2, weekPhase(9)]) {
      for (const e of strengthEx) expect(weekPrescription(e, ph, 'strength')).toBe(e);
    }
  });

  it('block 1 week 1 ramp-in: half the sets rounded up, same reps', () => {
    expect(weekPrescription(legPress, P.rampIn, 'strength')).toMatchObject({ sets: 2, reps: '12–15 reps' });
    expect(weekPrescription(legCurl, P.rampIn, 'strength')).toMatchObject({ sets: 2, reps: '12–15 reps' });
    for (const e of strengthEx) expect(weekPrescription(e, P.rampIn, 'strength').sets).toBeGreaterThanOrEqual(1);
  });

  it('density and peak weeks: supersets rest 45 sec, straight sets keep their rest', () => {
    for (const ph of [P.density, P.peak, P.density2, P.peak2]) {
      expect(weekPrescription(legCurl, ph, 'strength').rest).toBe(45);
      expect(weekPrescription(legPress, ph, 'strength')).toBe(legPress);
    }
  });

  it('peak week intervals: 6 rounds of 40 sec with 30 sec easy; density leaves them alone', () => {
    for (const ph of [P.peak, P.peak2]) {
      expect(weekPrescription(stairs, ph, 'strength')).toMatchObject({ sets: 6, reps: '40 sec', rest: 30 });
    }
    expect(weekPrescription(stairs, P.density, 'strength')).toBe(stairs);
  });
});

describe('prescription — the deload', () => {
  it('halves the sets (rounded up, min 1) with the same reps and as-written rests', () => {
    for (const ph of [P.deload, P.deload2, weekPhase(9, [9])]) {
      for (const e of strengthEx) {
        if (e.conditioning) continue;
        const d = weekPrescription(e, ph, 'strength');
        expect(d.sets, e.id).toBe(Math.max(1, Math.ceil(e.sets / 2)));
        expect(d.reps, e.id).toBe(e.reps);
        // No density in a deload: supersets rest as written.
        expect(d.rest, e.id).toBe(e.rest ?? 60);
      }
    }
    expect(weekPrescription(legPress, P.deload, 'strength')).toMatchObject({ sets: 2, reps: '12–15 reps' });
    expect(weekPrescription(legCurl, P.deload, 'strength')).toMatchObject({ sets: 2, rest: 60 });
  });

  it('keeps the squat ramp as set 1: ramp + one working set', () => {
    expect(weekPrescription(squat, P.deload, 'strength')).toMatchObject({ sets: 2, reps: '6–8 reps', ramp: true });
  });

  it('never drops below one set', () => {
    const one: Exercise = { id: 'x', name: 'x', sets: 1, reps: '10 reps', load: '', video: '' };
    expect(weekPrescription(one, P.deload, 'strength').sets).toBe(1);
  });

  it('leaves conditioning exactly as written', () => {
    for (const e of [...strengthEx, ...RESERVE].filter((x) => x.conditioning)) {
      expect(weekPrescription(e, P.deload, 'strength'), e.id).toBe(e);
    }
  });

  it('leaves mobility days completely untouched', () => {
    for (const d of mobilityDays) {
      for (const e of d.ex) expect(weekPrescription(e, P.deload, 'mobility'), e.id).toBe(e);
    }
  });

  it('halves once, not twice, when the ramp-in week is switched to a deload', () => {
    const ph = weekPhase(1, [1]);
    expect(ph).toMatchObject({ kind: 'deload', rampIn: true, manual: true });
    expect(weekPrescription(legPress, ph, 'strength').sets).toBe(2);
    expect(weekPrescription(squat, ph, 'strength').sets).toBe(2);
  });
});

describe('the card note says what the phase changed', () => {
  it('ramp-in, density and peak keep their notes; a plain load week stays quiet', () => {
    expect(weekNote(legPress, P.rampIn, 'strength')).toBe('Week 1 ramp-in: 2 of 4 sets while you learn the machine');
    expect(weekNote(legCurl, P.density, 'strength')).toBe('Density: rest 45 sec after the pair');
    expect(weekNote(stairs, P.peak, 'strength')).toBe('Peak week: 6 rounds of 40 sec hard / 30 sec easy');
    expect(weekNote(legPress, P.load, 'strength')).toBeNull();
    expect(weekNote(legPress, P.load2, 'strength', 40)).toBeNull();
  });

  it('deload: sets and a kg aim from her recent best', () => {
    expect(weekNote(legPress, P.deload, 'strength', 40))
      .toBe('Deload: 2 of 4 sets · ~65% weight, aim 25 kg (recent best 40 kg)');
    expect(weekNote(squat, P.deload2, 'strength', 50))
      .toBe('Deload: 2 of 4 sets · ~65% weight, aim 32.5 kg (recent best 50 kg)');
  });

  it('deload with nothing logged: plain effort advice', () => {
    expect(weekNote(legPress, P.deload, 'strength', null))
      .toBe('Deload: 2 of 4 sets · easy effort, RPE 5–6, 4+ reps in the tank');
  });

  it('new block: a start weight from her recent best, or plain advice', () => {
    expect(weekNote(legPress, P.base2, 'strength', 40)).toBe('New block: start at 42.5 kg (recent best 40 kg)');
    expect(weekNote(legPress, P.base2, 'strength', null)).toBe('New block: go a little heavier than last block');
    // Block 1 week 1 is the ramp-in, not a heavier start.
    expect(weekNote(legPress, P.rampIn, 'strength', 40)).not.toMatch(/New block/);
  });

  it('never gives a bodyweight move a kg target', () => {
    const deadBug = exerciseById('dead-bug')!;
    expect(weekNote(deadBug, P.deload, 'strength', 20))
      .toBe('Deload: 2 of 3 sets · easy effort, RPE 5–6, 4+ reps in the tank');
    expect(weekNote(deadBug, P.base2, 'strength', 20)).toBe('New block: go a little heavier than last block');
    expect(weekNote(exerciseById('pushup')!, P.deload, 'strength', 30)).not.toMatch(/kg/);
  });

  it('talks assistance, never kg, on an assisted machine', () => {
    for (const id of ['assisted-pullup', 'dip-machine']) {
      const e = exerciseById(id)!;
      expect(weekNote(e, P.deload, 'strength', 30)).toBe('Deload: 2 of 3 sets · use a bit more assistance');
      expect(weekNote(e, P.base2, 'strength', 30)).toBe('New block: take a little less assistance than last block');
    }
  });

  it('gives timed holds a sets note only, and intervals no deload note at all', () => {
    expect(weekNote(exerciseById('plank')!, P.deload, 'strength', 10)).toBe('Deload: 2 of 3 sets');
    expect(weekNote(exerciseById('plank')!, P.base2, 'strength', 10)).toBeNull();
    expect(weekNote(stairs, P.deload, 'strength', 10)).toBeNull();
    expect(weekNote(stairs, P.base2, 'strength', 10)).toBeNull();
  });

  it('says nothing on a mobility day in a deload or a new block', () => {
    for (const d of mobilityDays) {
      for (const e of d.ex) {
        expect(weekNote(e, P.deload, 'mobility', 20), e.id).toBeNull();
        expect(weekNote(e, P.base2, 'mobility', 20), e.id).toBeNull();
      }
    }
  });

  it('writes no em dash into any phase note she reads', () => {
    const phases = Object.values(P);
    for (const d of PLAN) {
      for (const e of [...d.ex, ...RESERVE]) {
        for (const ph of phases) {
          for (const best of [null, 40]) {
            const n = weekNote(e, ph, d.kind, best);
            if (n) expect(n, `${e.id} ${ph.kind}`).not.toContain('—');
          }
        }
      }
    }
  });
});

describe('the day follows the phase automatically', () => {
  beforeEach(() => {
    store.clear();
    useResetStore.setState({ uid: 'u', ready: true, s: at(10) });
  });

  it('a deload day asks for half the sets in the boxes, ring and log', () => {
    const s = at(12);
    expect(resolvedExercise(s, 'lower-a', 'leg-press').sets).toBe(2);
    const day = PLAN.find((d) => d.id === 'lower-a')!;
    expect(dayCount(s, 'lower-a').total).toBe(day.ex.reduce((a, e) => a + Math.ceil(e.sets / 2), 0));
    const t = sessionTally(s, 'lower-a');
    expect(t.exercises.find((e) => e.slot_id === 'leg-press')).toMatchObject({ sets_total: 2, prescribe: '12–15 reps' });
  });

  it('a mobility day runs full sets in a deload', () => {
    const s = at(12);
    const day = PLAN.find((d) => d.id === 'mobility-wed')!;
    expect(dayCount(s, 'mobility-wed').total).toBe(day.ex.reduce((a, e) => a + e.sets, 0));
  });

  it('a manual deload resizes the day exactly like a scheduled one', () => {
    expect(resolvedExercise(at(9, [9]), 'lower-a', 'leg-press').sets).toBe(2);
    expect(resolvedExercise(at(9), 'lower-a', 'leg-press').sets).toBe(4);
  });

  it('a swapped exercise is deloaded too', () => {
    const s = { ...at(12), swaps: { 'lower-a': { 'leg-press': 'hack-squat' } } };
    expect(resolvedExercise(s, 'lower-a', 'leg-press')).toMatchObject({ id: 'hack-squat', sets: 2 });
  });

  it('boxes, ring, logged totals and the time estimate agree in every phase kind', () => {
    const kinds = new Set<PhaseKind>();
    for (let week = 1; week <= 13; week++) {
      const s = at(week);
      const ph = weekPhase(week);
      kinds.add(ph.kind);
      for (const d of PLAN.filter((x) => x.kind !== 'rest')) {
        const fromRule = d.ex.reduce((a, e) => a + weekPrescription(e, ph, d.kind).sets, 0);
        expect(dayCount(s, d.id).total, `${d.id} wk ${week}`).toBe(fromRule);
        expect(sessionTally(s, d.id).total, `${d.id} wk ${week}`).toBe(fromRule);
      }
    }
    expect([...kinds].sort()).toEqual(['base', 'deload', 'density', 'load', 'peak']);
    // The estimate costs the same prescription: a deload day is shorter.
    for (const d of strengthDays) {
      expect(estimateSeconds(d, { phase: P.deload2 })).toBeLessThan(estimateSeconds(d, { phase: P.load2 }));
    }
  });

  it('stepping into the deload re-sizes a day in progress, keeping ticks that fit', () => {
    useResetStore.setState({ uid: 'u', ready: true, s: at(11) });
    const st = useResetStore.getState();
    [0, 1, 2].forEach((i) => st.toggleSet('lower-a', 'leg-press', i));
    useResetStore.getState().bumpWeek(1); // 11 → 12: block 2 deload
    const s = useResetStore.getState().s;
    expect(s.progress['lower-a']['leg-press']).toEqual([true, true]);
    expect(dayCount(s, 'lower-a').done).toBe(2);
    useResetStore.getState().bumpWeek(1); // 12 → 13: new block, full sets, nothing invented
    expect(useResetStore.getState().s.progress['lower-a']['leg-press']).toEqual([true, true, false, false]);
  });
});
