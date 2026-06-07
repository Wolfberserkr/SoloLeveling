import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { awardXp } from '@/lib/leveling';
import { activeBuffs, grant } from '@/lib/powerups';
import { checkAchievements, unlock } from '@/lib/achievements';

export async function POST(req: NextRequest) {
  try {
    const user = requireUser();
    const { session_key, date, deload } = await req.json();
    const db = getDb();
    const count = db
      .prepare(
        'SELECT COUNT(*) AS c FROM workout_logs WHERE user_id = ? AND session_date = ? AND session_key = ?'
      )
      .get(user.id, date, session_key) as any;
    if (count.c === 0) {
      return NextResponse.json({ error: 'No sets logged' }, { status: 400 });
    }

    let xp = 80 + count.c * 6;
    const buffs = activeBuffs(user.id);
    if (buffs.some((b) => b.buff_key === 'xp_x1_5')) xp = Math.round(xp * 1.5);
    if (deload) {
      xp = Math.round(xp * 0.7);
      grant(user.id, 'shadow_extraction', 1);
      unlock(user.id, 'shadow_first');
    }

    const result = awardXp(user.id, xp, `Cleared dungeon: ${session_key}`);
    checkAchievements(user.id);
    return NextResponse.json({ ok: true, xpGained: xp, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
