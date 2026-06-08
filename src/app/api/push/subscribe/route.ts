import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHunter } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const user = await getCurrentHunter();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json();
  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ ok: false, message: 'Invalid subscription' }, { status: 400 });
  }

  const sb = getAdminSupabase();
  await sb.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  }, { onConflict: 'user_id,endpoint' });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentHunter();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { endpoint } = await req.json();
  if (endpoint) {
    await getAdminSupabase()
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);
  } else {
    // Remove all subscriptions for this user (full opt-out).
    await getAdminSupabase().from('push_subscriptions').delete().eq('user_id', user.id);
  }

  return NextResponse.json({ ok: true });
}
