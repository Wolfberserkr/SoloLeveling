// ═════════════════════════════════════════════════════════════════════════
// ascend-notify — Ascend's reminder heartbeat. Invoked hourly by pg_cron
// (job `ascend-reminders`) with the same shared secret as the System's
// `cron` function (verify_jwt = false).
//
// For each Ascend player, in their own timezone: at each reminder hour they
// chose in Ascend's Settings (default 20:00), if any of today's daily quests
// are still open, send one push listing them. The push uses a fixed tag and
// requireInteraction, so it stays on screen until dismissed and a later
// reminder replaces it instead of stacking. Nothing is sent once every daily
// quest is done. notification_log (user/kind/date) makes each send happen
// at most once, however often the tick runs.
// ═════════════════════════════════════════════════════════════════════════
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const DEFAULT_HOURS = [20];
// deno-lint-ignore no-explicit-any
type Db = any; // untyped: the generated DB types don't cover ascend_* yet
type Row = Record<string, unknown>;

function safeTz(tz: unknown): string {
  try { new Intl.DateTimeFormat('en-US', { timeZone: String(tz) }); return String(tz); } catch { return 'UTC'; }
}
function localParts(tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, hour: Number(p.hour), weekday: new Date(`${date}T12:00:00Z`).getUTCDay() };
}
function reminderSettings(settings: unknown): { enabled: boolean; hours: number[] } {
  const r = (settings && typeof settings === 'object' ? (settings as Row).reminders : null) as Row | null;
  const enabled = r?.enabled !== false;
  const hours = Array.isArray(r?.hours) ? (r!.hours as unknown[]).map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23) : DEFAULT_HOURS;
  return { enabled, hours };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('Forbidden', { status: 403 });

  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return json({ ok: true, skipped: 'no VAPID keys' });
  webpush.setVapidDetails('mailto:system@sololeveling.app', pub, priv);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: players, error } = await db.from('ascend_profiles').select('user_id, settings');
  if (error) return json({ error: 'ascend_profiles read failed' }, 500);

  const result = { players: players?.length ?? 0, pushes: 0, errors: 0 };
  for (const p of (players ?? []) as Row[]) {
    try { result.pushes += await tick(db, String(p.user_id), p.settings); }
    catch (err) { result.errors++; console.error(`ascend-notify: ${p.user_id} failed`, err); }
  }
  return json({ ok: true, ...result });
});

async function tick(db: Db, userId: string, settings: unknown): Promise<number> {
  const { enabled, hours } = reminderSettings(settings);
  if (!enabled || !hours.length) return 0;
  const { data: prof } = await db.from('profiles').select('timezone').eq('user_id', userId).maybeSingle();
  const { date, hour, weekday } = localParts(safeTz((prof as Row | null)?.timezone ?? 'UTC'));
  // The tick lands a few minutes past the hour; allow one hour of slack so a
  // skipped tick doesn't cost the reminder. The claim below dedupes.
  const due = hours.filter((h) => hour === h || hour === (h + 1) % 24).sort((a, b) => b - a);
  if (!due.length) return 0;

  const { data: quests } = await db.from('ascend_quests').select('id, title, days').eq('user_id', userId).eq('type', 'daily').eq('archived', false);
  const todays = ((quests ?? []) as Row[]).filter((q) => (q.days as number[]).includes(weekday));
  if (!todays.length) return 0;
  const { data: done } = await db.from('ascend_completions').select('quest_id').eq('user_id', userId).eq('kind', 'daily').eq('local_date', date);
  const doneIds = new Set(((done ?? []) as Row[]).map((d) => String(d.quest_id)));
  const open = todays.filter((q) => !doneIds.has(String(q.id)));
  if (!open.length) return 0;

  let claimed = false;
  for (const h of due) if (await claim(db, userId, `ascend_reminder_${h}`, date)) { claimed = true; break; }
  if (!claimed) return 0;
  const doneCount = todays.length - open.length;
  const list = open.map((q) => String(q.title));
  const body = `Still to do: ${list.slice(0, 4).join(' · ')}${list.length > 4 ? ` · +${list.length - 4} more` : ''}`;
  return send(db, userId, {
    title: `Ascend · ${doneCount} of ${todays.length} done today`,
    body,
    url: '/ascend',
    tag: 'ascend-today',
    requireInteraction: true,
    renotify: true,
  });
}

async function claim(db: Db, userId: string, kind: string, localDate: string): Promise<boolean> {
  const { error } = await db.from('notification_log').insert({ user_id: userId, kind, local_date: localDate });
  if (!error) return true;
  if (error.code !== '23505') console.error('ascend-notify: notification_log insert failed', error);
  return false;
}

async function send(db: Db, userId: string, payload: Row): Promise<number> {
  const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId);
  let sent = 0;
  for (const s of (subs ?? []) as Row[]) {
    try {
      await webpush.sendNotification({ endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } }, JSON.stringify(payload));
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('endpoint', String(s.endpoint));
      else console.error('ascend-notify: push failed', err);
    }
  }
  return sent;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
