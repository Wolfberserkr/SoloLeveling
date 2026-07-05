import { describe, expect, it } from 'vitest';
import {
  focusXp,
  focusKeysPerDay,
  isFocusDuration,
  normalizeMobs,
  FOCUS_DURATIONS,
  MAX_MOBS,
} from '@game/focus.ts';

describe('instant dungeon (focus)', () => {
  it('accepts only the three sanctioned depths', () => {
    for (const d of FOCUS_DURATIONS) expect(isFocusDuration(d)).toBe(true);
    expect(isFocusDuration(30)).toBe(false);
    expect(isFocusDuration('25')).toBe(false);
    expect(isFocusDuration(0)).toBe(false);
  });

  it('scales daily keys with rank', () => {
    expect(focusKeysPerDay('E')).toBe(2);
    expect(focusKeysPerDay('D')).toBe(3);
    expect(focusKeysPerDay('C')).toBe(4);
    expect(focusKeysPerDay('A')).toBe(5);
    expect(focusKeysPerDay('Monarch')).toBe(5);
    expect(focusKeysPerDay('nonsense')).toBe(2); // safe floor
  });

  it('rewards longer runs and extra mobs', () => {
    expect(focusXp(25, 1)).toBe(30);
    expect(focusXp(50, 1)).toBe(65);
    expect(focusXp(90, 1)).toBe(120);
    expect(focusXp(25, 3)).toBe(30 + 2 * 8);
    // mob count is clamped to the max
    expect(focusXp(25, 10)).toBe(focusXp(25, MAX_MOBS));
    // and to a floor of one
    expect(focusXp(25, 0)).toBe(30);
  });

  it('normalizes a mob list to 1–3 trimmed labels', () => {
    expect(normalizeMobs(['  write intro ', 'edit', '', '  '])).toEqual(['write intro', 'edit']);
    expect(normalizeMobs(['a', 'b', 'c', 'd'])).toHaveLength(MAX_MOBS);
    expect(normalizeMobs('not an array')).toEqual([]);
    expect(normalizeMobs([42, {}, 'real'])).toEqual(['real']);
  });
});
