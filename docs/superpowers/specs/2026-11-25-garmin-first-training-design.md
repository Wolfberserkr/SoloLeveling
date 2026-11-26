# Garmin-first training: design

Date: 2026-11-25 · Status: approved approach (option 2) · Revision 6 (reviewer: WOWED, 9.5/10)

## Why

Logging sets in the Viking app is friction. The watch already walks the owner
through every session, and since 24 Nov he trains from it without opening the
app (Upper A 24 Nov and Lower A 25 Nov exist only on Garmin). The watch should
be the logger, Jarvis should do the thinking, and once a week Jarvis should
brief him on how training went and what to change.

## Goals

1. **Garmin is where training happens.** Every Viking session (lifts and rides)
   is on the watch with the right exercises, sets, reps and **target kg**.
2. **Jarvis imports what the watch recorded**, within about 3 h, into Project
   Viking. When data is incomplete it assumes the plan and says so.
3. **Jarvis runs the progression.** It applies the Viking rules on its own and
   rewrites the next workouts on the watch. Bigger calls come as ✅/✖️ buttons.
4. **The cycle waits for the owner.** The 8-day cycle advances only when Garmin
   records the session. A missed session moves to the next day and everything
   behind it slides. The watch and Google Calendar follow.
5. **Google Calendar shows each session** as a timed `[jarvis]` block in that
   day's training window.
6. **A Saturday ~19:00 weekly briefing** on Telegram: a training deep-dive,
   recovery and readiness against shifts, habits done, and suggestions with
   buttons. Approved changes go into the next week's plan.
7. **Ascend is retired**, and three habits live on as recurring Google Tasks
   with shift-aware reminders.

## Non-goals

- **Reset (D's portal) is untouched.** No file under `src/features/reset/`, no
  `reset_*` table, and no Reset test changes.
- Weigh-in, waist, food and supplements tracking: the owner tracks these
  elsewhere for now. Garmin weigh-ins keep flowing into Viking as today.
- Big goals and Norwegian practice are dropped.
- Money, subscriptions and inbox leave the weekly briefing. They become a
  **monthly** message on the first Sunday of the month.
- Exercise swaps are not automated (see Decisions).

## Anti-goals

- A wrong weight on the watch:
  - a jump bigger than one progression step
  - a kg on a bodyweight or assisted move
  - a target made up from a "kg not recorded" set
- Progression that moves on assumed data. A rep the watch didn't count never
  earns a heavier weight.
- Duplicate or orphaned workouts on the Garmin calendar, two Viking workouts on
  one day, or Jarvis editing or deleting anything it didn't make.
- Silent guessing: every assumption made on import shows in the recap.
- Live behaviour changing before the owner flips the switch.

## Constraints

- **Only the Claude routines can reach Garmin** (Garmin connector). The
  `life-bot` edge function (Deno, minute tick) reaches Supabase, Telegram and
  Google Calendar/Tasks (Apps Script bridge), but not Garmin.
- Viking data is `viking_docs (user_id, coll, doc_id, data)`.
  - A CHECK constraint lists the allowed colls (0028/0029).
  - The app loads every row and keeps the `COLLS` ones.
  - PostgREST caps a request at 1000 rows.
- The Viking rules live in `src/features/viking/{vikingData,vikingLogic,bikePlan,bikeLogic}.ts`
  with extensionless imports. Deno needs `.ts` imports, which `tsconfig`
  already allows. `tsconfig` covers only `src` and `tests`, so nothing
  type-checks `supabase/functions/life-bot/*` today.
- **Garmin facts, verified on the owner's account on 25 Nov:**
  - A workout step carries `weightValue` (kg) and a reps `endCondition`. Each
    exercise is a `RepeatGroupDTO` of [exercise step, rest step].
  - A recorded set's `wktStepIndex` is the FIT step index. With
    [exercise, rest] groups, the g-th exercise has index **3g**: the group's
    children come first, then its repeat step. Seen on Lower A 25 Nov (6
    groups of 2–3 iterations: indices 0…15) and on the Upper B deload 20 Nov
    (2-iteration groups: 0, 3, 6). Not yet seen on 1-iteration groups.
  - Not counting reps is **normal**:
    - 20 Nov: every set has `repetitionCount: null`
    - 25 Nov: the squats are null, while the RDL, leg press, curl and calf sets
      have counts
  - Weight carries over from the previous exercise when the step had no weight
    (25 Nov crunch: 82000 g). It's null on a bodyweight pull-up.
  - Sessions can end with an extra `UNKNOWN` set with `wktStepIndex: null`
    (20 Nov). Recorded sets can be fewer than planned.
  - Activity names are cut to about 32 chars ("Viking Upper B · deload (Fri 20").
  - The Sunday 22 Nov sync scheduled library and dated `Viking …` workouts
    through Sat 28 Nov. They're on the Garmin calendar now.
- The library workouts have drifted from the written plan, and **the written
  plan wins** (owner's decision). Workouts are generated from `SESS`. The four
  library workouts stay on Garmin and are never edited or deleted, but they
  may be **unscheduled**.
- Scheduled tasks hold **inline copies** of the routine prompts. Repo edits
  take effect only once the trigger prompts are updated. The weekly review is
  `trig_01NpEtQTQpdD6FT6qV3r7PN8` (Sun 18:47 Aruba).
- pg_cron `ascend-reminders` (hourly) is active.
- Timezone America/Aruba (UTC−4, no DST). Viking start 2026-10-10. There are no
  `cycle` docs yet; the last app-logged session is `2026-11-22_LB`.

## Approaches considered

1. **All in the routine prompts.** The math lives in prose and drifts.
   Rejected.
2. **Tested code decides, the routine carries it out (chosen).** Shared pure
   rules plus an engine run by the life-bot tick. The routine only copies raw
   Garmin data in and ready-made workout JSON out.
3. **life-bot talks to Garmin directly.** No reachable API. Rejected.

## The design

### Switch

Everything new in life-bot is gated by `life_profile.prefs.vikingGarmin === true`.
`prefs.vikingGarminSince` (`'2026-11-24'`) is the first date to import.
- Rides before it never tick the cycle.
- Settling starts at the day before the switch-on date.

With the switch off, the tick does nothing new. The new routine prompts check
the same switch: when it's off they leave Garmin training alone and skip the
Viking parts.

The work ships as **two PRs**, so the first merge changes nothing the owner can
see.
- **PR 1: engine, routines, habits code.**
  - It's inert until the switch is on and the habits are seeded.
  - The only visible side effect: `listIds` creates an empty "Habits" list in
    Google Tasks on its next run.
  - `rollHabits` only touches Habits rows, and there are none before the seed.
- **PR 2: the read-only app and Ascend's retirement** (UI and the
  `ascend-reminders` cron job).
  - It's merged only after the Garmin flow has run correctly for at least a few
    days.
  - Until then the app still works as it does today, so the owner keeps a
    manual fallback.

### Data flow

```
watch ─▶ Garmin Connect ─(routine, every 3 h)─▶ viking_docs garmin_in/<activityId>  (raw sets)
                                                   │  rides/<date>_g<id> (as today)
                  life-bot tick (every minute)      ▼
   engine: settle days · import (date order) · cycle ticks · recap (Telegram, once)
           rebuild → plan/current (7 days, targets, Garmin DTOs, hash) · plan/<date> snapshot
           calendar → [jarvis] training blocks via the bridge
                                                   │
                  routine (same or next run)        ▼
   mirror plan/current → Garmin workouts + Garmin calendar (+ unschedule library) → watch
```

### Shared code

- `supabase/functions/_shared/viking/` holds the moved rule files (`data.ts`,
  `logic.ts`, `bikePlan.ts`, `bikeLogic.ts`) and the new pure modules
  (`garmin.ts`, `targets.ts`, `garminImport.ts`, `planner.ts`,
  `calendarPlan.ts`, `weekly.ts`, `recap.ts`).
- It also holds `engine.ts`, which runs one tick against a `VikingStore`
  interface (I/O injected). It's unit-tested with an in-memory store, and
  life-bot supplies the Supabase/Telegram/bridge implementation.
- CI adds `deno check` on `supabase/functions/life-bot/index.ts`.

### Set data

- `SetEntry` gains an optional `est?: Array<'kg' | 'reps'>`. It marks values
  that were assumed, not recorded. The app ignores it.
- `WorkoutDoc` gains:
  - `source?: 'garmin'`
  - `garminIds?: string[]`
  - `startedAt?: string`: the UTC ISO start of the (first) activity, i.e. when
    he trained, not when it was imported

  Everything time-based (resets, applied suggestions) compares against
  `startedAt`, falling back to `savedAt`.

### Progression (`targets.ts`, what the watch shows next)

Per exercise, over its logged sessions, counting only those **after the
exercise's last reset** (if any):
- **Weighted moves** (`inc` bbU, bbL, mU, mL, db, iso):
  - Known sessions are those with at least one set whose kg is > 0 and not
    `est`. With none: kg **null** and reps = the bottom of the range ("First
    time", or "kg not recorded yet").
  - From the last known session: `top` = its max real kg.
  - `hit`: all of these hold:
    - at least as many sets were recorded as were planned for that session
      (`setCount` with that doc's phase and deload)
    - every set's reps were recorded (not `est`)
    - every set's reps are ≥ the top of the range

    On a hit: kg = top + `STEP[inc]`, reps = the bottom of the range.
  - Reps not recorded: kg = top, reps = the same target as last time. **No
    advance.** The note says so. One tap on the recap's "✅ as planned" button
    turns those assumed reps into recorded ones (see Recap).
  - Otherwise: kg = top, reps = the lowest recorded reps + 1, kept within the
    range (never below its bottom or above its top).
  - `stalled`: not a hit, at least 4 known sessions, and the best e1RM of the
    last 3 ≤ the best e1RM before them. It's measured over real sets only.
- **Assisted pull-up** (`pull`):
  - kg ≤ 0 is the assist.
  - The assist target follows the same hit rule: assist + 2.5, capped at 0.
  - It's kept in `assistKg`, never put on the watch, and shown in the step
    description ("assist 20 kg").
  - With no assist history, it progresses by reps like a bodyweight move.
- **Bodyweight** (`bw`):
  - kg null.
  - Reps = the bottom of the range the first time, then the last session's
    lowest recorded reps + 1, within the range. Reps that weren't recorded hold
    the target.
  - At the top, the note says "Top of range: slow the tempo".
- **Reset override** (from an approved suggestion): kg = 90 % of top, rounded
  down to the step, reps = the bottom of the range. The reset time also becomes
  the new baseline for `stalled`.
- **Sets:** `setCount(ex, session, phase, deload)`.
- **Bound:** the target kg is never above the last real top + one step, never
  below 0, and never present for `bw`/`pull`.

The app's own `exHint` stays as it is. The app is read-only, so Jarvis's
targets are the only ones that matter.

### Import (watch → Viking)

**Order.** In date order, `garmin_in` docs and new rides (dated on or after
`since`, and not in `plan/state.ridesSeen`) are processed as one stream.
`settle` runs for each finished day in between. `savedAt` = now + i, and the
in-memory data is updated after each write. Before applying an activity, the
engine claims `vkimp:<activityId>` in `life_nudge_log`, so overlapping ticks
can't double-apply or double-send.

**Session.** The name prefix `Viking (Upper|Lower) (A|B)` decides it. Without
one, the session with the most category matches wins (≥ 3 needed, and a tie
means none).

**Set → exercise.** Sets that aren't `ACTIVE` (rest, warm-up, others) are
ignored and not counted.
1. With an index that is a multiple of 3, the candidate is
   `SESS[sk].ex[idx / 3]`.
   - Accept it when its Garmin category equals the set's, and either side lacks
     an exercise name or the names are equal.
   - Also accept it when the candidate has **no Garmin category** (`legext`,
     `revpec`) and the set's category is null, `UNKNOWN`, or matches no other
     exercise in the session.
2. Otherwise, take the session exercise with the same category and name.
3. Otherwise, take the only session exercise with that category.
4. Otherwise (including `UNKNOWN`/null sets with no usable index), drop the set
   and count it.

**Values ("assume the plan").**
- **Reps null:** use the planned reps, from the `plan/<date>` snapshot or else
  the bottom of the range, and mark it `est: ['reps']`.
- **Weight null:** use the planned kg when there is one, and mark it `est`.
  Otherwise kg 0, marked `est`.
- **Carried-over weight:** the weight equals the previous ACTIVE set's, that
  set was a different exercise, and this exercise had no planned kg. Then kg is
  0, marked `est: ['kg']`, and noted "kg not recorded".
- **`bw`:** kg 0.
- **`pull`:** the watch never carries weight on it. A null weight is
  **recorded**, not assumed. kg = the planned `assistKg` (≤ 0), or 0 with no
  assist planned, and **not** marked `est`. Only missing reps are `est`.
  - When the planned assist is below 0, the recap still says so: "Pull-up:
    assist taken as 17.5 kg (the watch can't record it)".
- **Dated before `since`:** marked processed with result `before switch-on`, and
  not imported.
- **Fewer sets than planned** (snapshot, else `setCount`): noted "2 of 3 sets".

**Doc.**
- New: `workouts/<date>_<sk>` with `source: 'garmin'`, `garminIds: [id]`, and
  entries in plan order.
- If that doc exists with `source: 'garmin'` and without this id: merge the
  sets per exercise (a split or restarted session).
- If it exists without `source` (typed in the app): leave it. The owner wins.

**Cycle.**
- The session matches the current cycle day: tick it `done`.
- A different session: tick `dayOfSession(sk)`, and the recap says the cycle
  moved.
- Tick ids are deterministic: `<date>_auto_<day>`.

**Rides.**
- A ride day (no gym, has ride codes) ticks `done` when the rides dated that
  day add up to ≥ 20 min, and the date is ≥ the last tick's date.
- Rides on gym days are extra.

**Recap** (once per activity):
- `🏋️ <b>Lower A saved</b> · Wed 25 Nov`
- one `•` line per assumption
- `Next time: Back squat 110→115 kg` (only weights that go up; at most 4)
- `Reps weren't counted on 3 exercises, so their targets stay. Reply e.g. "squat 3×6" if you did more.`
- the cycle line when it moved
- any new suggestion buttons

`Next time` uses `nextTargets` on the updated data for the session's next
occurrence.

**One-tap confirm:** when reps weren't counted, the recap carries buttons, one
per affected exercise (at most 4) plus one for everything:
`✅ Back squat as planned` (`vr:<activityId>:<exKey>`) and `✅ All as planned`
(`vr:<activityId>:all`). A tap removes `'reps'` from those sets' `est`, so they
count as recorded, and the next rebuild can advance the target.

**Order:**
- The workout, the tick and `processedAt` are written first.
- The recap is sent afterwards, best-effort, under its own claim
  `vkrecap:<activityId>`. A failed send is logged and never blocks the import.
  The log line names `viking_fix`/`viking_status`, the chat route for any
  confirms that were lost.
- If anything throws between the `vkimp` claim and `processedAt`, the claim is
  released, so the next tick retries.
- **A retry finishes the job:** when the workout doc already holds this
  activity (`already`), the engine still runs the tick (idempotent by id) and
  writes `processedAt`.
- **Retry spacing and poison docs:** each failure merges
  `{attempts, firstFailedAt, lastFailedAt}` into the doc (a jsonb merge, never
  a replace). A failed doc is retried only once 15 min have passed since
  `lastFailedAt`. After at least 3 failures over at least 1 h, it gets
  `processedAt` with result `error: <message>`, and one Telegram line goes out:
  "Couldn't read the Garmin session of <date>. Send me the sets, e.g. 'Lower A
  today: squat 3×5 at 110', or ignore this." `viking_fix` can then create the
  doc. It's never retried after that. Only this error message invites
  `viking_fix`: creating a doc while that date's import is still pending would
  make the import lose to it (`owner-doc`).
- **A retry finishes the recap too:** on `already`, the engine writes
  `result = <docId>`, rebuilds an `ImportResult` from the stored doc and the
  `plan/<date>` snapshot, with the same assumption builder the first import
  uses. Then it sends the recap under the same
  `vkrecap` claim, buttons included.

### Cycle settling

For each finished date after `plan/state.settledThrough`:
- A tick dated that day: nothing to do.
- Day 8 (rest): tick `done`.
- A day with no gym whose only ride is optional (phase 1 day 7): tick `skip`.
- Otherwise: **no tick.** The same cycle day carries to the next date (a
  slide), and the date is added to `plan/state.slidDates`.

A late import for a slid date ticks that date, so the plan catches up. Any
tick that lands on a date in `slidDates` (late or realigned) removes that date
from `slidDates`.

### The plan (`planner.ts`)

```
PlanCurrent = { builtAt, date, week, phase, deload, cycleDay, hash,
                days: PlanDay[7], suggestions: Suggestion[] (pending only) }
PlanDay     = { date, cycleDay, kind: 'gym'|'ride'|'rest', session?, targets?,
                ride?: { code, from?, minutes, reason? },
                garmin?: { name, sport, dto, hash }, reason? }
plan/<date> = { date, session?, ride?, targets? }   (snapshot of that day as planned; no DTO)
plan/state  = { since, settledThrough, slidDates[], ridesSeen[], resets: {ex: ISO},
                suggestions: Suggestion[], blocks: {date: BlockState}, frozen?: {date, day} }
plan/garmin = { [date]: { name, workoutId, hash, mirroredAt } }   (written by the routine)
```

- Day 1 is today, or tomorrow when today already has a workout or tick.
- **Ride codes:** "in the last 8 days" means the 8 days up to and **including**
  the same date 8 days before, `dn(r) ≥ dn(date) − 8`. With no slides, the
  previous H1 sits exactly 8 days back, and the two alternate.
  - Day 3: H1, or H2 when an H1 was logged or planned in that window.
  - Day 7 from phase 2: H3, or H2 when an H3 was logged or planned in that
    window. In phase 1 it's an optional R1, so the day is planned as `rest`.
  - The hard-ride **cap** keeps `hardIn`'s exclusive window,
    `dn(r) > dn(date) − 8`, so a ride exactly 8 days back doesn't count
    against it.
  - Phase B day 6: L1 when there's been no L1 since the diet break began,
    else E1.
- **Ride swaps**, in order: deload; the hard-ride cap (logged + planned);
  Lower A/B tomorrow; after a night/double shift ending 00:00–08:00; and, for
  today only, readiness. Readiness means HRV LOW/UNBALANCED, readiness < 40,
  sleep < 6 h, body battery < 30, or sleep stress ≥ 30. A swapped ride becomes
  an E1 ≤ 60 min, with a reason.
- **Today freezes** once the routine has mirrored it after today's wake time
  (`plan/garmin[today].mirroredAt ≥ wake_at`), so later readiness changes
  don't flip the watch mid-day. The freeze holds only while **both**:
  - the frozen day's `cycleDay` still equals the current cycle day, and
  - today has no workout or tick.

  A late import that moves the cycle drops it.
- **A freeze is taken only when all of these hold:**
  - `plan/garmin[today].mirroredAt ≥ wake_at`
  - `plan/garmin[today].hash` equals the current plan's hash for today (both
    rest counts as equal), so the freeze captures what is really on the watch
  - health is **seen**: the `healthSeenAt` **loaded at the start of this tick**
    (what the stored plan was built with) is ≥ today's
    `life_health.updated_at`, or there's no health row today
    - So the rebuild that first sees new health never freezes. The routine
      mirrors the new plan, and a later rebuild freezes it.

  A dropped freeze can be taken again under the same rules.
- **Fresh readiness reaches the watch:**
  - The routine's health upsert sets `updated_at = now()` on conflict, too.
    That costs one extra rebuild per 3-hourly run even when nothing changed,
    which is intended. Don't "optimise" it away. The
    column defaults to `now()` and has no update trigger, so without that it
    would keep the day's first insert time.
  - Every rebuild writes `plan/state.healthSeenAt` = the `updated_at` of
    today's health row it used. It's written whether or not the plan hash
    changed; `plan/current.builtAt` moves only when the plan does, so it can't
    serve.
  - `hasWork` is true when today's `life_health.updated_at > healthSeenAt`, so
    the tick rebuilds within a minute of the routine writing health.
  - No health row today counts as seen.
  - The routine's briefing and mirror use the same "seen" test. If it fails,
    they do the other steps first and check again. If it still fails, the
    briefing says "as of HH:MM", and the mirror skips *today*.
- The mirror also skips *today* while any `garmin_in` doc is unprocessed and
  was inserted less than 6 h ago (its `insertedAt`). The next run catches up.
- **Descriptions:** `Project Viking week <n> · <phase name>`, plus the swap
  reason when there is one, plus `Train <train_window>` when the day has one
  (passed in through `PlanCtx.windows`). This is written **before**
  `withMarker`. The hash excludes the description, so a window change alone
  never re-uploads.
- **Garmin names:** `Viking Lower A (Wed 25 Nov)`,
  `Viking Lower A · deload (…)`, `Viking E1 · Endurance 75 min (…)`.
- `garmin.hash = hashOf(dto with no description)`. The description then gets
  ` [viking:<hash>]` appended.
- **Rebuild** after any import, tick or suggestion change, when `plan/current.hash`
  was cleared, and every 15 min. `plan/current` is written only when the
  hash of `days + suggestions` changed.
- **Snapshots:** `plan/<date>` is written for today on each rebuild **only
  while today has no workout or tick**. After that it's never overwritten, so a
  second activity that day still reads what was planned.

### Garmin mirror (routine, every run when the switch is on)

For each day from today to +6 in `plan/current.days`. Skip *today* under the
two staleness rules in The plan section (unprocessed `garmin_in` younger than
6 h; plan built before today's health).
1. With a `garmin` entry:
   - `plan/garmin[date]` has the same hash and its workout still exists: keep
     it, and set `mirroredAt = now`.
   - Otherwise, find a workout with this exact name and `[viking:<hash>]`, or
     upload the DTO verbatim. Schedule it on the date. Only **then** unschedule
     any other `Viking…` workout on that date, the library ones included (never
     edit or delete those). If the replaced workout was one Jarvis made (it's in
     `plan/garmin`), delete it.
   - Record `{name, workoutId, hash, mirroredAt: now}`.
2. A rest day: unschedule every `Viking…` workout on that date. If
   `plan/garmin[date]` records a workout (one Jarvis made, now replaced by
   rest), delete it under the same checks, and record the day with `name`
   and `workoutId` null and `hash` `""`.

Never touch workouts not starting with `Viking `, or Garmin's own plans.
Cleanup: delete workouts recorded in `plan/garmin` more than 14 days past, and
drop their records. A stale `plan/current` is fine; the next run catches up.

### Google Calendar blocks (engine, through the bridge)

- **Dates:** today (only while today's session isn't logged) through +6.
- **Block:**
  - gym: `🏋️ Viking Lower A`, 60 min
  - ride: `🚴 Viking E1 · Endurance 75 min`, the DTO's total minutes + 10
  - Placement: the earliest 15-min-aligned free start inside the day's
    `train_window`. A text window means 16:30 + 3 h; with nothing free it goes
    at the window start, marked as overlapping.
- **The description:** `[jarvis] training · viking:<date>`.
- **`plan/state.blocks[date] = {eventId, key, start, end}`**, with
  `key = kind:session|code:minutes`. Per date:
  - Same key as stored: leave it, even if the owner moved or deleted it.
  - A new key: update the stored event if it still exists, else create.
  - No longer planned and in the future: remove the stored event if it exists.
  - No stored entry but a live `viking:<date>` event exists: adopt it.
- Skipped whenever the bridge is off or the read fell back to the cache
  (`live: false`). Times are compared as instants.

### Suggestions

- **Automatic:** weight bumps, deload halving, ride swaps, slides, realigns.
- **Asked:** a weighted exercise is `stalled` and has no open suggestion
  (pending, or approved but not yet applied). It offers "Reset <exercise> to
  <kg> and build back?" with ✅ `vk:<id>:ok` and ✖️ `vk:<id>:no`.
  - ✅ records `decidedAt` (a timestamp). It sets the override and
    `resets[ex] = decidedAt`. The override applies to the next session with
    that exercise whose `startedAt` is after `decidedAt`, then clears.
  - ✖️ snoozes it for 3 more sessions of that exercise.
- **No write races:** the button handler never rewrites `plan/state`. It
  writes its own doc, `plan/decision-<id>` = `{status, decidedAt}`. The tick
  reads the decision docs on load and folds them into `plan/state.suggestions`,
  and the tick is the only writer of `plan/state`. The `vr:` confirm button
  writes only the one `workouts` doc and clears `plan/current.hash`.
- Exercise swaps, calories, and patterns of missed sessions are advice only, in
  the briefing.

### Chat tools

- `viking_status`: today's plan and the next gym day's targets. It returns a
  summary, never the DTOs. It also covers the last session, its assumptions,
  and any reps or kg still waiting for a correction.
- `viking_fix`: correct a logged set, or create a session that couldn't be
  read.
  - It clears that set's `est` and `plan/current.hash`.
  - When `workouts/<date>_<session>` doesn't exist yet, it creates it with no
    `source`, so the owner's version wins over any later import, and writes the
    cycle tick (`gymTick`).

### Weekly briefing (Saturday 18:39)

- The engine keeps `plan/weekly`, covering the last 7 days vs the 7 before:
  - per lift: top kg, reps, PR (best e1RM), stalled, sessions with reps not
    counted
  - sessions: done (gym docs in range) and slid days (`slidDates` in range).
    There's no "planned" count, because slides make it double-count.
  - rides: Z2 vs target, hard vs cap, minutes
  - whether a deload or retest is next
- The `weekly-review.md` prompt has all the rules it needs inline. It sends:
  - the training deep-dive, Garmin training status and load
  - recovery and readiness against shifts, with one fix
  - habits done vs expected
  - next week
  - one closing line
  - one message per pending suggestion, with buttons
- `monthly-review.md` (Sunday, exits unless it's the first Sunday) carries
  money, subscriptions and inbox.

### Habits

`TASK_LISTS` gains `Habits`. `life_tasks` gains:
- `remind_anchor` (`wake` | `winddown`)
- `remind_offset_min`
- `remind_auto_at` (the last time Jarvis computed)
- `skipped_at`

| Task | Recur | Reminder |
|---|---|---|
| Morning routine: full bottle of water, move, read 10 pages, set two priorities | daily | wake + 15 min |
| Evening shutdown: brain dump, open loops, 3 gratitudes, plan tomorrow, bedtime alarm | daily | in the wind-down nudge on the evening of its day |
| Call or visit family | weekly:0 | none (the morning briefing lists it) |
| Message someone and check in | weekly:1,2,4 | none |
| Quality time with my wife, no phones | weekly:1,2,3,4,5,6 | none |
| Plan a date night | every:14d | none |

- **Anchored `remind_at`:** for `wake`, the due date's plan; for `winddown`,
  the wind-down of the **next** date's plan (the bedtime that ends the due
  date's waking day). That's the evening of the due date, or the next morning
  after a night shift.
- **Recompute** only when `remind_at` is null or still equals `remind_auto_at`.
  A snooze changes `remind_at` and is left alone.
- **Roll forward:** an unfinished Habits task is closed as skipped
  (`done_at = skipped_at = now`) once **both**:
  - its due date is before today, and
  - its reminder (if any) fired at least 2 h ago.

  This way a night shift's 05:30 evening-shutdown reminder still gets its
  chance. Its Google copy is deleted, and the next occurrence on or after today
  is created. The check runs every 15 min. A task due before yesterday is
  always rolled, snoozed or not.
- **Completing a Habit late doesn't skip a day.** For Habits, the next
  occurrence is `nextOccurrence(max(due_on, yesterday), recur)`. So an evening
  shutdown due D and ticked at 05:30 on D+1 comes back for D+1, not D+2.
- **Weekly counts:** done = `done_at` set and `skipped_at` null.

### App and Ascend

- **The Viking app becomes read-only.**
  - Removed: weigh-in, check-in, supplements, the Train logger, the Body forms,
    Fuel ticks and extras, the Ride form, cycle done/skip/Undo, and the delete
    buttons on logs.
  - Kept: the benchmark retest entry and its delete, Settings, and every
    chart, history and summary.
  - New: a "Next on your watch" card from `plan/current`.
  - The coach runs with `{ garmin: true }`. It drops the weigh-in and waist
    nags and the kcal buttons, and words the deload and stall flags for the
    watch.
  - `fetchAll` loads only `settings` plus `COLLS`.
- **Ascend:**
  - The chooser goes; sign-in lands on Viking.
  - `/ascend/*` redirects to `/`, and "Switch to Ascend" goes.
  - The `ascend-reminders` cron job is unscheduled.
  - Ascend's code and tables stay in place untouched.

### Rollout order

Every step waits for the owner's go-ahead.

1. **Merge PR 1** with the switch off. The code is inert.
2. **Save the current trigger prompts and schedules** (sync, weekly: prompt
   text and cron) to `life/routines/previous/`, and commit them. That's the
   rollback copy.
3. **Go live, together within minutes:**
   - Update the sync prompt first. The switch is still off, so the new prompt
     leaves Garmin alone, and the old one can no longer reschedule anything.
   - **One-time cleanup**, the single exception to "Jarvis deletes only what's
     in `plan/garmin`": with the Garmin connector, unschedule and delete the
     dated `Viking … (…)` workouts the *old* routine made for today and later
     (no `[viking:` marker). Unschedule, but keep, the four library workouts.
   - Update the weekly prompt (→ Saturday) and create the monthly one.
   - Switch on with `since = 2026-11-24`.
   - Fire the sync.
4. **Check** the imports, recaps, plan, watch and calendar. Then seed the
   habits.
5. **After a few good days, merge PR 2** (read-only app, Ascend retired, cron
   job off). Before merging, save the `ascend-reminders` job's schedule and
   command to `life/routines/previous/ascend-cron.sql`.

**Rollback:**
- switch off
- restore the saved prompts **and crons** from `life/routines/previous/`
  (weekly back to Sun 18:47), and disable the monthly one
- if PR 2 is merged, revert it and re-run `ascend-cron.sql`

The old Sunday routine then schedules the library workouts again, and the app
logger is back.

## Decisions made by Claude (owner may correct)

1. **Stalls offer a 10 % reset, not an exercise swap.** The plan has no swap
   catalog.
2. **Reps the watch didn't count hold the target.** They don't advance it. The
   recap invites a one-line correction. (Otherwise squats, with reps never
   counted, would climb +5 kg every 4 sessions on no data.)
3. **A different session than planned re-aligns the cycle** to what was done.
4. **Rides tick a ride day at 20 min or more** in total that day. Rides on gym
   days are extra.
5. **Dated workouts for every gym day.** Jarvis-made ones are deleted 14 days
   after their date.
6. **The benchmark retest entry stays** in the app (rare, and no Garmin source).
7. **"Plan a date night" every 14 days.**
8. **Calendar blocks:** gym 60 min, rides the workout's length + 10. Blocks the
   owner moves or deletes are left alone until that day's plan changes.
9. **Today's watch session freezes** after the first mirror past wake time.

## Left to the builder

- The visual styling of the read-only screens and the card (`viking.css`).
- Telegram copy within the tone of existing messages.
