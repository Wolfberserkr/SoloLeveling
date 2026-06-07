import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { sessionFor, MAIN_LIFTS } from '@/lib/program';
import { unlock, checkAchievements } from '@/lib/achievements';

export async function POST(req: NextRequest) {
  try {
    const user = requireUser();
    const { session_key, exercise_key, set_index, weight, reps, date } = await req.json();
    if (!session_key || !exercise_key || typeof set_index !== 'number') {
      return NextResponse.json({ error: 'Bad input' }, { status: 400 });
    }
    const session = sessionFor(session_key);
    if (!session) return NextResponse.json({ error: 'Bad session' }, { status: 400 });
    const db = getDb();

    // Upsert: delete existing then insert (set is identified by user/date/session/ex/index)
    db.prepare(
      `DELETE FROM workout_logs WHERE user_id = ? AND session_date = ? AND session_key = ? AND exercise_key = ? AND set_index = ?`
    ).run(user.id, date, session_key, exercise_key, set_index);

    db.prepare(
      `INSERT INTO workout_logs (user_id, session_date, session_key, exercise_key, set_index, weight, reps, completed_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(user.id, date, session_key, exercise_key, set_index, weight, reps, Date.now());

    // PR check for main lifts
    const main = MAIN_LIFTS.find((m) => m.key === exercise_key);
    let pr: any = null;
    if (main && weight != null && reps != null) {
      const prev = db
        .prepare(
          `SELECT MAX(weight) AS w FROM workout_logs WHERE user_id = ? AND exercise_key = ? AND completed_at < ?`
        )
        .get(user.id, exercise_key, Date.now()) as any;
      if (!prev.w || weight > prev.w) {
        pr = { exercise: main.name, weight, reps };
        if (exercise_key === 'bench_press') unlock(user.id, 'pr_bench');
        if (exercise_key === 'back_squat') unlock(user.id, 'pr_squat');
        if (exercise_key === 'deadlift') unlock(user.id, 'pr_deadlift');
        if (exercise_key === 'overhead_press') unlock(user.id, 'pr_press');
      }
    }
    checkAchievements(user.id);

    return NextResponse.json({ ok: true, pr });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
