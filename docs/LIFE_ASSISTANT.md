# Jarvis: the Life Assistant

A personal assistant you talk to on **Telegram**. It plans your days around your work
shifts, keeps your Calendar up to date, triages your Gmail, tracks your money, and folds
Garmin and Strava into Project Viking.

## What it does (from the 20-question brief)

| Area | Behaviour |
|---|---|
| **Chat** | Free-form conversation on Telegram, powered by the Claude API (`claude-opus-5-5`), with buttons for decisions |
| **Work schedule** | Send a photo of the roster, or it arrives by email. Shifts are read, shown to you, and added to Calendar after you tap ✅. The shift-reminder template runs on every new shift automatically. Everything goes on one calendar |
| **Daily plan** | Anchors (shift, sleep, training, meals, errands) are computed per shift. Morning shifts wake 90 min before; back-to-back nights sleep straight after; a first night gets a nap. Say "block 14:00–15:30 for X" to add a calendar block |
| **Briefing** | About 1 h after waking, so it moves with your shift (30 min before leaving on morning shifts); at a fixed time on days off. If the background routine misses it, the bot sends a short version Ends with **📰 Aruba today**: 3 local stories from the last day (traffic, Elmar or WEB outages, government, tourism and casino news, events), one English line each with a link |
| **Training** | Garmin rides go into the Viking Ride log, and sleep and steps into Viking recovery. Readiness (HRV, sleep, body battery, night shifts) downgrades hard rides. Today's session is pushed to your watch, inside your shift's training window |
| **Nudges** | Wind-down before bedtime, nap reminders, steps (evenings, off work), weigh-in and check-in, a Sunday weekly review |
| **Email** | Tiered. Obvious junk (promotions, social, expired codes, delivered parcels) goes to Trash and is recoverable for 30 days. Uncertain mail comes to Telegram at 19:00 with 🗑 / ✅ / ♻️ Always. Receipts are archived after being logged. Important mail is summarised and gets a draft reply, never sent |
| **Money** | Bank alert and receipt emails are parsed. Quick-log by Telegram ("25 lunch", "$40 gas"), or send a receipt or statement photo. Statements skip lines already logged. Includes budgets with 80% / 100% warnings, bills and renewals with ✅ Paid buttons, savings goals, and a monthly subscription audit. AWG + USD at the 1.79 peg |
| **Other** | Groceries, errands, household, family dates, learning and habits (`life_tasks`, `life_memory`) |
| **Data** | Supabase is the source of truth, mirrored daily to the Google Sheet **Jarvis — Finance** |

## How it fits together

```
 Telegram ──webhook──▶ life-bot (Supabase edge function) ──▶ Claude API (tools over your data)
     ▲                    │  minute tick (pg_cron): day plans, outbox, nudges, inbox digest
     │                    ▼
     └──── life_outbox ◀── Supabase (life_* tables, viking_docs) ◀──┐
                                                                     │ execute_sql
               Claude scheduled tasks ── Gmail · Calendar · Garmin · Strava · Sheets
               • sync, every 3 h (life/routines/sync.md)
               • weekly review (life/routines/weekly-review.md)
```

The bot can't reach Google, Garmin or Strava itself. When you ask it to change your calendar
or email, it queues a `life_jobs` row, and the background sync carries it out and messages you.
It runs every 3 hours, so **calendar and email changes asked for in chat land within 3 hours**. Everything that
lives in Supabase is instant: money, tasks, shifts, schedule questions and memory.

| Piece | Where |
|---|---|
| Rules (pure, tested) | `supabase/functions/_shared/lifeLogic.ts` · `tests/life.test.ts` |
| Bot, tools, tick | `supabase/functions/life-bot/{index,agent,tick,telegram}.ts` |
| Schema | `supabase/migrations/0030_life.sql` |
| Cron | `supabase/scripts/03_life_cron.sql` (run once) |
| Routine prompts | `life/routines/*.md` |

## Setup (one time)

1. **Telegram bot.** In Telegram, message **@BotFather** → `/newbot` → pick a name, and copy
   the token.
2. **Claude API key** from console.anthropic.com. Chat costs a few cents per message, billed to
   that key.
3. **Deploy.** Merge this branch to `main`. The Deploy workflow applies migration 0030 and
   deploys `life-bot`.
4. **Secrets.** Get your user id with `select id, email from auth.users;` in the SQL editor,
   then:
   ```sh
   npx supabase secrets set --project-ref npqpzzarohlvexqpqurg \
     ANTHROPIC_API_KEY=sk-ant-… \
     TELEGRAM_BOT_TOKEN=123:ABC… \
     TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 24) \
     LIFE_LINK_CODE=$(openssl rand -hex 6) \
     LIFE_OWNER_USER_ID=<your-uuid>
   ```
   `CRON_SECRET` is already set for Ascend; the tick reuses it.
5. **Register the webhook:**
   ```sh
   curl -X POST https://npqpzzarohlvexqpqurg.supabase.co/functions/v1/life-bot \
     -H "x-cron-secret: $CRON_SECRET" -H 'Content-Type: application/json' -d '{"action":"setup"}'
   ```
6. **Start the tick.** Paste `supabase/scripts/03_life_cron.sql` into the SQL editor, put your
   `CRON_SECRET` in it, and run it.
7. **Link.** Open your bot in Telegram and send `/start <LIFE_LINK_CODE>`. Then send a photo
   of your roster.
8. **Other Gmail accounts.** In each extra account: Settings → Forwarding → forward to your
   main Gmail. In the main Gmail, add a filter `deliveredto:<that address>` → apply label
   `acct/<name>`. The routine triages them all and keeps track of which account each came from.
9. **Scheduled tasks.** Claude runs `sync` every 3 hours and `weekly-review` on Sunday
   evenings, with the Gmail, Google Calendar, Garmin, Strava, Supabase, Google Sheets and
   Google Drive connectors.

## Talking to it

`25 lunch` · `$12.99 netflix` · `+2500 salary` · *(receipt photo)* · *(roster photo)* ·
"what's my week?" · "block 2–3:30 tomorrow for the bank" · "add eggs, oats, chicken to
groceries" · "budget 600 for dining" · "car insurance renews 1 March, yearly, ƒ1,450" ·
"I'm saving ƒ5,000 for a new bike by June" · "always delete mail from @shein.com" ·
"remember D's birthday is 3 May" · "I want 7.5 h sleep" · `/today` `/week` `/money` `/inbox` `/tasks`

## Safety

- One Telegram chat only: the first to send `/start <LIFE_LINK_CODE>`. Every other chat is
  ignored.
- The webhook checks Telegram's secret header. The tick needs `CRON_SECRET`.
- Email is never sent, only drafted. Nothing is deleted permanently; it goes to Trash, which
  keeps it 30 days. People, banks, employers, government and doctors are never auto-trashed.
- Email, calendar and image text is treated as data, not instructions.
