import { describe, it, expect } from 'vitest';
import { gymPickOptions, gymRunsFrom, gymTrained } from '../src/features/dungeons/gymPick';
import { recoveryWarning, suggestSession } from '../src/lib/sessionPick';

const NOW = new Date('2026-09-25T18:00:00').getTime();
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe('gym dungeon — pick your session', () => {
  it('maps the four split sessions to their body regions', () => {
    expect(gymPickOptions()).toEqual([
      { id: 'upper_a', region: 'upper' },
      { id: 'lower_a', region: 'lower' },
      { id: 'upper_b', region: 'upper' },
      { id: 'lower_b', region: 'lower' },
    ]);
  });

  it('drops rows with no recorded session kind or timestamp', () => {
    const runs = gymRunsFrom([
      { session_kind: 'lower_a', created_at: ago(5) },
      { session_kind: '', created_at: ago(30) },
      { session_kind: 'bogus', created_at: ago(40) },
      { session_kind: 'upper_b' },
    ]);
    expect(runs).toEqual([{ kind: 'lower_a', date: ago(5) }]);
    expect(gymRunsFrom(null)).toEqual([]);
  });

  it('suggests longest-since-trained, not the fixed cycle', () => {
    // The old cycle after 3 runs would say upper_b; lower is recovering and
    // upper_a is the older upper session.
    const runs = gymRunsFrom([
      { session_kind: 'lower_a', created_at: ago(20) },
      { session_kind: 'upper_b', created_at: ago(60) },
      { session_kind: 'upper_a', created_at: ago(100) },
    ]);
    expect(suggestSession(gymPickOptions(), gymTrained(runs), NOW)).toBe('upper_a');
    expect(recoveryWarning(gymPickOptions(), gymTrained(runs), 'lower_b', NOW)).toMatch(/Lower body/);
    expect(recoveryWarning(gymPickOptions(), gymTrained(runs), 'upper_a', NOW)).toBeNull();
  });

  it('with no history, suggests the first session', () => {
    expect(suggestSession(gymPickOptions(), [], NOW)).toBe('upper_a');
  });
});
