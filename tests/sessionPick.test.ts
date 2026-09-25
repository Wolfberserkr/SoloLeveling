import { describe, it, expect } from 'vitest';
import {
  RECOVERY_HOURS, daysAgoLabel, lastTrainedMap, mostRecent, recoveringHours,
  recoveryWarning, suggestSession, type PickOption, type TrainedEntry,
} from '../src/lib/sessionPick';

const OPTS: PickOption[] = [
  { id: 'lower-a', region: 'lower' },
  { id: 'upper-a', region: 'upper' },
  { id: 'lower-b', region: 'lower' },
  { id: 'upper-b', region: 'upper' },
  { id: 'mob', region: 'mobility' },
];
const NOW = new Date('2026-09-25T18:00:00').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const e = (id: string, h: number): TrainedEntry => ({ id, date: hoursAgo(h) });

describe('sessionPick — history reading', () => {
  it('keeps the latest time per session, whatever the order', () => {
    const m = lastTrainedMap([e('lower-a', 100), e('lower-a', 10), e('upper-a', 50)]);
    expect(m.get('lower-a')).toBe(Date.parse(hoursAgo(10)));
    expect(m.get('upper-a')).toBe(Date.parse(hoursAgo(50)));
  });

  it('finds the most recent workout, or null with no history', () => {
    expect(mostRecent([])).toBeNull();
    expect(mostRecent([e('upper-a', 30), e('lower-b', 5), e('mob', 70)])?.id).toBe('lower-b');
  });

  it('ignores unparseable dates', () => {
    expect(mostRecent([{ id: 'x', date: 'nope' }])).toBeNull();
  });
});

describe('sessionPick — suggestion (longest since trained)', () => {
  it('suggests the first strength session when nothing is logged', () => {
    expect(suggestSession(OPTS, [], NOW)).toBe('lower-a');
  });

  it('prefers a never-trained session over any trained one', () => {
    const h = [e('lower-a', 200), e('upper-a', 150), e('lower-b', 100)];
    expect(suggestSession(OPTS, h, NOW)).toBe('upper-b');
  });

  it('picks the session trained longest ago among recovered regions', () => {
    const h = [e('lower-a', 100), e('upper-a', 200), e('lower-b', 90), e('upper-b', 120)];
    expect(suggestSession(OPTS, h, NOW)).toBe('upper-a');
  });

  it('skips a region still inside the recovery window', () => {
    // upper-a is oldest overall, but upper-b was done 20h ago → upper recovering.
    const h = [e('upper-a', 300), e('lower-a', 100), e('lower-b', 90), e('upper-b', 20)];
    expect(suggestSession(OPTS, h, NOW)).toBe('lower-a');
  });

  it('suggests mobility when every strength region is recovering', () => {
    const h = [e('lower-a', 30), e('upper-b', 5)];
    expect(suggestSession(OPTS, h, NOW)).toBe('mob');
  });

  it('does not count mobility as needing recovery', () => {
    expect(recoveringHours(OPTS, [e('mob', 1)], 'mobility', NOW)).toBeNull();
  });
});

describe('sessionPick — recovery warning', () => {
  it('warns inside the window and names the other region', () => {
    const w = recoveryWarning(OPTS, [e('lower-a', 20)], 'lower-b', NOW);
    expect(w).toMatch(/Lower body was trained/);
    expect(w).toMatch(/consider upper body today/);
  });

  it('is silent once the window has passed', () => {
    expect(recoveryWarning(OPTS, [e('lower-a', RECOVERY_HOURS + 1)], 'lower-b', NOW)).toBeNull();
  });

  it('suggests mobility when both regions are recovering', () => {
    const w = recoveryWarning(OPTS, [e('lower-a', 20), e('upper-a', 10)], 'upper-b', NOW);
    expect(w).toMatch(/consider mobility today/);
  });

  it('never warns for mobility or an unknown id', () => {
    expect(recoveryWarning(OPTS, [e('mob', 1)], 'mob', NOW)).toBeNull();
    expect(recoveryWarning(OPTS, [e('lower-a', 1)], 'nope', NOW)).toBeNull();
  });
});

describe('sessionPick — daysAgoLabel', () => {
  it('counts local calendar days, not 24h blocks', () => {
    const late = new Date('2026-09-24T23:50:00').getTime();
    const early = new Date('2026-09-25T00:10:00').getTime();
    expect(daysAgoLabel(late, early)).toBe('yesterday');
    expect(daysAgoLabel(early, early)).toBe('today');
    expect(daysAgoLabel(new Date('2026-09-22T12:00:00').getTime(), early)).toBe('3 days ago');
  });
});
