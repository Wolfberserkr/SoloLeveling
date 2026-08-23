import { describe, it, expect } from 'vitest';
import {
  PLAN, RESERVE, SWAPS, INJURY_FLAGS, WEEK_TIPS,
  exerciseById, isTimedReps, videoSearchUrl, tipForWeek,
  type Day,
} from '../src/features/reset/resetData';

const strengthDays = PLAN.filter((d) => d.kind === 'strength');
const lastEx = (d: Day) => d.ex[d.ex.length - 1];

describe('reset gym plan — week shape', () => {
  it('is a Mon→Sun week of seven days with the frozen day ids', () => {
    // Logged history and the back-nav / session-edit tests key off these ids.
    expect(PLAN.map((d) => d.id)).toEqual([
      'lower-a', 'upper-a', 'mobility-wed', 'lower-b', 'upper-b', 'mobility-sat', 'rest-sun',
    ]);
    expect(PLAN.map((d) => d.dow)).toEqual([
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    ]);
  });

  it('trains Mon/Tue/Thu/Fri, does mobility Wed/Sat and rests Sunday', () => {
    const byKind = (k: string) => PLAN.filter((d) => d.kind === k).map((d) => d.dow);
    expect(byKind('strength')).toEqual(['Monday', 'Tuesday', 'Thursday', 'Friday']);
    expect(byKind('mobility')).toEqual(['Wednesday', 'Saturday']);
    expect(byKind('rest')).toEqual(['Sunday']);
    expect(PLAN).toHaveLength(7);
  });

  it('gives every training day exercises and the rest day none', () => {
    for (const d of PLAN.filter((x) => x.kind !== 'rest')) {
      expect(d.ex.length, `${d.id} should have exercises`).toBeGreaterThan(0);
    }
    expect(PLAN.find((d) => d.id === 'rest-sun')!.ex).toHaveLength(0);
  });
});

describe('reset gym plan — squat finisher', () => {
  it('ends every strength day on a squat', () => {
    expect(strengthDays).toHaveLength(4);
    for (const d of strengthDays) {
      expect(lastEx(d).name, `${d.id} must finish on a squat`).toMatch(/squat/i);
    }
  });

  it('alternates back → front → back → front across Mon→Fri', () => {
    expect(strengthDays.map((d) => lastEx(d).name)).toEqual([
      'Barbell Back Squat',
      'Barbell Front Squat',
      'Barbell Back Squat',
      'Barbell Front Squat',
    ]);
  });

  it('programs the lower-day squats heavier than the upper-day technique squats', () => {
    const [mon, tue, thu, fri] = strengthDays.map(lastEx);
    // Lower days: low reps, heavy intent. Upper days: light, explicitly technique.
    expect(mon.load).toMatch(/heavy/i);
    expect(thu.load).toMatch(/heav/i);
    expect(tue.load).toMatch(/technique/i);
    expect(fri.load).toMatch(/technique/i);
    expect(tue.load).toMatch(/light/i);
    expect(fri.load).toMatch(/light/i);
  });

  it('keeps the four squat slots on distinct ids so their logs stay separate', () => {
    const ids = strengthDays.map((d) => lastEx(d).id);
    expect(new Set(ids).size).toBe(4);
  });
});

describe('reset gym plan — one-hour cap', () => {
  it('gives every training day an estimated duration inside the hour', () => {
    for (const d of PLAN.filter((x) => x.kind !== 'rest')) {
      expect(d.estMin, `${d.id} needs an estimate`).toBeGreaterThan(0);
      expect(d.estMin!, `${d.id} must fit inside an hour`).toBeLessThanOrEqual(60);
    }
  });

  it('caps every strength day at 60 minutes', () => {
    for (const d of strengthDays) {
      expect(d.estMin!, `${d.id} must fit inside an hour`).toBeLessThanOrEqual(60);
    }
  });

  it('leaves the rest day without a duration', () => {
    expect(PLAN.find((d) => d.id === 'rest-sun')!.estMin).toBeUndefined();
  });
});

describe('reset gym plan — exercise catalog', () => {
  const planEx = PLAN.flatMap((d) => d.ex);

  it('uses a unique id for every plan exercise', () => {
    const ids = planEx.map((e) => e.id);
    expect(new Set(ids).size, 'duplicate plan exercise id').toBe(ids.length);
  });

  it('never collides a reserve id with a plan id', () => {
    const planIds = new Set(planEx.map((e) => e.id));
    for (const r of RESERVE) expect(planIds.has(r.id), `${r.id} collides with a plan id`).toBe(false);
    expect(new Set(RESERVE.map((r) => r.id)).size).toBe(RESERVE.length);
  });

  it('resolves every plan and reserve id through exerciseById', () => {
    for (const e of [...planEx, ...RESERVE]) expect(exerciseById(e.id)?.id).toBe(e.id);
  });

  it('gives every exercise real sets, reps and a coaching load cue', () => {
    for (const e of [...planEx, ...RESERVE]) {
      expect(e.sets, `${e.id} sets`).toBeGreaterThan(0);
      expect(e.reps.trim(), `${e.id} reps`).not.toBe('');
      expect(e.load.trim().length, `${e.id} needs a real load cue`).toBeGreaterThan(20);
    }
  });

  it('offers a busy-machine alternative for every plan exercise', () => {
    for (const e of planEx) {
      expect(SWAPS[e.id]?.length, `${e.id} needs swap alternatives`).toBeGreaterThan(0);
      expect(SWAPS[e.id], `${e.id} should not swap to itself`).not.toContain(e.id);
    }
  });

  it('ships no invented video urls — only verified ones or an empty string', () => {
    // YouTube is unverifiable from CI, so new gym moves carry '' and the UI
    // offers a search link instead of embedding a guess.
    for (const e of [...planEx, ...RESERVE]) {
      if (e.video === '') continue;
      expect(e.video, `${e.id} video`).toMatch(/^https:\/\/(youtu\.be|www\.youtube\.com|vimeo\.com)\//);
    }
  });

  it('builds a YouTube search link for an exercise with no demo saved', () => {
    expect(videoSearchUrl('Hip Thrust Machine'))
      .toBe('https://www.youtube.com/results?search_query=Hip%20Thrust%20Machine%20proper%20form');
  });

  it('marks interval and hold work as timed so it logs a duration', () => {
    const conditioning = planEx.filter((e) => /intervals/i.test(e.name));
    expect(conditioning.length).toBeGreaterThan(0);
    for (const e of conditioning) expect(isTimedReps(e.reps), `${e.id} should log time`).toBe(true);
  });
});

describe('reset gym plan — fat-loss programming', () => {
  it('runs moderate-to-high reps on the strength days', () => {
    for (const d of strengthDays) {
      for (const e of d.ex) {
        if (isTimedReps(e.reps)) continue;
        const top = Math.max(...(e.reps.match(/\d+/g) ?? ['0']).map(Number));
        expect(top, `${e.id} reps too low for this goal`).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('puts a conditioning element in the week', () => {
    const conditioning = PLAN.flatMap((d) => d.ex).filter((e) => /intervals|jump rope/i.test(e.name));
    expect(conditioning.length).toBeGreaterThanOrEqual(3);
  });

  it('runs an eight-week progression of week tips', () => {
    expect(Object.keys(WEEK_TIPS)).toEqual(['1', '3', '5', '7']);
    expect(tipForWeek(2)).toBe(WEEK_TIPS[1]);
    expect(tipForWeek(8)).toBe(WEEK_TIPS[7]);
    expect(tipForWeek(12)).toBe(WEEK_TIPS[7]);
  });
});

describe('reset gym plan — injury flags', () => {
  it('flags only real exercises', () => {
    for (const id of Object.keys(INJURY_FLAGS)) {
      expect(exerciseById(id), `flagged ${id} must exist`).not.toBeNull();
    }
  });

  it('flags every barbell squat and the hinge for the lower back', () => {
    const backFlagged = Object.entries(INJURY_FLAGS)
      .filter(([, f]) => f.type === 'back')
      .map(([id]) => id);
    for (const d of strengthDays) expect(backFlagged).toContain(lastEx(d).id);
    expect(backFlagged).toContain('smith-rdl');
    expect(backFlagged).toContain('back-extension');
  });

  it('flags the elbow-tendon movements', () => {
    for (const id of ['tri-pushdown', 'cable-curl', 'assisted-pullup']) {
      expect(INJURY_FLAGS[id]?.type, `${id} should carry an elbow flag`).toBe('elbow');
    }
  });
});
