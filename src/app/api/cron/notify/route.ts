import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { todayInTz, dateInTz } from '@/lib/time';
import { sendPushToUser, alreadySentToday, markSent } from '@/lib/push';

// Called by your scheduler every 30 min (Vercel Cron, pg_cron, GitHub Actions, etc.)
// Protect with CRON_SECRET in Authorization: Bearer <secret>
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  const sb = getAdminSupabase();

  // Fetch all users who have at least one push subscription.
  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('user_id')
    .order('user_id');
  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const userIds = [...new Set(subs.map((s) => s.user_id))];

  // Fetch profile timezones in one query.
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, timezone')
    .in('id', userIds);
  const tzMap = new Map<string, string>(
    (profiles || []).map((p) => [p.id, p.timezone || 'UTC']),
  );

  const now = new Date();
  let sent = 0;

  for (const userId of userIds) {
    const tz = tzMap.get(userId) || 'UTC';
    const today = todayInTz(tz);

    // Current hour in user's timezone (0–23)
    const localHour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now),
    );

    // ── 1. Daily quest reminder at 8 PM ──────────────────────────────
    if (localHour === 20) {
      const alreadySent = await alreadySentToday(userId, 'daily_reminder', today);
      if (!alreadySent) {
        const { data: quests } = await sb
          .from('daily_quests')
          .select('completed')
          .eq('user_id', userId)
          .eq('quest_date', today)
          .not('quest_key', 'ilike', 'weekly_%');

        const coreQuests = quests || [];
        const allCleared = coreQuests.length > 0 && coreQuests.every((q) => q.completed);

        if (!allCleared) {
          const cleared = coreQuests.filter((q) => q.completed).length;
          await sendPushToUser(userId, {
            title: '[ DAILY QUEST REMINDER ]',
            body: cleared > 0
              ? `${cleared} of ${coreQuests.length} objectives cleared. Don't let the day slip away.`
              : 'You haven\'t started today\'s quest. The System is watching.',
            tag: 'daily_reminder',
            url: '/quests',
          });
          await markSent(userId, 'daily_reminder', today);
          sent++;
        }
      }
    }

    // ── 2. Penalty warning at 11 PM ──────────────────────────────────
    if (localHour === 23) {
      const alreadySent = await alreadySentToday(userId, 'penalty_warning', today);
      if (!alreadySent) {
        const { data: quests } = await sb
          .from('daily_quests')
          .select('completed')
          .eq('user_id', userId)
          .eq('quest_date', today)
          .not('quest_key', 'ilike', 'weekly_%');

        const coreQuests = quests || [];
        const allCleared = coreQuests.length > 0 && coreQuests.every((q) => q.completed);

        if (!allCleared && coreQuests.length > 0) {
          await sendPushToUser(userId, {
            title: '[ PENALTY WARNING ]',
            body: 'One hour until midnight. Fail now and the System will dispense a penalty: STR –1, VIT –1, streak reset.',
            tag: 'penalty_warning',
            url: '/quests',
          });
          await markSent(userId, 'penalty_warning', today);
          sent++;
        }
      }
    }

    // ── 3. Gate expiry warning (within next 60 min) ──────────────────
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const { data: gate } = await sb
      .from('active_gates')
      .select('id, expires_at')
      .eq('user_id', userId)
      .eq('cleared', false)
      .lte('expires_at', oneHourFromNow.toISOString())
      .gte('expires_at', now.toISOString())
      .maybeSingle();

    if (gate) {
      const alreadySent = await alreadySentToday(userId, 'gate_warning', today);
      if (!alreadySent) {
        const minsLeft = Math.round((new Date(gate.expires_at).getTime() - now.getTime()) / 60000);
        await sendPushToUser(userId, {
          title: '[ GATE CLOSING ]',
          body: `Your gate closes in ${minsLeft} minutes. Enter now or lose the chance.`,
          tag: 'gate_warning',
          url: '/workout',
        });
        await markSent(userId, 'gate_warning', today);
        sent++;
      }
    }
  }

  return NextResponse.json({ ok: true, sent });
}
