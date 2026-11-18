# Instant scheduling from Telegram — design

Date: 2026-11-17 · Status: draft for owner approval · Part 1 of the "broaden Telegram" series

## Why

The owner mainly uses Jarvis on Telegram to schedule things. The biggest annoyance is that it is slow.

Today `add_event` (and "block a slot") only writes a `life_jobs` row. The 3-hourly Claude sync creates
the Google Calendar event later. So a booking can take up to 3 hours, and it fails completely when that run
hits a usage limit (15–16 Nov). `free_time` and `get_schedule` read `life_calendar_cache`, which can be up to
3 hours old, so the slots they suggest can be wrong.

**Success:**
- "Dentist Tue 10:00 at Oranjestad" is in Google Calendar within seconds, and the reply confirms it.
- "Find me an hour for a haircut this week" returns three slot buttons, and tapping one books it on the spot.

## Goals

1. Create, move and delete Jarvis-made events (`[jarvis]` in the description) instantly from life-bot.
   Travel blocks and the popup reminders are handled at the same time.
2. Slot offers: when a request has no fixed time, reply with up to three bookable slot buttons plus ✖️ None.
   One tap books the slot and updates the message.
3. Live calendar reads: `free_time` and `get_schedule` read Google Calendar directly through the bridge. If the
   bridge is unavailable they fall back to the cache. Each live read also refreshes the cache for that range.
4. Each confirmation carries ↩️ Undo (deletes the event and its travel blocks) and the existing ↔ Make it a task.
5. Nothing gets lost. If the bridge is not set up or fails, life-bot falls back to the current queued
   `life_jobs` path and says so honestly ("queued, within 3 h").

## Non-goals

- Work shifts. They keep going roster → `propose_shifts` → sync step 2, because the shift reminders logic lives there.
- Editing or deleting events the owner made themselves (no `[jarvis]`). This hard rule stays.
- Voice notes, photos, week cards, workout recaps, shift pings, the menu and quiet hours. Those are later parts.
- Calendars other than the owner's default (primary) calendar.
- Google OAuth or a Cloud project (approach B was rejected).

## Anti-goals (a failure even if it "works")

- Jarvis says an event exists when it doesn't. Every "📅 Booked" must come from a successful bridge
  response that carries an event id.
- A double booking, caused by a tap repeated or redelivered by Telegram, or by a sync run re-creating an event
  that life-bot already made.
- Touching an event without `[jarvis]`.
- Setup that needs re-doing every week.

## Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| **A** | Extend the existing Apps Script bridge (`life/google-tasks-bridge.gs`) with calendar ops, and have life-bot call it | One setup step for the owner (paste, deploy, approve once). 1–3 s per call. No token expiry. Also unlocks the pending Google Tasks sync. | **Chosen by the owner** |
| B | Google Calendar REST API with an OAuth client and refresh token | Fastest, but needs a Cloud project. In testing mode the refresh token expires every 7 days, a recurring chore. | Rejected |
| C | Fire the sync trigger right away for each booking | No Google setup, but takes minutes, uses Claude usage, and fails at usage limits | Rejected |

## Design

### 1. Bridge (`life/google-tasks-bridge.gs` → keep the file name, rename the service to "jarvis-google")

New ops, all through `CalendarApp.getDefaultCalendar()` and returning plain JSON:

| op | args | returns |
|---|---|---|
| `calEvents` | `from`, `to` (ISO) | `[{id, title, start, end, allDay, description}]` for that range |
| `calCreate` | `title, start, end, allDay, location, description, remindersMin[]` | `{id, start, end}`. Popups are set to exactly `remindersMin` (`removeAllReminders` then `addPopupReminder`). |
| `calUpdate` | `id`, plus any of `title, start, end, location, description, remindersMin` | `{id, start, end}` |
| `calDelete` | `id` | `{ok:true}`. The script itself refuses unless the event description contains `[jarvis]`, so the hard rule is enforced in two places. A missing event counts as success. |

- `doGet` still answers `{ok:true}`. Add `ping` → `{ok:true, calendar:true}` so life-bot can tell whether the deployed version has calendar access.
- Ownership marker: life-bot writes the description `notes + "\n[jarvis] <kind> · jid:<uuid>"`. The `jid` is the
  `life_jobs` id, so the sync and Undo can find the exact event.

**Owner setup:** the bridge has never been deployed (0 of 8 tasks have a `gtask_id`). So this is the existing 5-step
guide in `docs/LIFE_ASSISTANT.md`, done once with the new script. One approval covers both Tasks and Calendar.
The secrets stay `GTASKS_URL` and `GTASKS_SECRET`, so nothing is renamed. The guide gets a "Calendar" note.

Side effect the owner should expect: on the next tick the five task lists are created and the 8 open tasks appear in
Google Tasks. This behaviour is already built, and the same secrets switch it on.

### 1b. Database (migration `0034_life_jobs_offered.sql`)

`life_jobs_status_check` allows only pending, running, done, failed and cancelled. Add `'offered'` for slot offers.

### 2. life-bot: `gcal.ts` (new, next to `gtasks.ts`)

- `gcalEnabled()` uses the same env check as `gtasksEnabled`. `gcall` is reused, with a timeout of about 8 s per call.
- `listEvents(from, to)`, `createEvent(e)`, `updateEvent(id, patch)`, `deleteEvent(id)`.
- `refreshCache(db, userId, from, to, events)` upserts into `life_calendar_cache`. It does not prune. Pruning
  stays with the sync, which already uses `life_prune_calendar_cache`.

### 3. Booking flow (`add_event`)

The current clash, reminder and travel calculation is kept as it is. Then:

1. Insert the `life_jobs` row exactly as today, but with `status = 'running'`. The row is the record, the idempotency key and what Undo uses.
2. If the bridge is enabled, call `createEvent` for the main event and, when travel > 0, the two `🚗 Travel` blocks
   (`[jarvis] travel · jid:<id>`). Event ids go into `payload.event_ids`. Then set `status = 'done'` with `result = 'created by life-bot'` and upsert the cache.
3. If the bridge is off or any call fails, delete whatever was already created for this job, set `status = 'pending'`,
   and the sync does it exactly as today. The tool result says which path ran: `{booked:true}` or `{queued:true, reason}`.
4. The title prefix by kind (🩺 📌 👥 🏋️ 📅) moves from `sync.md` into code (`lifeLogic.ts`, unit-tested) so both paths match.
5. Keyboard: `[↩️ Undo] [↔ Make it a task]`.

"Block a slot" (focus time, an errand, a ride) also goes through `add_event` (kind `other`, `block: true`, no
reminders unless asked) instead of `queue_job`. The SYSTEM prompt text about "queued, within 3 hours" for
calendar is rewritten. `queue_job` kind `calendar` stays for anything unusual, such as moving an owner event when asked explicitly.

### 4. Move and delete

- New tool `edit_event` with `{ match: title words + date, action: move|delete, date?, start?, end? }`.
- It searches live events (bridge) in a ±14-day window and keeps only those with `[jarvis]`. If it finds exactly
  one, it acts and moves or deletes its travel blocks, matched by `jid`. If there are several, it returns them so
  Jarvis can ask. If there are none, it says so and never touches non-Jarvis events.
- The job row's payload is updated with the new times.

### 5. Slot offers

- New tool `offer_slots` with `{ title, kind, minutes, from, to, location?, notes? }`. It runs the same `free_time`
  computation, now on live events, and picks up to three slots.
- Picking (my call, in `lifeLogic.ts`, tested):
  - Spread across different days first.
  - Off days and daytime first.
  - Outdoor or errand kinds avoid 11:00–16:00.
  - Never in sleep, a nap or shift prep.
  - Start on the hour or half hour.
  - Include the travel buffer on both sides when there's a location.
- Store as a `life_jobs` row with `status = 'offered'`, payload `{type:'event', …, slots:[{start,end}]}`.
- Buttons: `sl:<jobId>:0|1|2` labelled `Thu 14:00`, and `sl:<jobId>:x` labelled `✖️ None`. This stays well under Telegram's 64-byte callback limit.
- Tapping a slot:
  1. Atomically claim it: `update … set status='running' where id=? and status='offered'`. If no row changes, answer "Already booked".
  2. Re-check that slot against live events. If it was taken in the meantime, answer "That one just filled" and offer the remaining slots.
  3. Book it with the flow in §3.
  4. `settleButtons` → `📅 Booked Thu 14:00–15:00 · Haircut`, plus a new message with Undo.
- Offers older than 48 h are ignored. The tap answers "Expired, ask again".

### 6. Undo and ↔ switch

- `ev:<jobId>:undo` deletes every id in `payload.event_ids` through the bridge (bridge-side `[jarvis]` check),
  sets the job to `cancelled`, removes those cache rows, and settles the buttons to `↩️ Removed`. If the bridge
  fails, it queues the existing `delete_event` job and says "removed at the next sync".
- The existing `sw:e:` event→task switch uses the same delete when `payload.event_ids` exists. That makes it
  instant, instead of the queued delete it does today.

### 7. Sync routine (`life/routines/sync.md`)

- Step 1, `calendar` jobs: skip jobs that are not `pending`. That is already true, because life-bot marks its own `done`.
  Add one line: before creating a `payload.type='event'`, search for an event whose description contains
  `jid:<job id>`. If one exists, mark the job done and don't create another. This guards against a half-finished life-bot attempt.
- Step 1 also picks up `calendar` jobs that have been `running` for more than 10 min with `payload.via = 'life-bot'`.
  That means life-bot crashed mid-booking. Run the same `jid` check, then create the event or mark the job done. life-bot sets
  `payload.via = 'life-bot'` on every row it runs itself.
- Step 4, the mirror, is unchanged. It still prunes the cache and catches owner-made events.
- The live trigger prompt must be updated to match the file, as was done for step 9.

### 8. Telegram copy

- Booked: `📅 <b>Dentist</b> · Tue 18 Nov 10:00–11:00 · Oranjestad`. Next line: `🚗 20 min travel either side · 🔔 1 day + 2 h before`. Then `⚠️ …` only if there are clashes.
- Queued fallback: `📅 Dentist · Tue 10:00. Google Calendar is out of reach right now, so I queued it (within 3 h).`
- The slot offer reply is one line ("Three openings for a 1 h haircut:") plus the buttons.

## Testing

- **Unit tests** (vitest, `tests/life.test.ts`, pure logic in `_shared/lifeLogic.ts`):
  - title prefix
  - slot picking: spread, heat window, travel padding, sleep, nap and prep exclusion, rounding
  - the description marker and `jid` parsing
  - offer expiry
- **Bridge:** a `ping` round-trip and a create → update → delete of a test event dated in the past. This is run once by
  the owner from the Apps Script editor with a small `selfTest()` function in the script. No test event is left on the calendar.
- **life-bot:** a mocked `gcall` covering the cases below. life-bot runs on Deno with `npm:` imports, so the
  booking, undo and claim logic is written as pure functions that take the bridge calls as parameters, which vitest can test:
  - booked path
  - fallback on a bridge error, which must leave no orphan events
  - a double tap on a slot, which books once
  - Undo
- **After deploy:**
  - book a real throwaway event from Telegram
  - check it's in Google Calendar with the right reminders
  - Undo it and check it's gone
  - check the next sync run doesn't recreate it

## Constraints

- Secrets stay in Supabase only. Nothing is pasted in chat.
- Only `[jarvis]` events are touched, enforced in life-bot and in the bridge.
- Timezone is the owner's (`life_profile.timezone`, usually America/Aruba). Apps Script receives ISO instants, so no local-time parsing happens in the script.
- Apps Script quotas (about 5k calendar writes a day on a consumer account) are far above use.
- life-bot must stay well under the edge-function time limit. Bridge calls run in parallel where independent (main event and travel blocks).

## Decided by the owner

- Approach A (bridge).
- Instant, with confirmation.
- Three slot buttons when a time is needed.
- Instant scheduling goes first. The later parts come in order: voice and photos → week and health cards → workout recap → shift pings, menu and quiet hours.

## My calls (owner can override)

- Keep the secret names `GTASKS_URL`/`GTASKS_SECRET`, and keep the one script for both Tasks and Calendar.
- Clashes: still book and warn, with Undo right there. This matches today's behaviour.
- "Block a slot" becomes instant through `add_event`.
- Up to three slots, spread across days, offers expiring after 48 h.
- Default (primary) calendar only.

## Left to the builder

- File layout inside life-bot beyond `gcal.ts`.
- Exact wording of tool descriptions.
- How the fetch stub is injected for tests.
