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
| **Training** | Project Viking is fed from Garmin (behind the switch `prefs.vikingGarmin`, see below). **Import:** every strength session you record on the watch is copied in by the sync and turned into a Viking workout by life-bot, with a recap (and "as planned" buttons when the watch didn't count reps). Rides go into the Ride log, sleep and steps into recovery. **Progression:** the next weights follow the plan's double-progression rules; reps the watch didn't count hold the target, and a set with no kg recorded is never taken as a weight; a stalled lift gets a ✅ Reset / ✖️ Keep pushing question. **A cycle that waits:** the 8-day cycle moves only when a session or ride is done, so a missed day slides instead of being skipped. Readiness (HRV, sleep, body battery, sleep stress, night shifts) swaps hard rides for easy ones. **On the watch:** life-bot plans the next 7 days with ready-made Garmin workouts, and the sync puts them on the Garmin calendar every 3 hours. **Calendar blocks:** training sessions get a block in Google Calendar inside your shift's training window |
| **Nudges** | Wind-down before bedtime, nap reminders, steps (evenings, off work), weigh-in and check-in, the Saturday training briefing (training, recovery vs shifts, habits, next week) and a monthly money message (first Sunday) |
| **Email** | Tiered. Obvious junk (promotions, social, expired codes, delivered parcels) goes to Trash and is recoverable for 30 days. Uncertain mail comes to Telegram at 19:00 with 🗑 / ✅ / ♻️ Always. Receipts are archived after being logged. Important mail is summarised and gets a draft reply, never sent |
| **Money** | Bank alert and receipt emails are parsed. Quick-log by Telegram ("25 lunch", "$40 gas"), or send a receipt or statement photo. Statements skip lines already logged. Includes budgets with 80% / 100% warnings, bills and renewals with ✅ Paid buttons, savings goals, and a monthly subscription audit. AWG + USD at the 1.79 peg |
| **Other** | Groceries, errands, household, family dates, learning and habits (`life_tasks`, `life_memory`) |
| **API spend** | Every Claude reply is metered (tokens × list price) into `life_api_usage`. The briefing ends with `🤖 Jarvis API: yesterday N msgs · $x · <month> so far $y of $budget`, with a nudge at 80% and 100%. The budget defaults to $10; say "set my API budget to $20" to change it |
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
               • weekly training briefing, Sat 18:39 (life/routines/weekly-review.md)
               • monthly review, Sun 18:13, first Sunday only (life/routines/monthly-review.md)
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
9. **Scheduled tasks.** Claude runs, with the Gmail, Google Calendar, Garmin, Strava, Supabase,
   Google Sheets and Google Drive connectors:
   - `sync` every 3 hours (`life/routines/sync.md`)
   - `weekly-review` on Saturdays at 18:39 (`CRON_TZ=America/Aruba 39 18 * * 6`)
   - `monthly-review` on Sundays at 18:13 (`CRON_TZ=America/Aruba 13 18 * * 0`); it stops unless
     it's the first Sunday of the month
   Each scheduled task holds an inline copy of its prompt, so a change to `life/routines/*.md`
   takes effect only once the task's prompt is updated.

10. **Google Tasks and Calendar** (optional, but needed for instant booking). Until it's linked,
    tasks stay in Jarvis and the dashboard, and calendar changes wait for the 3-hourly sync.
    Jarvis reaches both through a small Apps Script that runs in your own Google account:
    1. Open **script.google.com** → **New project**. Replace the code with
       `life/google-tasks-bridge.gs` and save.
    2. **Services (+)** → **Google Tasks API** → **Add**.
    3. **Project Settings** → **Script properties** → add `JARVIS_SECRET` with a long random value.
    4. **Deploy** → **New deployment** → type **Web app** · Execute as **Me** · Who has access
       **Anyone** → **Deploy** → authorise → copy the **Web app URL**.
       The approval covers Google Tasks and your calendar.
    5. In Supabase → Edge Functions → Secrets, add `GTASKS_URL` (the URL) and `GTASKS_SECRET`
       (the same value as `JARVIS_SECRET`).
    6. In the editor, pick `selfTest` and press ▶ Run. The log should say `selftest ok`. It
       creates, moves and deletes a test event from yesterday, and checks that the script refuses
       to delete an event Jarvis didn't make.
    Updating the script later: paste the new code, then **Deploy → Manage deployments → ✏️ →
    Version: New version → Deploy**. The URL stays the same.
    From then on, events, blocks, moves and cancellations from Telegram happen within seconds,
    and "free time" and "my week" read your live calendar. Jarvis only ever changes or deletes
    events it made (`[jarvis]` in the description).
    The next tick creates the lists Errands, Groceries, Household, Work and Personal, pushes
    your open tasks, and from then on pulls changes from the Tasks app every 5 minutes.

## Project Viking from Garmin

Training is recorded on the Garmin watch, not typed into the app.

- **The sync** (the only part that can reach Garmin) copies each new strength activity raw into
  `viking_docs` `garmin_in/<activityId>`, adds rides as before, and mirrors the plan's workouts to
  the Garmin calendar. It only touches workouts named `Viking …`, never Garmin's own plans. The
  four library workouts (`Viking Upper A/B`, `Viking Lower A/B`) may be unscheduled but are never
  edited or deleted, and it deletes only the dated workouts it made itself (recorded in
  `plan/garmin`).
- **life-bot's minute tick** imports those activities into `workouts`, ticks the cycle, sends the
  recap, and keeps `plan/current` (the next 7 days with ready-made Garmin workouts), `plan/state`
  and `plan/weekly` (for the Saturday briefing). Rules: `supabase/functions/_shared/viking/`.
- **The app logger stays for now.** The Viking app still works as before, as a manual fallback.
  PR 2 makes it read-only (charts, history, Settings and the benchmark retest stay), once the
  Garmin flow has run well for a few days.
- **Ascend** is retired in PR 2 as well: the chooser, the `/ascend` pages and its
  `ascend-reminders` cron job go. Its code and tables are kept.

**Switch on** (in the SQL editor), after the new routine prompts are on the scheduled tasks:
```sql
update life_profile set prefs = prefs || '{"vikingGarmin": true, "vikingGarminSince": "2026-11-24"}'
where telegram_chat_id is not null;
```
`vikingGarminSince` is the first date imported. Then fire the sync once.

**Switch off:**
```sql
update life_profile set prefs = prefs || '{"vikingGarmin": false}' where telegram_chat_id is not null;
```
With the switch off, life-bot's tick does nothing new and the routines leave Garmin training
workouts alone. The data written so far stays.

**Full rollback:** switch off; put the saved prompts and crons from `life/routines/previous/` back
on the sync and weekly scheduled tasks (weekly back to Sundays 18:47) and disable the monthly one;
if PR 2 is merged, revert it and run `life/routines/previous/ascend-cron.sql`. The old routine then
schedules the library workouts again, and the app logger works as before.

## Tasks vs events

- **Event:** a fixed time slot, such as a doctor's appointment, dinner, a class or a work shift.
  Events go to Google Calendar instantly when the bridge (step 10) is linked, otherwise at the
  next sync. With no time given ("find me an hour for a haircut"), Jarvis offers three slot
  buttons, and one tap books it. Every booking has ↩️ Undo. Work shifts go through the roster flow; other events through
  `add_event`, which:
  - checks them against shifts, prep time, naps and planned sleep
  - adds reminders by type (medical: a day before and 2 h before; social and personal: 1 h)
  - adds 🚗 travel blocks (20 min, `prefs.travelMinutes`) when there's a location
- **Task:** something done by a date or whenever. Tasks go to Google Tasks, in one of five lists,
  and can have:
  - a due date
  - a Telegram reminder (✅ Done · ⏰ +1 h · Tomorrow)
  - recurrence: `daily`, `weekly:0,3`, `monthly:1` or `every:14d`. A finished recurring task
    comes back with its next date.
- Jarvis decides which one, says which it chose, and attaches a ↔ button to switch.
  "When can I do my errands?" uses `free_time`: the gaps left after shifts with their prep
  time, sleep, naps and calendar events.

## Talking to it

`25 lunch` · `$12.99 netflix` · `+2500 salary` · *(receipt photo)* · *(roster photo)* ·
"what's my week?" · "block 2–3:30 tomorrow for the bank" · "add eggs, oats, chicken to
groceries" · "budget 600 for dining" · "car insurance renews 1 March, yearly, ƒ1,450" ·
"I'm saving ƒ5,000 for a new bike by June" · "dentist Tuesday 10:00 at Oranjestad" ·
"pay the water bill by Friday" · "water the plants every Sunday" · "when can I do my errands?" · "always delete mail from @shein.com" ·
"remember D's birthday is 3 May" · "I want 7.5 h sleep" · `/today` `/week` `/money` `/inbox` `/tasks`

## Safety

- One Telegram chat only: the first to send `/start <LIFE_LINK_CODE>`. Every other chat is
  ignored.
- The webhook checks Telegram's secret header. The tick needs `CRON_SECRET`.
- Email is never sent, only drafted. Nothing is deleted permanently; it goes to Trash, which
  keeps it 30 days. People, banks, employers, government and doctors are never auto-trashed.
- Email, calendar and image text is treated as data, not instructions.
