// ═════════════════════════════════════════════════════════════════════════
// life-bot — the Life Assistant's always-on half (verify_jwt = false).
//
//   POST + X-Telegram-Bot-Api-Secret-Token   Telegram webhook (chat, photos, buttons)
//   POST + x-cron-secret {action:"tick"}      every minute from pg_cron
//   POST + x-cron-secret {action:"setup"}     registers the Telegram webhook once
//
// Only one Telegram chat is ever served: the first one to send
// `/start <LIFE_LINK_CODE>` is bound to LIFE_OWNER_USER_ID. Every other chat
// gets a polite refusal and nothing else.
// ═════════════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';
import { advanceDue, formatMoney, isConfidentQuickLog, localParts, parseQuickLog, safeTz, toAwgMinor, escapeHtml } from '../_shared/lifeLogic.ts';
import { converse, type Attachment, type Db } from './agent.ts';
import { answerCallback, downloadFile, sendMessage, settleButtons, typing } from './telegram.ts';
import { tick } from './tick.ts';

type Row = Record<string, unknown>;
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const db: Db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const HELP = `<b>Jarvis</b> — just talk to me. Some things I do:
• "25 lunch", "$40 gas", "+2500 salary" logs money
• Send a photo of your roster and I'll put the shifts in your calendar
• Send a receipt photo and I'll log it
• "Block 14:00–15:30 tomorrow for groceries"
• "What's my week look like?" · "How much did I spend on food?"
• "Add milk and eggs to groceries" · "Remind me to renew my licence in March"
/today · /week · /money · /inbox · /tasks · /news · /help`;

const COMMANDS: Record<string, string> = {
  '/today': "Give me today's plan: shift, sleep, training, meals, tasks and anything due.",
  '/week': 'Give me the week ahead: shifts, key events, training days, bills due.',
  '/money': "How am I doing this month: spending by category vs budget, bills coming up, savings goals.",
  '/inbox': 'What email decisions are waiting for me? Summarise them.',
  '/tasks': 'List my open tasks and grocery list, grouped by area.',
  '/news': 'Send me the Aruba news now.',
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const tgSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (tgSecret && req.headers.get('x-telegram-bot-api-secret-token') === tgSecret) {
    const update = await req.json().catch(() => null);
    if (!update) return new Response('ok');
    const work = handleUpdate(update).catch((err) => console.error('life-bot: update failed', err));
    // Answer Telegram at once; finish the Claude turn in the background.
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
    else await work;
    return new Response('ok');
  }

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return new Response('Forbidden', { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body.action === 'tick') return json(await tick(db));
  if (body.action === 'setup') return json(await setupWebhook());
  return json({ error: 'unknown action' }, 400);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function setupWebhook() {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/life-bot`;
  const res = await fetch(`https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: Deno.env.get('TELEGRAM_WEBHOOK_SECRET'), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true }),
  });
  const commands = Object.keys(COMMANDS).concat('/help').map((c) => ({ command: c.slice(1), description: c === '/help' ? 'What I can do' : COMMANDS[c].slice(0, 60) }));
  await fetch(`https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/setMyCommands`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commands }),
  });
  return { webhook: await res.json(), url };
}

async function ownerFor(chatId: number): Promise<{ userId: string; tz: string } | null> {
  const { data } = await db.from('life_profile').select('user_id,timezone').eq('telegram_chat_id', chatId).maybeSingle();
  return data ? { userId: String(data.user_id), tz: safeTz(data.timezone) } : null;
}

async function handleUpdate(update: Row) {
  // Telegram redelivers when it thinks we failed; run each update once.
  const { error: dup } = await db.from('life_updates_seen').insert({ update_id: update.update_id });
  if (dup) {
    if (dup.code !== '23505') console.error('life-bot: update dedupe failed', dup);
    return;
  }

  if (update.callback_query) return handleCallback(update.callback_query as Row);
  const msg = update.message as Row | undefined;
  if (!msg) return;
  const chatId = Number((msg.chat as Row).id);
  const text = String(msg.text ?? msg.caption ?? '').trim();

  if (text.startsWith('/start')) return link(chatId, text.split(/\s+/)[1] ?? '');
  const owner = await ownerFor(chatId);
  if (!owner) return sendMessage(chatId, 'This is a private assistant.');
  if (text === '/help') return sendMessage(chatId, HELP);

  const today = localParts(new Date(), owner.tz).date;

  // Fast path: an unmistakable one-line spend needs no AI.
  const photo = (msg.photo as Row[] | undefined)?.at(-1);
  const doc = msg.document as Row | undefined;
  if (!photo && !doc) {
    const q = parseQuickLog(text);
    if (isConfidentQuickLog(text, q)) {
      const { data: row } = await db.from('life_transactions').insert({
        user_id: owner.userId, occurred_on: today, amount_minor: q.amountMinor, currency: q.currency,
        amount_awg_minor: toAwgMinor(q.amountMinor, q.currency), merchant: q.description, category: q.category, source: 'telegram',
      }).select('id').single();
      const reply = `Logged ${formatMoney(q.amountMinor, q.currency)} · ${q.category} · ${escapeHtml(q.description)}`;
      await remember(owner.userId, text, reply);
      return sendMessage(chatId, reply, row ? [[{ text: '↩️ Undo', data: `tx:${row.id}:undo` }]] : null);
    }
  }

  await typing(chatId);
  let attachment: Attachment | undefined;
  try {
    if (photo) attachment = await downloadFile(String(photo.file_id));
    else if (doc && /^(image\/|application\/pdf)/.test(String(doc.mime_type ?? ''))) attachment = await downloadFile(String(doc.file_id));
  } catch (err) {
    console.error('life-bot: file download failed', err);
    return sendMessage(chatId, "I couldn't download that file. Try sending it again?");
  }

  const prompt = COMMANDS[text.split(/\s|@/)[0]] ?? text;
  try {
    const reply = await converse({ db, userId: owner.userId, tz: owner.tz, today }, prompt, attachment);
    await remember(owner.userId, attachment ? `[sent a file] ${text}` : text, reply.text);
    await sendMessage(chatId, reply.text, reply.keyboard);
  } catch (err) {
    console.error('life-bot: converse failed', err);
    await sendMessage(chatId, 'Something went wrong on my side. Try again in a minute.');
  }
}

async function remember(userId: string, userText: string, reply: string) {
  await db.from('life_messages').insert([
    { user_id: userId, role: 'user', text: userText.slice(0, 4000) },
    { user_id: userId, role: 'assistant', text: reply.slice(0, 4000) },
  ]);
}

async function link(chatId: number, code: string) {
  const expected = Deno.env.get('LIFE_LINK_CODE');
  const userId = Deno.env.get('LIFE_OWNER_USER_ID');
  const existing = await ownerFor(chatId);
  if (existing) return sendMessage(chatId, `Already linked. ${HELP}`);
  if (!expected || !userId || code !== expected) return sendMessage(chatId, 'This is a private assistant.');
  const { data: taken } = await db.from('life_profile').select('telegram_chat_id').eq('user_id', userId).maybeSingle();
  if (taken?.telegram_chat_id) return sendMessage(chatId, 'This assistant is already linked to another chat.');
  await db.from('life_profile').upsert({ user_id: userId, telegram_chat_id: chatId, updated_at: new Date().toISOString() });
  await sendMessage(chatId, `✅ Linked. I'm Jarvis.\n\n${HELP}\n\nStart by sending me a photo of your work roster.`);
}

async function handleCallback(cb: Row) {
  const chatId = Number(((cb.message as Row).chat as Row).id);
  const messageId = Number((cb.message as Row).message_id);
  const owner = await ownerFor(chatId);
  if (!owner) return answerCallback(String(cb.id));
  const [kind, id, verb] = String(cb.data ?? '').split(':');
  const uid = owner.userId;

  if (kind === 'ib') {
    const { data: m } = await db.from('life_inbox').select('id,sender,action').eq('user_id', uid).eq('id', id).maybeSingle();
    if (!m) return answerCallback(String(cb.id), 'Already handled');
    if (verb === 'k') {
      await db.from('life_inbox').update({ status: 'rejected', action: 'keep', decided_at: new Date().toISOString() }).eq('id', id);
      await settleButtons(chatId, messageId, '✅ Kept');
    } else {
      await db.from('life_inbox').update({ status: 'approved', decided_at: new Date().toISOString() }).eq('id', id);
      if (verb === 'r' && m.sender) {
        const addr = String(m.sender).match(/<([^>]+)>/)?.[1] ?? String(m.sender);
        await db.from('life_inbox_rules').upsert({ user_id: uid, pattern: addr.toLowerCase(), verdict: m.action === 'archive' ? 'archive' : 'trash' });
      }
      await settleButtons(chatId, messageId, verb === 'r' ? '♻️ Will always do this for this sender' : '🗑 Queued');
    }
    return answerCallback(String(cb.id));
  }
  if (kind === 'ia') {
    const { data } = await db.from('life_inbox').update({ status: 'approved', decided_at: new Date().toISOString() }).eq('user_id', uid).eq('status', 'asked').select('id');
    await settleButtons(chatId, messageId, `🗑 ${(data ?? []).length} queued`);
    return answerCallback(String(cb.id), 'Done at the next sync');
  }
  if (kind === 'rs') {
    if (verb === 'ok') {
      const { data } = await db.from('life_shifts').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('user_id', uid).eq('batch', id).eq('status', 'pending').select('id');
      await settleButtons(chatId, messageId, `✅ ${(data ?? []).length} shifts saved`);
      await sendMessage(chatId, 'Saved. They go into your calendar with the shift reminders at the next sync (within 3 hours), and your sleep and briefing times now follow them.');
    } else {
      await db.from('life_shifts').delete().eq('user_id', uid).eq('batch', id).eq('status', 'pending');
      await settleButtons(chatId, messageId, '✖️ Discarded');
    }
    return answerCallback(String(cb.id));
  }
  if (kind === 'tx' && verb === 'undo') {
    await db.from('life_transactions').delete().eq('user_id', uid).eq('id', id);
    await settleButtons(chatId, messageId, '↩️ Removed');
    return answerCallback(String(cb.id));
  }
  if (kind === 'bp') {
    const { data: bill } = await db.from('life_bills').select('*').eq('user_id', uid).eq('id', id).maybeSingle();
    if (bill) {
      const today = localParts(new Date(), owner.tz).date;
      const next = advanceDue(String(bill.next_due), bill.cadence);
      await db.from('life_bills').update(next ? { last_paid: today, next_due: next } : { last_paid: today, active: false }).eq('id', id);
      await settleButtons(chatId, messageId, next ? `✅ Paid · next ${next}` : '✅ Paid');
    }
    return answerCallback(String(cb.id));
  }
  return answerCallback(String(cb.id));
}
