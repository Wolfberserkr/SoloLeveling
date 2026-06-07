import { NextRequest, NextResponse } from 'next/server';
import { requireHunter } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { sessionFor, MAIN_LIFTS } from '@/lib/program';
import { unlock, checkAchievements } from '@/lib/achievements';

export async function POST(req: NextRequest) {
  try {
    const user = await requireHunter();
    const { session_key, exercise_key, set_index, weight, reps, date } = await req.json();
    if (!session_key || !exercise_key || typeof set_index !== 'number') {
      return NextResponse.json({ error: 'Bad input' }, { status: 400 });
    }
    const session = sessionFor(session_key);
    if (!session) return NextResponse.json({ error: 'Bad session' }, { status: 400 });
    const sb = getAdminSupabase();

    // Upsert by uniqueness: delete the existing row then insert.
    await sb
      .from('workout_logs')
      .delete()
      .eq('user_id', user.id)
      .eq('session_date', date)
      .eq('session_key', session_key)
      .eq('exercise_key', exercise_key)
      .eq('set_index', set_index);

    await sb.from('workout_logs').insert({
      user_id: user.id,
      session_date: date,
      session_key,
      exercise_key,
      set_index,
      weight,
      reps,
    });

    // PR detection on main lifts — compare against the max weight on any OTHER day.
    const main = MAIN_LIFTS.find((m) => m.key === exercise_key);
    let pr: any = null;
    if (main && weight != null && reps != null) {
      const { data: prevRows } = await sb
        .from('workout_logs')
        .select('weight')
        .eq('user_id', user.id)
        .eq('exercise_key', exercise_key)
        .neq('session_date', date)
        .not('weight', 'is', null)
        .order('weight', { ascending: false })
        .limit(1);
      const beforeMax = Number(prevRows?.[0]?.weight || 0);
      if (Number(weight) > beforeMax) {
        pr = { exercise: main.name, weight, reps };
        if (exercise_key === 'bench_press') await unlock(user.id, 'pr_bench');
        if (exercise_key === 'back_squat') await unlock(user.id, 'pr_squat');
        if (exercise_key === 'deadlift') await unlock(user.id, 'pr_deadlift');
        if (exercise_key === 'overhead_press') await unlock(user.id, 'pr_press');
      }
    }
    await checkAchievements(user.id);

    return NextResponse.json({ ok: true, pr });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
