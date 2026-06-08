import webpush from 'web-push';
import { getAdminSupabase } from './supabase/admin';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || '',
);

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  url?: string;
};

export async function sendPushToUser(userId: string, payload: PushPayload) {
  const sb = getAdminSupabase();
  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (!subs || subs.length === 0) return;

  const message = JSON.stringify(payload);
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message,
        );
      } catch (err: any) {
        // 410 Gone = subscription expired / user unsubscribed in browser
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          stale.push(sub.endpoint);
        }
      }
    }),
  );

  if (stale.length > 0) {
    await sb.from('push_subscriptions').delete().eq('user_id', userId).in('endpoint', stale);
  }
}

// Returns true if we've already sent this kind today for this user (in their tz).
export async function alreadySentToday(userId: string, kind: string, todayDate: string): Promise<boolean> {
  const sb = getAdminSupabase();
  const { data } = await sb
    .from('push_notification_log')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('sent_date', todayDate)
    .maybeSingle();
  return !!data;
}

export async function markSent(userId: string, kind: string, todayDate: string) {
  const sb = getAdminSupabase();
  await sb.from('push_notification_log').insert({ user_id: userId, kind, sent_date: todayDate });
}
