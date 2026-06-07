import { NextRequest, NextResponse } from 'next/server';
import { requireHunter } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { awardXp } from '@/lib/leveling';
import { activeBuffs, grant } from '@/lib/powerups';
import { checkAchievements, unlock } from '@/lib/achievements';

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
    if (deload) {
      xp = Math.round(xp * 0.7);
      await grant(user.id, 'shadow_extraction', 1);
      await unlock(user.id, 'shadow_first');
    }

    const result = await awardXp(user.id, xp, `Cleared dungeon: ${session_key}`);
    await checkAchievements(user.id);
    return NextResponse.json({ ok: true, xpGained: xp, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
