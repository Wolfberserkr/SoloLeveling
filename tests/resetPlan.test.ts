import { describe, it, expect } from 'vitest';
import {
  PLAN, RESERVE, RETIRED, SWAPS, INJURY_FLAGS, WEEK_TIPS, TIME_MODEL,
  estimateMinutes, estimateSeconds, setSeconds, repCount,
  exerciseById, isTimedReps, videoSearchUrl, tipForWeek,
  type Day,
} from '../src/features/reset/resetData';

const strengthDays = PLAN.filter((d) => d.kind === 'strength');
const trainingDays = PLAN.filter((d) => d.kind !== 'rest');
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
    for (const d of trainingDays) {
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

  it('keeps both back-squat days moderate and both front-squat days light', () => {
    const [mon, tue, thu, fri] = strengthDays.map(lastEx);
    // Four squat sessions a week only work if none of them is a max effort.
    for (const back of [mon, thu]) {
      expect(back.reps).toBe('6–8 reps');
      expect(back.load).toMatch(/RPE 7/);
      expect(back.load).toMatch(/leave 3 reps/i);
      expect(back.load, 'no "heaviest of the week" framing on a flagged back').not.toMatch(/heaviest/i);
    }
    for (const front of [tue, fri]) {
      expect(front.load).toMatch(/technique/i);
      expect(front.load).toMatch(/light/i);
    }
  });

  it('makes the ramp set real: counted in sets and flagged for the UI', () => {
    for (const d of strengthDays) {
      const squat = lastEx(d);
      expect(squat.ramp, `${squat.id} should declare its ramp set`).toBe(true);
      // 1 ramp + 3 working sets — the checkbox count matches the coaching text.
      expect(squat.sets).toBe(4);
      expect(squat.load).toMatch(/ramp/i);
    }
  });

  it('only ever swaps a squat finisher for another squat pattern', () => {
    for (const d of strengthDays) {
      const alts = SWAPS[lastEx(d).id] ?? [];
      expect(alts.length, `${lastEx(d).id} needs alternatives`).toBeGreaterThan(0);
      for (const altId of alts) {
        // A leg press would silently break the "every day ends on a squat" rule.
        expect(exerciseById(altId)!.name, `${altId} is not a squat`).toMatch(/squat/i);
      }
    }
  });

  it('keeps the four squat slots on distinct ids so their logs stay separate', () => {
    expect(new Set(strengthDays.map((d) => lastEx(d).id)).size).toBe(4);
  });

  it('never finishes on conditioning — the squat is preceded by resistance work', () => {
    for (const d of strengthDays) {
      const beforeSquat = d.ex[d.ex.length - 2];
      expect(beforeSquat.conditioning, `${d.id} must not run intervals into the squat`).toBeFalsy();
    }
  });
});

describe('reset gym plan — the one-hour cap is computed, not asserted', () => {
  it('derives every estMin from estimateMinutes', () => {
    for (const d of trainingDays) expect(d.estMin).toBe(estimateMinutes(d));
    expect(PLAN.find((x) => x.id === 'rest-sun')!.estMin).toBeUndefined();
  });

  it('fits every training day inside the hour at full volume', () => {
    for (const d of trainingDays) {
      expect(estimateMinutes(d), `${d.id} must fit inside an hour`).toBeLessThanOrEqual(60);
    }
  });

  it('still fits at week 8, when the progression is at its longest', () => {
    for (const d of trainingDays) {
      expect(estimateMinutes(d, { week: 8 }), `${d.id} at week 8`).toBeLessThanOrEqual(60);
    }
  });

  it('fits in every week of the eight-week progression', () => {
    for (let week = 1; week <= 8; week++) {
      for (const d of trainingDays) {
        expect(estimateMinutes(d, { week }), `${d.id} at week ${week}`).toBeLessThanOrEqual(60);
      }
    }
  });

  it('models the ramp-in and the deload as genuinely shorter sessions', () => {
    for (const d of strengthDays) {
      expect(estimateMinutes(d, { week: 1 }), `${d.id} week 1`).toBeLessThan(estimateMinutes(d, { week: 2 }));
      expect(estimateMinutes(d, { week: 5 }), `${d.id} week 5 deload`).toBeLessThan(estimateMinutes(d, { week: 4 }));
    }
  });

  it('would fail if the plan grew — the estimate tracks the data', () => {
    const bloated: Day = {
      ...strengthDays[0],
      ex: strengthDays[0].ex.map((e) => ({ ...e, sets: e.sets + 4 })),
    };
    expect(estimateMinutes(bloated)).toBeGreaterThan(60);
  });

  it('prices a set from its reps and tempo, not a flat constant', () => {
    // 15 reps at "2-sec lower, 1-sec squeeze" is a 60-second set, not 45.
    expect(setSeconds({ id: 'x', name: 'x', sets: 3, reps: '12–15 reps', tempo: 4, load: '', video: '' })).toBe(60);
    // Per-side work counts both sides.
    expect(repCount('10 / side')).toBe(20);
    expect(repCount('12–15 reps')).toBe(15);
    expect(repCount('10 total')).toBe(10);
    // A timed prescription runs for its own duration.
    expect(setSeconds({ id: 'x', name: 'x', sets: 5, reps: '40 sec', load: '', video: '' })).toBe(40);
  });

  it('holds the cost coefficients to real floors, not just "greater than zero"', () => {
    const fixed = TIME_MODEL.warmupSec + TIME_MODEL.cooldownSec + TIME_MODEL.contingencySec;
    expect(estimateSeconds(strengthDays[0])).toBeGreaterThan(fixed);
    // Cheapening a coefficient is the easy way to fake the hour, so each one
    // is pinned at the value the model was argued for.
    expect(TIME_MODEL.warmupSec).toBeGreaterThanOrEqual(480);
    expect(TIME_MODEL.cooldownSec).toBeGreaterThanOrEqual(300);
    expect(TIME_MODEL.contingencySec).toBeGreaterThanOrEqual(180);
    expect(TIME_MODEL.logSecPerSet).toBeGreaterThanOrEqual(8);
    expect(TIME_MODEL.stationSec).toBeGreaterThanOrEqual(60);
    expect(TIME_MODEL.supersetStationSec).toBeGreaterThanOrEqual(90);
    expect(TIME_MODEL.rackSec).toBeGreaterThanOrEqual(300);
    expect(TIME_MODEL.barbellHandlingSec).toBeGreaterThanOrEqual(15);
    expect(TIME_MODEL.lymphSec).toBeGreaterThanOrEqual(480);
    expect(TIME_MODEL.transferSec).toBeGreaterThanOrEqual(15);
    expect(TIME_MODEL.densityRestSec).toBeGreaterThanOrEqual(45);
    expect(TIME_MODEL.defaultTempo).toBeGreaterThanOrEqual(3);
    expect(TIME_MODEL.defaultRest).toBeGreaterThanOrEqual(60);
    // The density weeks promise the rest that densityRestSec actually models.
    expect(WEEK_TIPS[5][1]).toContain(`${TIME_MODEL.densityRestSec} sec`);
  });

  it('lets no exercise undercut the station cost with a per-row setup override', () => {
    // `setup` bypasses stationSec entirely, so the floors above mean nothing
    // if a strength move can declare its own cheaper number.
    for (const d of strengthDays) {
      for (const ex of d.ex) {
        if (ex.setup == null) continue;
        const floor = ex.rack ? TIME_MODEL.rackSec
          : ex.pair ? TIME_MODEL.supersetStationSec
          : TIME_MODEL.stationSec;
        expect(ex.setup, `${ex.id} setup must not undercut its station cost`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it('prices the unrack and walkout into a barbell set', () => {
    const bar = { id: 'x', name: 'x', sets: 3, reps: '8 reps', tempo: 4, load: '', video: '' };
    expect(setSeconds({ ...bar, rack: true }) - setSeconds(bar)).toBe(TIME_MODEL.barbellHandlingSec);
  });

  it('rests a superset for its most demanding member', () => {
    const day: Day = {
      id: 'x', name: 'x', focus: 'x', kind: 'strength', ex: [
        { id: 'a', name: 'a', sets: 2, reps: '10 reps', rest: 45, pair: 'P', load: '', video: '' },
        { id: 'b', name: 'b', sets: 2, reps: '10 reps', rest: 90, pair: 'P', load: '', video: '' },
      ],
    };
    const shorter: Day = { ...day, ex: day.ex.map((e) => ({ ...e, rest: 45 })) };
    expect(estimateSeconds(day) - estimateSeconds(shorter)).toBe(45);
  });

  it('gives the rest day no session length at all', () => {
    expect(estimateSeconds(PLAN.find((d) => d.id === 'rest-sun')!)).toBe(0);
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

  it('never swaps a move for something already on the same day', () => {
    for (const d of PLAN) {
      const onDay = new Set(d.ex.map((e) => e.id));
      for (const e of d.ex) {
        for (const altId of SWAPS[e.id] ?? []) {
          expect(onDay.has(altId), `${d.id}: ${e.id} → ${altId} is already in the day`).toBe(false);
        }
      }
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
    const conditioning = planEx.filter((e) => e.conditioning);
    expect(conditioning.length).toBeGreaterThan(0);
    for (const e of conditioning) expect(isTimedReps(e.reps), `${e.id} should log time`).toBe(true);
  });
});

describe('reset gym plan — retired home-program ids', () => {
  it('still resolves a retired id to a named exercise', () => {
    const ex = exerciseById('rdl');
    expect(ex).not.toBeNull();
    expect(ex!.name).toBe('Romanian Deadlift');
    expect(ex!.retired).toBe(true);
  });

  it('resolves every retired id — old PRs and logs must not vanish', () => {
    for (const id of Object.keys(RETIRED)) {
      expect(exerciseById(id)?.retired, `${id} should resolve as retired`).toBe(true);
    }
    // The ids the home program used and this one dropped.
    expect(Object.keys(RETIRED).length).toBeGreaterThanOrEqual(20);
  });

  it('keeps retired moves out of the plan, the reserve pool and the swap menu', () => {
    const live = new Set([...PLAN.flatMap((d) => d.ex.map((e) => e.id)), ...RESERVE.map((r) => r.id)]);
    for (const id of Object.keys(RETIRED)) {
      expect(live.has(id), `${id} must not be programmable`).toBe(false);
      expect(SWAPS[id], `${id} must not offer swaps`).toBeUndefined();
    }
    for (const alts of Object.values(SWAPS)) {
      for (const altId of alts) expect(RETIRED[altId], `${altId} is retired`).toBeUndefined();
    }
  });

  it('leaves an unknown id unresolved', () => {
    expect(exerciseById('not-a-real-exercise')).toBeNull();
  });
});

describe('reset gym plan — fat-loss programming', () => {
  it('runs moderate-to-high reps on the strength days', () => {
    for (const d of strengthDays) {
      for (const e of d.ex) {
        if (isTimedReps(e.reps)) continue;
        expect(repCount(e.reps)!, `${e.id} reps too low for this goal`).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('keeps rest short everywhere except the flagged hinge and the squats', () => {
    for (const d of strengthDays) {
      for (const e of d.ex) {
        const rest = e.rest ?? TIME_MODEL.defaultRest;
        if (e.rack || e.id === 'smith-rdl') expect(rest).toBeGreaterThanOrEqual(75);
        else expect(rest, `${e.id} rest`).toBeLessThanOrEqual(60);
      }
    }
  });

  it('puts a conditioning element in the week, never as the finisher', () => {
    const conditioning = PLAN.flatMap((d) => d.ex).filter((e) => e.conditioning || /jump rope/i.test(e.name));
    expect(conditioning.length).toBeGreaterThanOrEqual(3);
    // Intervals sit straight after the first main machine, not before a squat.
    for (const d of strengthDays) {
      const i = d.ex.findIndex((e) => e.conditioning);
      if (i >= 0) expect(i, `${d.id} runs intervals too late`).toBeLessThanOrEqual(1);
    }
  });

  it('programs anti-extension core on the lower-body days', () => {
    const coreIds = ['dead-bug', 'bird-dog'];
    const lowerDays = ['lower-a', 'lower-b'];
    for (const id of lowerDays) {
      const day = PLAN.find((d) => d.id === id)!;
      expect(day.ex.some((e) => coreIds.includes(e.id)), `${id} needs core work`).toBe(true);
    }
  });

  it('leaves the flagged hinge on straight sets with full rest', () => {
    const rdl = PLAN.find((d) => d.id === 'lower-b')!.ex.find((e) => e.id === 'smith-rdl')!;
    expect(rdl.pair, 'the hinge must not sit in a density superset').toBeUndefined();
    expect(rdl.rest).toBeGreaterThanOrEqual(90);
  });

  it('runs an eight-week progression that never buys volume with time', () => {
    expect(Object.keys(WEEK_TIPS)).toEqual(['1', '3', '5', '7']);
    expect(tipForWeek(2)).toBe(WEEK_TIPS[1]);
    expect(tipForWeek(8)).toBe(WEEK_TIPS[7]);
    expect(tipForWeek(12)).toBe(WEEK_TIPS[7]);
    expect(WEEK_TIPS[1][1]).toMatch(/half the sets/i);   // week 1 ramp-in
    expect(WEEK_TIPS[5][1]).toMatch(/deload/i);          // a real deload week
    // The tip and the model must not drift apart: the numbers she reads are
    // the numbers estimateMinutes() plans for.
    const peak = WEEK_TIPS[7][1];
    expect(peak).toContain(`${TIME_MODEL.peakIntervalRounds} rounds`);
    expect(peak).toContain(`${TIME_MODEL.peakIntervalWorkSec} sec hard`);
    expect(peak).toContain(`${TIME_MODEL.peakIntervalRestSec} sec easy`);
    expect(WEEK_TIPS[5][1]).toContain(`${TIME_MODEL.deloadSets} sets per exercise`);
    // Weeks 7–8 must not make the session longer than the full-volume weeks.
    for (const d of strengthDays) {
      expect(estimateSeconds(d, { week: 8 })).toBeLessThanOrEqual(estimateSeconds(d, { week: 2 }) + 60);
    }
  });
});

describe('reset gym plan — injury flags', () => {
  it('flags only real exercises', () => {
    for (const id of Object.keys(INJURY_FLAGS)) {
      expect(exerciseById(id), `flagged ${id} must exist`).not.toBeNull();
    }
  });

  it('flags every barbell squat, the hinge and the back extension for the lower back', () => {
    const backFlagged = Object.entries(INJURY_FLAGS)
      .filter(([, f]) => f.type === 'back')
      .map(([id]) => id);
    for (const d of strengthDays) expect(backFlagged).toContain(lastEx(d).id);
    expect(backFlagged).toContain('smith-rdl');
    expect(backFlagged).toContain('back-extension');
    expect(backFlagged).toContain('cable-woodchop');
  });

  it('flags the elbow-tendon movements', () => {
    for (const id of ['tri-pushdown', 'cable-curl', 'assisted-pullup']) {
      expect(INJURY_FLAGS[id]?.type, `${id} should carry an elbow flag`).toBe('elbow');
    }
  });
});
