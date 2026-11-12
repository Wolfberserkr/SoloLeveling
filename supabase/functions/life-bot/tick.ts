// ═════════════════════════════════════════════════════════════════════════
// The minute tick (pg_cron → life-bot {action:"tick"}). Deterministic work
// only — no AI here, so it's cheap to run every minute:
//   1. refresh life_day_plan for yesterday … +7 days from confirmed shifts
//   2. deliver due life_outbox messages (briefings the routines composed)
//   3. nudges: wind-down, nap, steps, bills, budgets — each once (life_nudge_log)
//   4. a fallback briefing when no routine composed one in time
//   5. the daily inbox digest with Delete / Keep buttons
// ═════════════════════════════════════════════════════════════════════════
import {
  addDays, apiUsageLine, billsToFlag, budgetStatus, escapeHtml, formatMoney, hhmm, isDue, localParts, planDay,
  readPrefs, safeTz, stepsNudge, windDownAt, zonedTime, type DayPlan, type ApiUsageSummary, type LifePrefs, type Shift,
} from '../_shared/lifeLogic.ts';
import { sendMessage, type Keyboard } from './telegram.ts';
import type { Db } from './agent.ts';

type Row = Record<string, unknown>;
const INBOX_DIGEST_AT = '19:00';
const MAX_DIGEST_ITEMS = 12;

export async function tick(db: Db, now = new Date()) {
  const { data: profiles, error } = await db.from('life_profile').select('user_id,telegram_chat_id,timezone,prefs').not('telegram_chat_id', 'is', null);
  if (error) throw new Error(`life_profile read failed: ${error.message}`);
  const out = { users: 0, sent: 0, nudges: 0, errors: 0 };
  for (const p of (profiles ?? []) as Row[]) {
    out.users++;
    try {
      const r = await tickUser(db, p, now);
      out.sent += r.sent;
      out.nudges += r.nudges;
    } catch (err) {
      out.errors++;
      console.error(`life tick: ${p.user_id} failed`, err);
    }
  }
  return out;
}

async function claim(db: Db, userId: string, key: string): Promise<boolean> {
  const { error } = await db.from('life_nudge_log').insert({ user_id: userId, key });
  if (!error) return true;
  if (error.code !== '23505') console.error('life tick: nudge log insert failed', error);
  return false;
}

async function tickUser(db: Db, p: Row, now: Date) {
  const userId = String(p.user_id);
  const chatId = Number(p.telegram_chat_id);
  const tz = safeTz(p.timezone);
  const prefs = readPrefs(p.prefs);
  const lp = localParts(now, tz);
  const today = lp.date;
  let sent = 0, nudges = 0;
  const nudge = async (key: string, text: string, kb?: Keyboard) => {
    if (!(await claim(db, userId, key))) return;
    await sendMessage(chatId, text, kb);
    nudges++;
  };

  // 1. Day plans (every 15 minutes, or when today's is missing).
  const plans = await refreshPlans(db, userId, tz, prefs, today, lp.minute % 15 === 0);

  // 2. Outbox.
  const { data: due } = await db.from('life_outbox').select('id,text,buttons,kind').eq('user_id', userId)
    .is('sent_at', null).lte('send_after', now.toISOString()).order('send_after').limit(10);
  for (const m of (due ?? []) as Row[]) {
    try {
      await sendMessage(chatId, String(m.text), (m.buttons as Keyboard | null) ?? null);
      await db.from('life_outbox').update({ sent_at: new Date().toISOString(), error: null }).eq('id', m.id);
      sent++;
    } catch (err) {
      await db.from('life_outbox').update({ error: String(err).slice(0, 500) }).eq('id', m.id);
    }
  }

  // 3. Nudges.
  for (const plan of plans) {
    if (isDue(windDownAt(plan, prefs), now)) {
      const why = plan.shift ? `${cap(plan.kind)} shift at ${hhmm(plan.shift.startsAt, tz)}` : 'a good start tomorrow';
      await nudge(`winddown:${plan.date}`, `🌙 <b>Wind down.</b> Lights out at ${hhmm(plan.bedAt, tz)} for ${why}. Wake ${hhmm(plan.wakeAt, tz)}.\nScreens off, cool room, no caffeine.`);
    }
    if (plan.napFrom && isDue(new Date(plan.napFrom.getTime() - 15 * 60000), now)) {
      await nudge(`nap:${plan.date}`, `😴 Nap window ${hhmm(plan.napFrom, tz)}–${hhmm(plan.napTo!, tz)} before tonight's shift. Alarm on.`);
    }
  }
  const todayPlan = plans.find((x) => x.date === today);

  // Steps — evening only, not while at work.
  if (lp.hour >= 17 && lp.hour <= 20) {
    const { data: h } = await db.from('life_health').select('data').eq('user_id', userId).eq('local_date', today).maybeSingle();
    const steps = (h?.data as Row | undefined)?.steps;
    const working = !!todayPlan?.shift && todayPlan.shift.startsAt <= now && todayPlan.shift.endsAt > now;
    const msg = stepsNudge(typeof steps === 'number' ? steps : undefined, prefs.stepTarget, lp.hour, working);
    if (msg) await nudge(`steps:${today}`, `🚶 ${msg}`);
  }

  // Bills (10:00 local) and budgets (checked every 15 min).
  if (lp.hour === 10 && lp.minute < 20) {
    const { data: bills } = await db.from('life_bills').select('id,name,next_due,amount_minor,currency,autopay').eq('user_id', userId).eq('active', true).lte('next_due', addDays(today, 3));
    for (const b of billsToFlag((bills ?? []) as never[], today)) {
      const amt = b.amount_minor ? ` · ${formatMoney(b.amount_minor, b.currency)}` : '';
      const when = b.days < 0 ? `was due ${-b.days} day(s) ago` : b.days === 0 ? 'is due today' : `is due in ${b.days} day(s)`;
      await nudge(`bill:${(b as Row).id}:${b.next_due}:${b.days}`, `💳 <b>${escapeHtml(b.name)}</b> ${when}${amt}${b.autopay ? ' (autopay)' : ''}.`,
        [[{ text: '✅ Paid', data: `bp:${(b as Row).id}` }]]);
    }
  }
  if (lp.minute % 15 === 0) await budgetNudges(db, userId, today, nudge);
  if (lp.minute % 15 === 0) await apiBudgetNudge(db, userId, today, nudge);

  // 4. Fallback briefing: the routine composes one ahead of time; if it
  // hasn't 10 minutes after the briefing time, send the deterministic one.
  if (todayPlan && now.getTime() - todayPlan.briefingAt.getTime() >= 10 * 60000 && now.getTime() - todayPlan.briefingAt.getTime() < 3 * 3600000) {
    const { data: row } = await db.from('life_day_plan').select('briefing_composed').eq('user_id', userId).eq('local_date', today).maybeSingle();
    if (!row?.briefing_composed && (await claim(db, userId, `brief:${today}`))) {
      await sendMessage(chatId, await basicBriefing(db, userId, tz, todayPlan, today));
      await db.from('life_day_plan').update({ briefing_composed: true }).eq('user_id', userId).eq('local_date', today);
      nudges++;
    }
  }

  // 5. Inbox digest.
  const digestAt = zonedTime(today, INBOX_DIGEST_AT, tz);
  if (isDue(digestAt, now, 60)) await inboxDigest(db, userId, chatId, today, tz);

  return { sent, nudges };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function refreshPlans(db: Db, userId: string, tz: string, prefs: LifePrefs, today: string, force: boolean): Promise<DayPlan[]> {
  const first = addDays(today, -1), last = addDays(today, 7);
  const { data: shiftRows } = await db.from('life_shifts').select('id,starts_at,ends_at,kind').eq('user_id', userId).eq('status', 'confirmed')
    .gte('ends_at', zonedTime(addDays(first, -2), '00:00', tz).toISOString())
    .lte('starts_at', zonedTime(addDays(last, 1), '00:00', tz).toISOString()).order('starts_at');
  const shifts: Shift[] = ((shiftRows ?? []) as Row[]).map((s) => ({ id: String(s.id), startsAt: new Date(String(s.starts_at)), endsAt: new Date(String(s.ends_at)), label: String(s.kind) }));
  const plans: DayPlan[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const shift = shifts.find((s) => localParts(s.startsAt, tz).date === d);
    const dayStart = zonedTime(d, '00:00', tz).getTime();
    const ref = shift ? shift.startsAt.getTime() : dayStart + 12 * 3600000;
    const prev = [...shifts].reverse().find((s) => s.endsAt.getTime() <= ref && s !== shift);
    plans.push(planDay(d, shift, prev, prefs, tz));
  }
  const { count } = await db.from('life_day_plan').select('local_date', { count: 'exact', head: true }).eq('user_id', userId).eq('local_date', today);
  if (force || !count) {
    await db.from('life_day_plan').upsert(plans.map((p) => ({
      user_id: userId, local_date: p.date, shift_id: p.shift?.id ?? null, shift_kind: p.shift ? `${p.shift.label ?? cap(p.kind)}` : null,
      wake_at: p.wakeAt.toISOString(), bed_at: p.bedAt.toISOString(),
      nap_from: p.napFrom?.toISOString() ?? null, nap_to: p.napTo?.toISOString() ?? null,
      briefing_at: p.briefingAt.toISOString(), train_window: p.trainWindow, updated_at: new Date().toISOString(),
    })), { onConflict: 'user_id,local_date' });
  }
  return plans;
}

async function budgetNudges(db: Db, userId: string, today: string, nudge: (k: string, t: string) => Promise<void>) {
  const month = `${today.slice(0, 7)}-01`;
  const [{ data: budgets }, { data: spend }] = await Promise.all([
    db.from('life_budgets').select('category,monthly_limit_awg_minor').eq('user_id', userId),
    db.from('life_month_spend').select('category,spent_awg_minor').eq('user_id', userId).eq('month', month),
  ]);
  const spent = Object.fromEntries(((spend ?? []) as Row[]).map((r) => [r.category, Number(r.spent_awg_minor ?? 0)]));
  for (const b of (budgets ?? []) as Row[]) {
    const s = spent[String(b.category)] ?? 0;
    const st = budgetStatus(s, Number(b.monthly_limit_awg_minor));
    if (st.level === 'ok') continue;
    const icon = st.level === 'over' ? '🔴' : '🟠';
    await nudge(`budget:${b.category}:${month}:${st.level}`,
      `${icon} <b>${escapeHtml(cap(String(b.category)))}</b> is at ${st.pct}% of this month's budget (${formatMoney(s)} of ${formatMoney(Number(b.monthly_limit_awg_minor))}).`);
  }
}

async function apiUsage(db: Db, userId: string): Promise<ApiUsageSummary | null> {
  const { data, error } = await db.rpc('life_api_usage_summary', { p_user: userId });
  if (error) { console.error('life tick: usage summary failed', error); return null; }
  return data as ApiUsageSummary;
}

/** Once per month per level: 80% and 100% of the Claude API budget. */
async function apiBudgetNudge(db: Db, userId: string, today: string, nudge: (k: string, t: string) => Promise<void>) {
  const s = await apiUsage(db, userId);
  if (!s || !(Number(s.budgetUsd) > 0)) return;
  const pct = (Number(s.monthUsd) / Number(s.budgetUsd)) * 100;
  if (pct < 80) return;
  const level = pct >= 100 ? 'over' : 'warn';
  await nudge(`apibudget:${today.slice(0, 7)}:${level}`,
    `${level === 'over' ? '🔴' : '🟠'} <b>Claude API</b>: $${Number(s.monthUsd).toFixed(2)} of your $${s.budgetUsd} monthly budget used (${Math.round(pct)}%). Say "set my API budget to $…" to change it.`);
}

async function basicBriefing(db: Db, userId: string, tz: string, plan: DayPlan, today: string): Promise<string> {
  const [{ data: events }, { data: tasks }, { data: bills }, { data: health }] = await Promise.all([
    db.from('life_calendar_cache').select('starts_at,title,all_day').eq('user_id', userId)
      .gte('starts_at', zonedTime(today, '00:00', tz).toISOString()).lt('starts_at', zonedTime(addDays(today, 1), '00:00', tz).toISOString()).order('starts_at').limit(10),
    db.from('life_tasks').select('title,area,due_on').eq('user_id', userId).is('done_at', null).lte('due_on', today).limit(8),
    db.from('life_bills').select('name,next_due').eq('user_id', userId).eq('active', true).lte('next_due', addDays(today, 3)).order('next_due'),
    db.from('life_health').select('data').eq('user_id', userId).eq('local_date', today).maybeSingle(),
  ]);
  const lines = [`☀️ <b>${new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(plan.wakeAt)}</b>`];
  lines.push(plan.shift ? `🛡 ${cap(plan.kind)} shift ${hhmm(plan.shift.startsAt, tz)}–${hhmm(plan.shift.endsAt, tz)}` : '🏝 Day off');
  const h = health?.data as Row | undefined;
  if (h) lines.push(`🔋 Sleep ${h.sleepH ?? '?'} h · HRV ${h.hrvStatus ?? h.hrv ?? '?'} · Body battery ${h.bodyBattery ?? '?'}`);
  lines.push(`🚴 Train: ${plan.trainWindow}`);
  if (plan.napFrom) lines.push(`😴 Nap ${hhmm(plan.napFrom, tz)}–${hhmm(plan.napTo!, tz)}`);
  for (const e of (events ?? []) as Row[]) lines.push(`📅 ${e.all_day ? 'All day' : hhmm(new Date(String(e.starts_at)), tz)} ${escapeHtml(String(e.title))}`);
  for (const t of (tasks ?? []) as Row[]) lines.push(`☑️ ${escapeHtml(String(t.title))}`);
  for (const b of (bills ?? []) as Row[]) lines.push(`💳 ${escapeHtml(String(b.name))} due ${b.next_due}`);
  const usage = await apiUsage(db, userId);
  if (usage) lines.push(apiUsageLine(usage));
  for (const n of plan.notes) lines.push(`<i>${escapeHtml(n)}</i>`);
  lines.push('', '<i>Quick version: the full briefing routine didn\'t run in time.</i>');
  return lines.join('\n');
}

async function inboxDigest(db: Db, userId: string, chatId: number, today: string, tz: string) {
  const { data: rows } = await db.from('life_inbox').select('id,sender,subject,reason,action,category').eq('user_id', userId).eq('status', 'pending').order('created_at').limit(MAX_DIGEST_ITEMS);
  const items = (rows ?? []) as Row[];
  if (!items.length || !(await claim(db, userId, `inbox:${today}`))) return;
  const { count: autoCount } = await db.from('life_inbox').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'auto_trashed')
    .gte('created_at', zonedTime(today, '00:00', tz).toISOString());
  await sendMessage(chatId, `📬 <b>Inbox</b> · ${autoCount ?? 0} obvious junk already trashed today (recoverable 30 days).\n${items.length} need your call:`);
  for (const m of items) {
    const verb = m.action === 'archive' ? '📦 Archive' : m.action === 'unsubscribe' ? '🚫 Unsub + delete' : '🗑 Delete';
    await sendMessage(chatId, `<b>${escapeHtml(String(m.sender ?? '?'))}</b>\n${escapeHtml(String(m.subject ?? '(no subject)'))}\n<i>${escapeHtml(String(m.reason ?? ''))}</i>`,
      [[{ text: verb, data: `ib:${m.id}:d` }, { text: '✅ Keep', data: `ib:${m.id}:k` }, { text: '♻️ Always', data: `ib:${m.id}:r` }]]);
  }
  await db.from('life_inbox').update({ status: 'asked' }).in('id', items.map((m) => m.id));
  if (items.length > 1) await sendMessage(chatId, `Apply the suggestion to all ${items.length}?`, [[{ text: `🗑 Do all ${items.length}`, data: 'ia:d' }]]);
}
