# Instant Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** life-bot creates, moves and deletes Jarvis calendar events within seconds via the owner's Apps Script bridge, offers three bookable slot buttons, and falls back to the queued sync when the bridge is unavailable.

**Architecture:** Pure scheduling helpers and the bridge-agnostic booking orchestration live in `supabase/functions/_shared/` (vitest-tested, no Deno APIs). A thin life-bot module `calendar.ts` binds them to the Apps Script bridge (`gcall`) and Supabase. `agent.ts` tools and `index.ts` callbacks call `calendar.ts`. The sync routine keeps its queued path as the fallback.

**Tech Stack:** Deno edge function (life-bot), TypeScript, vitest, Google Apps Script (CalendarApp), Supabase Postgres, Telegram Bot API.

**Spec:** `docs/superpowers/specs/2026-11-17-instant-scheduling-design.md`

## Global Constraints

- Only events whose description contains `[jarvis]` are ever updated or deleted. This is enforced in life-bot and again in the bridge (`calDelete`/`calUpdate` refuse otherwise).
- Description marker: `<notes>\n[jarvis] <tag> · jid:<life_jobs uuid>`. With no notes, there is no leading newline. Tag is the event kind, or `travel` for travel blocks.
- Title prefix by kind: 🩺 medical, 📌 personal, 👥 social, 🏋️ training, 📅 other.
- Travel blocks: title `🚗 Travel`, length `travel_buffer_min`, one ending at the start and one starting at the end, with no popups.
- Popups are exactly `eventReminders(kind)` (existing). A block (`block: true`) has none.
- "📅 Booked" is said only after the bridge returned an event id. Otherwise the reply says it was queued (within 3 h).
- Bridge secrets stay `GTASKS_URL` / `GTASKS_SECRET`. Per-call timeout is 8000 ms.
- Slot offers: at most 3, spread across days, `life_jobs.status = 'offered'`, expire after 48 h. Callback data `sl:<jobId>:<0|1|2|x>`, and Undo is `ev:<jobId>:undo` (both under 64 bytes).
- Outdoor or errand slots avoid 11:00–16:00 local. Slots never fall in sleep, a nap or shift prep, and start on :00 or :30.
- Times are sent to the bridge as ISO instants. The owner timezone comes from `life_profile.timezone` (default `America/Aruba`).
- Telegram copy uses HTML only (`<b>`, `<i>`), 24 h times, and `• ` bullets.
- Never paste secrets into chat or commit them.

## Review Focus

1. **A double tap or a Telegram redelivery on a slot button.** It must book exactly once: the atomic `offered → running` claim in Task 6, checked by hand in Task 8 step 4.
2. **The bridge times out after the main event was created but a travel block failed.** No orphan events must be left behind: rollback in `bookEvent` (Task 2 test `rolls back created events when any create fails`).
3. **An owner-made event with the same title as a Jarvis one** ("Dentist"). `edit_event` must never touch it (Task 1 test `matchJarvisEvents ignores events without [jarvis]`).
4. **All-day events in the live calendar** (holidays, birthdays). They must not wipe out free time (Task 1 test `busyFromEvents skips all-day events`).
5. **A late-evening request** ("find time today" at 20:30). No slot may start in the past or run into planned sleep (Task 1 test `pickSlots never returns past or sleep-overlapping slots`).

---

### Task 1: Pure scheduling helpers

**Files:**
- Create: `supabase/functions/_shared/scheduling.ts`
- Test: `tests/scheduling.test.ts`

**Interfaces:**
- Consumes: `hhmm`, `localParts`, `zonedTime`, `type Interval`, `type EventKind` from `_shared/lifeLogic.ts`.
- Produces:
  - `KIND_EMOJI: Record<EventKind, string>`
  - `eventTitle(kind: unknown, title: string): string`, which prefixes once and never doubles an emoji that is already there
  - `jarvisDescription(notes: string | null | undefined, tag: string, jobId: string): string`
  - `isJarvis(desc: string | null | undefined): boolean`
  - `jobIdOf(desc: string | null | undefined): string | null`, matching `/jid:([0-9a-f-]{36})/`
  - `type CalEvent = { id: string; title: string; start: string; end: string; allDay: boolean; description: string }`
  - `busyFromEvents(evs: CalEvent[]): Interval[]`
  - `type SlotOpts = { minutes: number; travelMinutes: number; outdoor: boolean; tz: string; now: Date; offDays: Set<string>; max?: number }`
  - `pickSlots(windows: Interval[], o: SlotOpts): Interval[]`
  - `OFFER_TTL_MS = 172_800_000`
  - `offerExpired(createdAt: string | Date, now: Date): boolean`
  - `slotLabel(s: Interval, tz: string): string`, for example `Thu 20 Nov 14:00`
  - `bookedText(e: { title: string; start: Date; end: Date; allDay: boolean; location?: string | null; travelMinutes: number; remindersMin: number[]; clashes: string[] }, tz: string): string`
  - `matchJarvisEvents(evs: CalEvent[], words: string, date: string | undefined, tz: string): CalEvent[]`

- [ ] **Step 1: Write the failing tests** in `tests/scheduling.test.ts`. Use `TZ = 'America/Aruba'` and `at(date, time) = zonedTime(date, time, TZ)`, as in `tests/life.test.ts`.
  - `eventTitle('medical','Dentist')` → `'🩺 Dentist'`; `eventTitle('medical','🩺 Dentist')` → `'🩺 Dentist'`; unknown kind → `'📅 X'`.
  - `jarvisDescription('Bring card','medical',J)` → `` `Bring card\n[jarvis] medical · jid:${J}` ``; `jarvisDescription(null,'travel',J)` → `` `[jarvis] travel · jid:${J}` ``; `isJarvis` and `jobIdOf` round-trip it; `jobIdOf('no marker')` → `null`.
  - `busyFromEvents skips all-day events`: one all-day event and one timed event give a single interval.
  - `pickSlots spreads across days`: windows on Thu 09:00–12:00, Thu 13:00–17:00 and Fri 09:00–12:00 with minutes 60. With `max: 2` the result is [Thu 09:00, Fri 09:00]. With `max: 3` it is [Thu 09:00, Thu 13:00, Fri 09:00], always sorted by start.
  - `pickSlots prefers off days`: same windows, Fri in `offDays`, `max: 1` gives [Fri 09:00].
  - `pickSlots rounds and pads for travel`: a window of 09:10–11:00 with minutes 60 and travel 20 gives a start of 09:30 (09:10+20 = 09:30, already on the half hour). A window of 09:10–10:20 with the same values gives nothing.
  - `pickSlots outdoor avoids 11:00–16:00`: a window of 10:00–18:00 with minutes 90 and outdoor gives 16:00, not 10:00 (10:00–11:30 crosses 11:00).
  - `pickSlots never returns past or sleep-overlapping slots`: with `now` at Thu 20:40 and a window of Thu 20:00–22:00, the start is 21:00. Sleep is excluded upstream (the windows come from `freeWindows`), so assert that a window ending at 21:30 with minutes 60 gives nothing.
  - `offerExpired`: 47 h → false, 49 h → true.
  - `slotLabel(at('2026-11-20','14:00'))` → `'Thu 20 Nov 14:00'`.
  - `bookedText`: a medical event at Oranjestad with travel 20, reminders [1440,120] and no clashes gives line 1 `📅 <b>🩺 Dentist</b> · Tue 18 Nov 10:00–11:00 · Oranjestad` and line 2 `🚗 20 min travel either side · 🔔 1 day + 2 h before`. A clash adds the line `⚠️ overlaps your Mid shift 13:00–22:00`. Each location and title is HTML-escaped with `escapeHtml`.
  - `matchJarvisEvents ignores events without [jarvis]`: two "Dentist" events where only one has the marker give that one. Words match case-insensitively on the title with emoji removed. `date` limits matches to that local day.
- [ ] **Step 2: Run** `npx vitest run tests/scheduling.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `scheduling.ts`.** Use this `pickSlots` algorithm:
  ```
  candidates = for each window w (sorted by start):
      s = max(w.start + travel, now rounded up to :00/:30); s = ceil(s to :00/:30)
      if outdoor and [s, s+min) overlaps local 11:00–16:00 → s = ceil(local 16:00 of that day)
      keep if s + minutes + travel <= w.end
  order: offDays first, then by start
  pass 1: take the first candidate of each distinct local date until max (default 3)
  pass 2: fill remaining from unused candidates in order
  return sorted by start
  ```
- [ ] **Step 4: Run** `npx vitest run tests/scheduling.test.ts`. Expected: PASS. Then run `npm test`; all suites must pass.
- [ ] **Step 5: Commit** `feat(life): scheduling helpers for instant calendar`

### Task 2: Bridge-agnostic booking orchestration

**Files:**
- Create: `supabase/functions/_shared/booking.ts`
- Test: `tests/booking.test.ts`

**Interfaces:**
- Consumes: `eventTitle`, `jarvisDescription`, `type CalEvent` (Task 1).
- Produces:
  - `type NewEvent = { title: string; start: string; end: string; allDay: boolean; location?: string | null; description: string; remindersMin: number[] }`
  - `type Bridge = { list(from: string, to: string): Promise<CalEvent[]>; create(e: NewEvent): Promise<{ id: string }>; update(id: string, patch: Partial<NewEvent>): Promise<{ id: string }>; remove(id: string): Promise<void> }`
  - `type BookSpec = { jobId: string; kind: string; title: string; start: Date; end: Date; allDay: boolean; location?: string | null; notes?: string | null; remindersMin: number[]; travelMinutes: number }`
  - `bookEvent(b: Bridge, s: BookSpec): Promise<{ ok: true; ids: string[]; created: CalEvent[] } | { ok: false; error: string }>`, where `ids[0]` is the main event
  - `removeEvents(b: Bridge, ids: string[]): Promise<{ ok: boolean; failed: string[] }>`
  - `moveEvent(b: Bridge, group: { main: CalEvent; travel: CalEvent[] }, start: Date, end: Date): Promise<{ ok: boolean; error?: string }>`, where the travel block lengths are kept and the before/after block is chosen by `travel.start < main.start`

- [ ] **Step 1: Write the failing tests** with a fake bridge that records calls and can fail on the Nth `create`.
  - `books main event plus two travel blocks`: with travel 20, three creates are made. The main one has the 🩺 title, the marker and reminders [1440,120]. The travel ones have title `🚗 Travel`, `[jarvis] travel · jid:J`, `remindersMin: []`, and spans [start−20, start] and [end, end+20].
  - `no travel blocks when travelMinutes is 0`.
  - `rolls back created events when any create fails`: with the 2nd create failing, the result is `ok:false`, and `remove` is called for every id that was created.
  - `removeEvents reports failures but tries all`.
  - `moveEvent shifts travel blocks with the event`.
- [ ] **Step 2: Run** `npx vitest run tests/booking.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `booking.ts`.** Run the creates with `Promise.allSettled`. On any rejection, run `removeEvents` on the fulfilled ones and return `ok:false` with the first error message.
- [ ] **Step 4: Run** `npx vitest run tests/booking.test.ts`, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(life): booking orchestration with rollback`

### Task 3: Apps Script bridge calendar ops and setup docs

**Files:**
- Modify: `life/google-tasks-bridge.gs`
- Modify: `docs/LIFE_ASSISTANT.md` (step 10 "Google Tasks" → "Google Tasks and Calendar")

**Interfaces:**
- Produces: these bridge ops, which `calendar.ts` (Task 4) calls through `gcall`:
  - `calEvents {from,to}` → `CalEvent[]`
  - `calCreate {event: NewEvent}` → `{id,start,end}`
  - `calUpdate {id, patch}` → `{id,start,end}`
  - `calDelete {id}` → `{ok:true}`
  - `ping` → `{ok:true, calendar:true}`

- [ ] **Step 1: Add the ops to `run_`.**
  - Use `CalendarApp.getDefaultCalendar()`.
  - `calEvents` maps `getEvents(new Date(from), new Date(to))` to `{id:getId(), title:getTitle(), start/end ISO, allDay:isAllDayEvent(), description:getDescription()}`.
  - `calCreate`:
    - Use `createAllDayEvent` or `createEvent`, with `{location, description}`.
    - Then `removeAllReminders()` and `addPopupReminder(m)` for each m.
  - `calUpdate` and `calDelete`:
    - Find the event with `getEventById`. A missing event: delete returns ok, update throws `'event not found'`.
    - Throw `'not a jarvis event'` unless the description contains `[jarvis]`.
    - Update applies `setTime`, `setTitle`, `setLocation`, `setDescription` and the reminders when given.
  - Rename the header comment and `doGet` service to `jarvis-google`. Update the setup comment to add Calendar, which `CalendarApp` uses with no Advanced Service needed.
- [ ] **Step 2: Add `selfTest()`.** It creates `[jarvis] selftest` yesterday 10:00–10:15, updates it to 10:15–10:30, checks `calEvents` finds it, deletes it, and `Logger.log('selftest ok')`. Also check that `calDelete` on an event without `[jarvis]` throws: create a plain one, try, then delete it directly with `ev.deleteEvent()`.
- [ ] **Step 3: Check the syntax.** Run `node --check` on a copy: `cp life/google-tasks-bridge.gs "$SCRATCH/bridge.js" && node --check "$SCRATCH/bridge.js"`. Expected: no output.
- [ ] **Step 4: Update `docs/LIFE_ASSISTANT.md` step 10.**
  - Retitle it "Google Tasks and Calendar".
  - Add a sub-step: "Run `selfTest` once from the editor (▶) and check the log says `selftest ok`."
  - Note that the deploy approval now covers Calendar.
  - Note that an existing deployment needs **Manage deployments → edit → New version**, which keeps the same URL.
  - In "Tasks vs events", replace "within 3 hours" wording with "instantly when the bridge is linked, otherwise at the next sync".
- [ ] **Step 5: Commit** `feat(life): calendar ops in the Google bridge`

### Task 4: life-bot `calendar.ts` (bridge binding, live reads, job booking)

**Files:**
- Create: `supabase/functions/life-bot/calendar.ts`
- Modify: `supabase/functions/life-bot/gtasks.ts:11-20`, so that `gcall(op, args = {}, timeoutMs = 25000)` passes `signal: AbortSignal.timeout(timeoutMs)`

**Interfaces:**
- Consumes: `Bridge`, `bookEvent`, `removeEvents`, `moveEvent`, `BookSpec` (Task 2); `busyFromEvents`, `CalEvent` (Task 1); `gcall` and `gtasksEnabled` (gtasks.ts).
- Produces:
  - `gcalEnabled(): boolean`
  - `bridge: Bridge`, whose ops use `gcall('cal…', …, 8000)`
  - `refreshCache(db: Db, userId: string, evs: CalEvent[]): Promise<void>`, an upsert into `life_calendar_cache` on `(user_id,event_id)` with `synced_at = now()`
  - `liveEvents(db: Db, userId: string, from: Date, to: Date): Promise<{ events: CalEvent[]; live: boolean }>`. With the bridge enabled it calls `bridge.list`, then `refreshCache`. On error or when disabled it falls back to `life_calendar_cache` rows mapped to `CalEvent` with `description: ''`.
  - `bookJob(db: Db, userId: string, jobId: string, spec: BookSpec): Promise<{ booked: boolean; ids: string[]; reason?: string }>`. On success: job `status='done'`, `result='created by life-bot'`, `payload.event_ids = ids` (merge, keep the rest), `done_at=now()`, then `refreshCache`. On failure or when disabled: job `status='pending'`, `booked:false`, `reason`.
  - `undoJob(db: Db, userId: string, jobId: string): Promise<'removed' | 'queued' | 'gone'>`
    - No `payload.event_ids` → `'gone'`, with the job cancelled if it was pending.
    - The bridge removes them all → job `cancelled`, cache rows deleted, `'removed'`.
    - Otherwise insert the existing `delete_event` job and return `'queued'`.

- [ ] **Step 1: Write `calendar.ts` and the `gcall` timeout change.** This module is the Deno/DB glue around the logic tested in Tasks 1–2, so it has no vitest test of its own. It is verified live in Task 8.
- [ ] **Step 2: Typecheck.** Run `npx --yes deno@2 check supabase/functions/life-bot/index.ts`. If the deno npm package can't be fetched, write "not run (no deno)" in the commit body. Expected: no type errors.
- [ ] **Step 3: Commit** `feat(life-bot): calendar module over the bridge`

### Task 5: agent tools (instant add_event and blocks, live free_time/get_schedule, edit_event, offer_slots)

**Files:**
- Modify: `supabase/functions/life-bot/agent.ts`: SYSTEM (lines 28-53), tools list (~193-260), `add_event` (453-484), `free_time` (485-512), `get_schedule` (513-529)

**Interfaces:**
- Consumes: Task 4 exports; `pickSlots`, `slotLabel`, `matchJarvisEvents`, `jobIdOf`, `busyFromEvents`, `eventTitle` (Task 1); `moveEvent` (Task 2).
- Produces: tools `add_event` (new optional `block: boolean`), `edit_event`, `offer_slots`; keyboard data `ev:<jobId>:undo`, `sw:e:<jobId>`, `sl:<jobId>:<i|x>`.

- [ ] **Step 1: Write `add_event`.**
  - Keep the clash, reminder and travel computation.
  - `block: true` → reminders `[]`, kind `other`.
  - Insert the job with `status: 'running'` and `payload.via = 'life-bot'`, then `bookJob`.
  - Booked → return `{ booked: true, when, reminders, travelBufferMin, clashes, text: bookedText(...) }` and keyboard `[[↩️ Undo ev:<id>:undo, ↔ Make it a task sw:e:<id>]]`.
  - Otherwise return `{ queued: true, reason, note: 'Google Calendar is out of reach right now; the sync adds it within 3 hours.' }` and keep only the ↔ button.
- [ ] **Step 2: Extract `busyFor(ctx, from: Date, to: Date)`.** It builds the shifts+prep, sleep and nap intervals plus `busyFromEvents((await liveEvents(...)).events)` and returns `{ busy, plans, live }`. `free_time` and `get_schedule` use it (get_schedule lists events from `liveEvents`). Their `note` says "live from Google Calendar" when `live`, and the existing lag note otherwise.
- [ ] **Step 3: Add the `edit_event` tool.**
  - Input: `{ title: string; date?: string; action: 'move' | 'delete'; new_date?: string; start?: string; end?: string }`.
  - With the bridge disabled → queue a `calendar` job (current behaviour) and say it was queued.
  - Otherwise:
    1. Take `liveEvents` over `date ± 1 day`, or today−1 to today+14 when there's no date, and run `matchJarvisEvents`.
    2. 0 matches → `{ found: 0 }`. More than one → `{ candidates: [title, local start] }`.
    3. 1 match: the group is the events sharing its `jobIdOf`. Travel blocks are those titled `🚗 Travel`.
    4. Delete → `removeEvents` and set the job (if found) to `cancelled`.
    5. Move → `moveEvent`, keeping the duration when `end` is absent, and update `payload.start/end/local`.
    6. Then `refreshCache`, and delete removed rows from `life_calendar_cache`.
- [ ] **Step 4: Add the `offer_slots` tool.**
  - Input: `{ title, kind, minutes, from, to, location?, notes?, outdoor? }`. Default `outdoor` to `kind==='personal' && /errand|shop|bank|car|haircut|groceries/i.test(title)`.
  - Use `busyFor` → `freeWindows` (minutes + 2×travel) → `pickSlots` with `offDays` = plan dates without `shift_kind`.
  - Insert `life_jobs` `{ kind:'calendar', status:'offered', instruction:'Slot offer: <title>', payload:{ type:'event', via:'life-bot', title, kind, location, notes, reminders_min, travel_buffer_min, slots:[{start,end}], timezone } }`.
  - Keyboard: one row of up to 3 `slotLabel` buttons `sl:<id>:<i>`, then a row `✖️ None` → `sl:<id>:x`.
  - Return `{ offered: n, slots: labels }`, or `{ offered: 0 }` with no keyboard.
- [ ] **Step 5: Rewrite the SYSTEM lines.**
  - Lines 30-32, the calendar half: Google Calendar events are now added, moved and deleted instantly by `add_event` and `edit_event` when linked. If a tool result says `queued`, tell the owner it lands within 3 hours. Never claim a booking the tool didn't confirm with `booked: true`.
  - Line 53, "Blocking time": use `add_event` with `block: true`.
  - New bullet: "No time given for an event ('find me an hour for a haircut this week') → `offer_slots`, and say one line like 'Three openings for a 1 h haircut:'. The buttons are attached."
  - New bullet: "Move/cancel an appointment → `edit_event`. If it returns candidates, ask which one."
  - Remove "calendar" from the `queue_job` description examples except for "events the owner made themselves, only when explicitly asked".
- [ ] **Step 6: Typecheck** as in Task 4 Step 2, then run `npm test` (PASS).
- [ ] **Step 7: Commit** `feat(life-bot): instant add/move/delete and slot offers`

### Task 6: Telegram callbacks (slot tap, Undo, instant ↔ switch) and the 'offered' status

**Files:**
- Create: `supabase/migrations/0034_life_jobs_offered.sql`
- Modify: `supabase/functions/life-bot/index.ts`, `handleCallback` (around lines 220-245)

**Interfaces:**
- Consumes: `bookJob`, `undoJob`, `liveEvents`, `bridge` (Task 4); `offerExpired`, `OFFER_TTL_MS`, `slotLabel`, `bookedText`, `busyFromEvents` (Task 1).

- [ ] **Step 1: Write the migration.** `alter table public.life_jobs drop constraint life_jobs_status_check; alter table public.life_jobs add constraint life_jobs_status_check check (status in ('pending','running','done','failed','cancelled','offered'));` Add a header comment in the style of `0031_life_prune.sql`.
- [ ] **Step 2: Handle `sl:<id>:x`.** Run `update life_jobs set status='cancelled', result='no slot picked', done_at=now() where id=? and status='offered'` and settle to `✖️ No slot picked`.
- [ ] **Step 3: Handle `sl:<id>:<i>`.**
  1. Claim the offer atomically: `update … set status='running' where user_id=? and id=? and status='offered' and created_at > now() - 48h returning payload`. With no row, answer the callback `'Already booked or expired'` and stop.
  2. Re-check the chosen slot (padded by travel) against `busyFromEvents(liveEvents(...))`. If it's taken, set the status back to `'offered'`, answer `'That one just filled'`, and send a new message with the remaining slots' buttons.
  3. Otherwise call `bookJob` with a `BookSpec` from the payload and the slot.
  4. Booked → `settleButtons` with `📅 Booked <slotLabel> · <title>`, then `sendMessage(bookedText(...))` with `[[↩️ Undo ev:<id>:undo]]`.
  5. Queued → settle to `📅 <slotLabel> · queued (within 3 h)`.
- [ ] **Step 4: Handle `ev:<id>:undo`.** Call `undoJob` and settle by result: `removed` → `↩️ Removed`; `queued` → `↩️ Removed at the next sync`; `gone` → `Already gone`.
- [ ] **Step 5: Update the `sw:e` branch.** When `payload.event_ids` exists, call `undoJob` instead of inserting the `delete_event` job, and drop the "removed at the next sync" suffix when it returned `removed`.
- [ ] **Step 6: Typecheck** as in Task 4, then run `npm test`.
- [ ] **Step 7: Commit** `feat(life-bot): slot buttons, undo and instant switch`

### Task 7: Sync routine fallback guards

**Files:**
- Modify: `life/routines/sync.md`, step 1, `calendar` bullet (around lines 30-36)
- Live: the "Jarvis sync (every 3 h)" trigger `trig_01UzJbYDg2VvqgcNgzrjz6py`. Its prompt must equal the file afterwards.

- [ ] **Step 1: Add the two rules from spec §7 to step 1.**
  - Before creating a `payload.type='event'`, search the calendar for an event whose description contains `jid:<job id>`. If one exists, mark the job done ("already created by life-bot") and create nothing.
  - Also process `calendar` jobs that are `running` for more than 10 min with `payload->>'via' = 'life-bot'`, using the same jid check. Skip `offered` jobs entirely.
  - Change the event description wording to `notes` + `[jarvis] <kind> · jid:<job id>` and the travel blocks to `[jarvis] travel · jid:<job id>`, so both paths write the same marker. Update the job query to `where status = 'pending' or (status = 'running' and kind = 'calendar' and payload->>'via' = 'life-bot' and created_at < now() - interval '10 minutes')`.
- [ ] **Step 2: Update the live trigger prompt** with `update_trigger` (prompt = the full file). Verify by reading it back with `get_trigger` and diffing it against the file: they must be identical.
- [ ] **Step 3: Commit** `feat(life): sync guards for life-bot booked events`

### Task 8: Ship and verify live

- [ ] **Step 1: Push.** Open a PR to `main` and get the owner's OK to merge. The merge runs `deploy.yml`, which applies migration 0034 and deploys life-bot. Check the Deploy run is green.
- [ ] **Step 2: The owner does the setup** (docs step 10): paste the script, enable the Tasks service, set the script property, deploy as a web app, approve, set the `GTASKS_URL`/`GTASKS_SECRET` Supabase secrets, and run `selfTest` → `selftest ok`. Secrets are entered only in the dashboard.
- [ ] **Step 3: Verify the bridge from life-bot.** Send "what's my week" in Telegram: the reply note says live. In SQL, `select max(synced_at) from life_calendar_cache` must be within the last minute.
- [ ] **Step 4: Booking test.**
  1. Send "Test appointment tomorrow 10:00 at Oranjestad, medical". Expected: `📅 Booked` within about 5 s.
  2. In Google Calendar, check the event, its two 🚗 Travel blocks, and the 1 day and 2 h popups.
  3. Tap ↩️ Undo → `↩️ Removed`. All three events are gone.
- [ ] **Step 5: Slot test.**
  1. Send "find me an hour for a test haircut this week". Expected: three buttons on different days.
  2. Tap one twice quickly. Expected: one booking, and the second tap answers "Already booked or expired".
  3. Tap Undo.
- [ ] **Step 6: Sync check.** After the next sync run, check that none of the test events were recreated: `select status, result from life_jobs where payload->>'via'='life-bot' order by created_at desc limit 5`.
- [ ] **Step 7: Report** the results to the owner, listing each check as passed, failed or not run.
