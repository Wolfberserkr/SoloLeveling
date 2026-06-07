import { NextResponse } from 'next/server';
import { requireHunter } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const user = await requireHunter();
    const sb = getAdminSupabase();
    const { data } = await sb
      .from('notifications')
      .select('id, kind, title, body, created_at, read')
      .eq('user_id', user.id)
      .order('id', { ascending: false })
      .limit(30);
    return NextResponse.json({ notifications: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
