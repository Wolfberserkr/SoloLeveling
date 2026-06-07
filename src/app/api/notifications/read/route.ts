import { NextRequest, NextResponse } from 'next/server';
import { requireHunter } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const user = await requireHunter();
    const { id } = await req.json();
    const sb = getAdminSupabase();
    if (id) {
      await sb.from('notifications').update({ read: true }).eq('id', id).eq('user_id', user.id);
    } else {
      await sb.from('notifications').update({ read: true }).eq('user_id', user.id);
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
