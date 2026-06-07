import { NextRequest, NextResponse } from 'next/server';
import { requireHunter } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { isValidTimezone } from '@/lib/time';

export async function POST(req: NextRequest) {
  try {
    const user = await requireHunter();
    const { timezone } = await req.json();
    if (!isValidTimezone(timezone)) {
      return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
    }
    const sb = getAdminSupabase();
    await sb.from('profiles').update({ timezone }).eq('id', user.id);
    return NextResponse.json({ ok: true, timezone });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
