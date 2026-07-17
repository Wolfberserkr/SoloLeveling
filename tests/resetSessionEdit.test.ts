import { describe, it, expect } from 'vitest';
import { applySessionEdit, buildRetroSession } from '../src/features/reset/resetStore';
import type { Session, SessionExercise } from '../src/features/reset/resetDb';

function ex(over: Partial<SessionExercise> = {}): SessionExercise {
  return {
    id: 'goblet-squat', slot_id: 'goblet-squat', name: 'Goblet Squat', focus: 'Quads & glutes',
    sets_total: 4, sets_done: 4, reps: '12', weight: '10', prescribe: '10–12 reps',
    ...over,
  };
}

function session(over: Partial<Session> = {}): Session {
  return {
    id: 'abc-123', dayId: 'lower-a', name: 'Lower A',
    date: '2026-07-15T18:30:00.000Z', done: 4, total: 4,
    exercises: [ex()],
    ...over,
  };
}

describe('applySessionEdit', () => {
  it('recomputes done/total from the edited exercise list', () => {
    const orig = session();
    const edited = applySessionEdit(orig, [
      ex({ sets_done: 3 }),
      ex({ id: 'plank-a', slot_id: 'plank-a', name: 'Plank', sets_total: 3, sets_done: 3 }),
    ]);
    expect(edited.done).toBe(6);
    expect(edited.total).toBe(7);
    expect(edited.exercises).toHaveLength(2);
  });

  it('keeps identity fields intact — date, day, name, cloud id', () => {
    const orig = session();
    const edited = applySessionEdit(orig, [ex({ reps: '15', weight: '12.5' })]);
    expect(edited.id).toBe(orig.id);
    expect(edited.date).toBe(orig.date);
    expect(edited.dayId).toBe(orig.dayId);
    expect(edited.name).toBe(orig.name);
  });

  it('does not mutate the original session', () => {
    const orig = session();
    const before = JSON.stringify(orig);
    applySessionEdit(orig, [ex({ sets_done: 1, reps: '5' })]);
    expect(JSON.stringify(orig)).toBe(before);
  });

  it('never shrinks the banked counts of a legacy session without a snapshot', () => {
    const orig = session({ exercises: [], done: 12, total: 20 });
    // Filling in only one exercise retroactively must not wipe the 12/20 record.
    const edited = applySessionEdit(orig, [ex({ sets_done: 4 })]);
    expect(edited.done).toBe(12);
    expect(edited.total).toBe(20);
    expect(edited.exercises).toHaveLength(1);
  });

  it('lets a legacy session grow past its stored counts once detail exceeds them', () => {
    const orig = session({ exercises: [], done: 2, total: 3 });
    const edited = applySessionEdit(orig, [
      ex({ sets_done: 4 }),
      ex({ id: 'plank-a', slot_id: 'plank-a', name: 'Plank', sets_total: 3, sets_done: 2 }),
    ]);
    expect(edited.done).toBe(6);
    expect(edited.total).toBe(7);
  });
});

describe('buildRetroSession', () => {
  it('builds a session for the picked day with recomputed counts', () => {
    const built = buildRetroSession('lower-a', '2026-07-14', [ex(), ex({ id: 'plank-a', slot_id: 'plank-a', name: 'Plank', sets_total: 3, sets_done: 2 })]);
    expect(built).not.toBeNull();
    expect(built!.dayId).toBe('lower-a');
    expect(built!.name).toBe('Lower A');
    expect(built!.done).toBe(6);
    expect(built!.total).toBe(7);
    expect(built!.exercises).toHaveLength(2);
  });

  it('anchors the date to the picked calendar day (local noon)', () => {
    const built = buildRetroSession('upper-a', '2026-07-14', [ex()]);
    const d = new Date(built!.date);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(14);
  });

  it('rejects an unknown day id', () => {
    expect(buildRetroSession('nope', '2026-07-14', [ex()])).toBeNull();
  });
});
