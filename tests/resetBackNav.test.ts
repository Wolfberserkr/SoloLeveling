import { describe, it, expect } from 'vitest';
import { parentOf } from '../src/features/reset/ResetApp';

describe('parentOf — Reset back-button hierarchy', () => {
  it('plan is the root: back goes nowhere (never out of the app)', () => {
    expect(parentOf({ name: 'plan' })).toBeNull();
  });

  it('a session detail backs out to the Progress calendar', () => {
    expect(parentOf({ name: 'session', dateKey: '2026-07-15T18:30:00.000Z' })).toEqual({
      name: 'progress',
    });
  });

  it('day, progress, and complete all back out to the plan', () => {
    expect(parentOf({ name: 'day', dayId: 'lower-a' })).toEqual({ name: 'plan' });
    expect(parentOf({ name: 'progress' })).toEqual({ name: 'plan' });
    expect(
      parentOf({
        name: 'complete',
        summary: { done: 4, total: 4, dayName: 'Lower A', exercisesCompleted: 5 },
      }),
    ).toEqual({ name: 'plan' });
  });
});
