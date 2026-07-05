// ═════════════════════════════════════════════════════════════════════════
// cron — the System's heartbeat. Invoked hourly (GitHub Actions schedule);
// authenticates with a shared secret, not a user JWT (verify_jwt = false).
//
// Per player, in their own timezone:
//   morning (08–11):  ensure today's System Event exists and announce it;
//                     announce knowledge checks falling due;
//                     on Mondays, generate the AI weekly assessment
//   evening (18–21):  remind if the Daily Training Quest is still unresolved
//
// Every push is claimed in notification_log (PK user/kind/date) before
// sending, so the hourly tick can never notify twice.
// ═════════════════════════════════════════════════════════════════════════
import webpush from 'npm:web-push@3.6.7';
import { adminClient } from '../_shared/db.ts';
import { localDateInTz, localHourInTz } from '../_shared/time.ts';
import { ensureSystemEvent } from '../_shared/eventEnsure.ts';
import { ensureWeeklyReview } from '../_shared/weeklyReview.ts';

const MORNING_START = 8;
const MORNING_END = 12; // exclusive
const DEFAULT_REMINDER_HOUR = 18;

type Db = ReturnType<typeof adminClient>;

type CronProfile = {
  user_id: string;
  timezone: string;
  level: number;
  reminder_hour: number | null;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Forbidden', { status: 403 });
  }

  const db = adminClient();
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
  const canPush = Boolean(vapidPublic && vapidPrivate);
  if (canPush) {
    webpush.setVapidDetails('mailto:system@sololeveling.app', vapidPublic!, vapidPrivate!);
  }

  const { data: profiles, error } = await db
    .from('profiles')
    .select('user_id, timezone, level, reminder_hour');
  if (error) {
    console.error('cron: profiles read failed:', error);
    return new Response(JSON.stringify({ error: 'profiles read failed' }), { status: 500 });
  }

  const results = { users: profiles?.length ?? 0, pushes: 0, errors: 0 };
  for (const profile of (profiles ?? []) as CronProfile[]) {
    try {
      results.pushes += await tickUser(db, profile, canPush);
    } catch (err) {
      results.errors += 1;
      console.error(`cron: tick failed for ${profile.user_id}:`, err);
    }
  }

  return new Response(JSON.stringify({ ok: true, ...results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

async function tickUser(db: Db, profile: CronProfile, canPush: boolean): Promise<number> {
  const today = localDateInTz(profile.timezone);
  const hour = localHourInTz(profile.timezone);
  let pushes = 0;

  if (hour >= MORNING_START && hour < MORNING_END) {
    // The event must exist even if the app stays closed all day.
    const event = await ensureSystemEvent(db, profile.user_id, today, profile.level);
    if (event && event.status === 'active' && canPush) {
      if (await claim(db, profile.user_id, 'event_push', today)) {
        pushes += await sendPush(db, profile.user_id, event.title, event.body);
      }
    }

    const { count: due } = await db
      .from('retention_questions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.user_id)
      .eq('mastered', false)
      .lte('due_date', today);
    if ((due ?? 0) > 0 && canPush) {
      if (await claim(db, profile.user_id, 'knowledge_push', today)) {
        pushes += await sendPush(
          db,
          profile.user_id,
          'Knowledge check.',
          `${due} retention ${due === 1 ? 'question awaits' : 'questions await'} in the Library.`,
        );
      }
    }

    // A Penalty Quest is the day's most urgent re-engagement hook — a broken
    // streak can still be saved. Push it hard. (Missing table = feature absent.)
    if (canPush) {
      const { data: penalty } = await db
        .from('penalty_quests')
        .select('streak_to_restore')
        .eq('user_id', profile.user_id)
        .eq('local_date', today)
        .eq('status', 'pending')
        .maybeSingle();
      if (penalty && (await claim(db, profile.user_id, 'penalty_push', today))) {
        pushes += await sendPush(
          db,
          profile.user_id,
          'Penalty Quest issued.',
          `Your ${penalty.streak_to_restore}-day streak broke — clear today's Penalty Quest before midnight to restore it. The System tests who gets back up.`,
        );
      }
    }

    // Monday: the AI System Coach assesses the week that just ended. Generation
    // is idempotent (one row per week) and tolerates a silent Archive, so a
    // failed tick simply retries next hour until the morning window closes.
    if (isMonday(today)) {
      const review = await ensureWeeklyReview(db, profile.user_id, today);
      if (review.status === 'created' && canPush) {
        if (await claim(db, profile.user_id, 'weekly_review_push', today)) {
          pushes += await sendPush(
            db,
            profile.user_id,
            'System Assessment ready.',
            'The week just past has been reviewed. Read the System’s verdict in your Status.',
          );
        }
      }
    }
  }

  // A two-hour window, not an exact match: one late or skipped tick must not
  // silently cost the day's reminder. notification_log already dedupes.
  const reminderHour = profile.reminder_hour ?? DEFAULT_REMINDER_HOUR;
  if (hour >= reminderHour && hour < reminderHour + 2 && canPush) {
    // Pending OR missing — a player who never opened the app needs the
    // reminder most. (The quest row is only created on first contact.)
    const { data: quest } = await db
      .from('training_quests')
      .select('status')
      .eq('user_id', profile.user_id)
      .eq('local_date', today)
      .maybeSingle();
    if (!quest || quest.status === 'pending') {
      if (await claim(db, profile.user_id, 'training_reminder', today)) {
        pushes += await sendPush(
          db,
          profile.user_id,
          'Daily Quest incomplete.',
          'The day is closing. Complete your training before midnight — the streak is the spine of everything.',
        );
      }
    }
  }

  return pushes;
}

/** True when `localDate` (YYYY-MM-DD) is a Monday — the weekly-review trigger. */
function isMonday(localDate: string): boolean {
  return new Date(`${localDate}T12:00:00Z`).getUTCDay() === 1;
}

/** Claim a notification slot; false means another tick already sent it. */
async function claim(db: Db, userId: string, kind: string, localDate: string): Promise<boolean> {
  const { error } = await db
    .from('notification_log')
    .insert({ user_id: userId, kind, local_date: localDate });
  if (!error) return true;
  if (error.code === '23505') return false;
  console.error('notification_log insert failed:', error);
  return false;
}

/** Send to every subscription the user has; prune endpoints that are gone. */
async function sendPush(db: Db, userId: string, title: string, body: string): Promise<number> {
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (!subs || subs.length === 0) return 0;

  const payload = JSON.stringify({ title: `[SYSTEM] ${title}`, body, url: '/' });
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      } else {
        console.error('push send failed:', err);
      }
    }
  }
  return sent;
}
