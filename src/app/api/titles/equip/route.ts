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
      await sb
        .from('profiles')
        .upsert({ id: user.id, hunter_name: user.hunter_name, active_title: null }, { onConflict: 'id' });
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
    // Upsert (not update) so users whose profiles row never got created
    // by the on-signup trigger still get their title saved.
    const { error: upsertErr } = await sb
      .from('profiles')
      .upsert(
        { id: user.id, hunter_name: user.hunter_name, active_title: key },
        { onConflict: 'id' }
      );
    if (upsertErr) {
      return NextResponse.json(
        { error: `DB write failed: ${upsertErr.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, active_title: key });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
