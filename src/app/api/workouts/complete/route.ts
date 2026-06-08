import { NextRequest, NextResponse } from 'next/server';
import { requireHunter } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { awardXp } from '@/lib/leveling';
import { activeBuffs, grant } from '@/lib/powerups';
import { checkAchievements, unlock } from '@/lib/achievements';
import { maybeExtractShadow } from '@/lib/shadows';
import { MAIN_LIFTS } from '@/lib/program';
import { progressActiveGate } from '@/lib/gates';
import { consumeWorkoutXpBuff, domainMultiplier } from '@/lib/skills';

export async function POST(req: NextRequest) {
  try {
    const user = await requireHunter();
    const { session_key, date, deload } = await req.json();
    const sb = getAdminSupabase();
    const { count } = await sb
      .from('workout_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('session_date', date)
      .eq('session_key', session_key);
    if (!count) return NextResponse.json({ error: 'No sets logged' }, { status: 400 });

    let xp = 80 + count * 6;
    const buffs = await activeBuffs(user.id);
    if (buffs.some((b: any) => b.buff_key === 'xp_x1_5')) xp = Math.round(xp * 1.5);
    const skillMult = await consumeWorkoutXpBuff(user.id);
    if (skillMult > 1) xp = Math.round(xp * skillMult);
    const domainMult = await domainMultiplier(user.id);
    if (domainMult > 1) xp = Math.round(xp * domainMult);
    if (deload) {
      xp = Math.round(xp * 0.7);
      await grant(user.id, 'shadow_extraction', 1);
      await unlock(user.id, 'shadow_first');
    }

    const result = await awardXp(user.id, xp, `Cleared dungeon: ${session_key}`);
    await checkAchievements(user.id);

    // Shadow extraction roll — count PR sets in today's session for bonus odds.
    const mainKeys = MAIN_LIFTS.map((m) => m.key);
    const { data: todaySets } = await sb
      .from('workout_logs')
      .select('exercise_key, weight')
      .eq('user_id', user.id)
      .eq('session_date', date)
      .eq('session_key', session_key)
      .in('exercise_key', mainKeys)
      .not('weight', 'is', null);

    // A PR set = weight that exceeds the previous max on a different date.
    let prCount = 0;
    if (todaySets && todaySets.length > 0) {
      const { data: priorMaxRows } = await sb
        .from('workout_logs')
        .select('exercise_key, weight')
        .eq('user_id', user.id)
        .in('exercise_key', mainKeys)
        .neq('session_date', date)
        .not('weight', 'is', null);
      const priorMax: Record<string, number> = {};
      for (const r of priorMaxRows || []) {
        const cur = priorMax[r.exercise_key] || 0;
        if (Number(r.weight) > cur) priorMax[r.exercise_key] = Number(r.weight);
      }
      const seenPr = new Set<string>();
      for (const s of todaySets) {
        if (Number(s.weight) > (priorMax[s.exercise_key] || 0) && !seenPr.has(s.exercise_key)) {
          prCount += 1;
          seenPr.add(s.exercise_key);
        }
      }
    }

    const shadow = await maybeExtractShadow(user.id, {
      session_key,
      deload: !!deload,
      prCount,
    });

    // Mirror session volume into any active 'workout_volume' Gate.
    const { data: volRows } = await sb
      .from('workout_logs')
      .select('weight, reps')
      .eq('user_id', user.id)
      .eq('session_date', date)
      .eq('session_key', session_key)
      .not('weight', 'is', null)
      .not('reps', 'is', null);
    const sessionVolume = (volRows || []).reduce(
      (acc: number, r: any) => acc + Number(r.weight) * Number(r.reps),
      0
    );
    if (sessionVolume > 0) {
      await progressActiveGate(user.id, 'workout_volume', Math.round(sessionVolume));
    }

    return NextResponse.json({ ok: true, ...result, shadow });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
