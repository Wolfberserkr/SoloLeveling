import { NextRequest, NextResponse } from 'next/server';
import { requireHunter } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getDef } from '@/lib/achievements';

export async function POST(req: NextRequest) {
  try {
    const user = await requireHunter();
    const { key } = await req.json();
    const sb = getAdminSupabase();

    // Unequipping (null/empty) is always allowed.
    if (!key) {
      await sb.from('profiles').update({ active_title: null }).eq('id', user.id);
      return NextResponse.json({ ok: true, active_title: null });
    }

    if (!getDef(key)) {
      return NextResponse.json({ error: 'Unknown title' }, { status: 400 });
    }
    // Must own the underlying achievement.
    const { data: owned } = await sb
      .from('achievements')
      .select('achievement_key')
      .eq('user_id', user.id)
      .eq('achievement_key', key)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: 'Title not unlocked' }, { status: 403 });
    }
    await sb.from('profiles').update({ active_title: key }).eq('id', user.id);
    return NextResponse.json({ ok: true, active_title: key });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
