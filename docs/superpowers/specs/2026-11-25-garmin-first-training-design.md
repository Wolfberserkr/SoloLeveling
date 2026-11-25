# Garmin-first training: design

Date: 2026-11-25 · Status: approved approach (option 2), plan under review

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
   day's training window, and the block moves when the plan moves.
6. **A Saturday ~19:00 weekly briefing** on Telegram: a training deep-dive,
   recovery and readiness against shifts, habits done, and suggestions with
   buttons. Approved changes go into the next week's plan.
7. **Ascend is retired**, and three habits live on as recurring Google Tasks
   with shift-aware reminders.

## Non-goals

- **Reset (D's portal) is untouched.** No file under `src/features/reset/`, no
  `reset_*` table, and no Reset test changes.
- Weigh-in, waist, food and supplements tracking: the owner tracks these
  elsewhere for now. Garmin weigh-ins keep flowing into Viking as they do today.
- Big goals (CFE, Rockshore, consultancy, Denmark, Vybrix) and Norwegian
  practice are dropped.
- Money, subscriptions and inbox leave the weekly briefing. They become a
  **monthly** message on the first Sunday of the month.
- Exercise *swaps* (replacing a movement) are not automated (see Decisions).

## Anti-goals (would make this a failure even if it "works")

- A wrong weight pushed to the watch: a jump bigger than one progression step,
  or a kg leaking onto a bodyweight move.
- Duplicate or orphaned workouts piling up on the Garmin calendar, or Jarvis
  touching workouts or calendar events it didn't make.
- Silent guessing: any assumption made on import must show in the recap.
- Progression math in prose. The rules stay in tested code.

## Constraints (from the code and accounts as they are)

- **Only the Claude routines can reach Garmin** (Garmin connector). The
  `life-bot` edge function (Deno, a minute tick) can reach Supabase, Telegram
  and Google Calendar/Tasks (through the Apps Script bridge), but not Garmin.
- Viking data is the per-user doc store `viking_docs (user_id, coll, doc_id, data)`.
  The app only loads the colls listed in `COLLS`, so new colls are invisible
  to it.
- The Viking rules live in `src/features/viking/{vikingData,vikingLogic,bikePlan,bikeLogic}.ts`
  with extensionless imports. Deno needs `.ts` imports, and `tsconfig` already
  allows them (`allowImportingTsExtensions`).
- Garmin facts, verified on the owner's account on 25 Nov:
  - A workout step carries `weightValue` (kg) and a reps `endCondition`. Each
    exercise is a `RepeatGroupDTO` of [exercise step, rest step].
  - A recorded set carries `wktStepIndex`, the FIT index of the workout step.
    Activity 25193624779 (Lower A) shows FIT order: a group's children come
    first and its repeat step after, so with [exercise, rest] groups the g-th
    exercise has index **3g** (rest 3g+1, repeat 3g+2). Observed indices
    0, 3, 6, 9, 12, 15 are the 6 exercises of the library Lower A.
  - `repetitionCount` can be null (all 3 squat sets). A set's `weight` (grams)
    carries over from the previous exercise when the step had no weight (the
    crunch shows 82000 g, the calf raise's weight). Sets can be missing
    (RDL and leg press: 2 recorded).
  - Activity names are cut to about 32 chars ("Viking Upper B · deload (Fri 20").
- The library workouts (`Viking Upper A/B`, `Lower A/B`) have drifted from the
  written plan. **The written plan wins** (owner's decision): workouts are
  generated from `SESS` in code, so Lower A gets back its 3rd RDL set, the
  weighted cable crunch and the farmer's carry. The four library workouts are
  left on Garmin untouched and are no longer scheduled.
- Scheduled tasks hold **inline copies** of the routine prompts. Repo edits to
  `life/routines/*.md` take effect only once the trigger prompts are updated.
  The weekly review is `trig_01NpEtQTQpdD6FT6qV3r7PN8` (Sun 18:47 Aruba).
- pg_cron job `ascend-reminders` (hourly) is still active.
- Owner timezone: America/Aruba (UTC−4, no DST). Viking start date: 2026-10-10.

## Approaches considered

1. **Everything in the routine prompts.** The 3-hourly sync reads Garmin and
   works out the progression from rules written in prose. Least code, but the
   math drifts from the tested rules. Rejected.
2. **Tested code decides, the routine carries it out (chosen).** The Viking and
   bike rules move to shared code the `life-bot` tick can run. The tick turns
   raw Garmin data into Viking docs, settles the cycle, computes the next plan
   (targets, the week's sessions, ready-made Garmin workout JSON, calendar
   slots, suggestions) and stores it as one plan record. The routine is a dumb
   mirror: it copies raw Garmin data in and the plan record out to Garmin.
3. **life-bot talks to Garmin directly.** Not possible: there's no Garmin API
   the edge function can reach. Rejected.

## The design

### Data flow

```
watch ──▶ Garmin Connect ──(routine, every 3 h)──▶ viking_docs coll 'garmin_in'   (raw sets)
                                                     │
                       life-bot tick (every minute)  ▼
          import → workouts doc + cycle tick + recap message (Telegram)
          rebuild → viking_docs coll 'plan', doc 'current'  (targets, 7 days, Garmin DTOs, hash)
          calendar → [jarvis] training blocks via the bridge (instant)
                                                     │
                       routine (same/next run)       ▼
          mirror plan.days → Garmin workouts + Garmin calendar → watch
```

### Shared rules

`supabase/functions/_shared/viking/` holds `data.ts`, `logic.ts`, `bikePlan.ts`
and `bikeLogic.ts` (moved, with `.ts` imports). The old `src/features/viking/*`
files become one-line re-exports, so the app, tests and Deno share one copy.
New pure modules sit beside them: `garmin.ts` (exercise map + workout builder),
`targets.ts`, `garminImport.ts`, `planner.ts`, `calendarPlan.ts`, `weekly.ts`.

### Targets (what the watch shows next time)

Per exercise, from the existing double-progression rule (`exHint`):
- **kg:** the hint's kg (top weight last time, plus `STEP[inc]` when every set
  hit the top of the range). `bw` moves get no kg. `pull` keeps the assisted
  kg in the doc but puts no weight on the watch. On a first time, no kg.
- **reps target:** after a weight bump, or the first time: the bottom of the
  range. Otherwise last session's lowest reps + 1, capped at the top of the
  range.
- **sets:** `setCount(ex, session, phase, deload)`.
- A stalled exercise (`plateau`) keeps its kg and raises a suggestion.
- An accepted "reset" suggestion sets an override: next session at 90 % of the
  top weight, rounded down to the step. It's cleared once a session logs that
  exercise.

### Import (watch → Viking)

For each unprocessed `garmin_in` doc (a strength activity with its sets):
- **Session:** from the activity name prefix (`Viking Upper A` …, which
  survives the truncation). Otherwise by the most category matches against
  `GARMIN_EX`. If neither works, it's not a Viking session: mark it processed
  and send one line.
- **Set → exercise:** `SESS[sk].ex[floor(wktStepIndex / 3)]` when that
  exercise's Garmin category matches the set's category (or the exercise has no
  Garmin category). Otherwise match by category/name within the session.
  Unmatched sets are dropped and listed.
- **Rules ("assume the plan"):**
  - Reps null → the planned reps target (from the plan that was on the watch
    that day, else the exercise's low rep).
  - Weight on a `bw` move → 0.
  - `pull` → the planned assist kg.
  - A weight equal to the previous exercise's last weight on a step that had no
    planned kg → kg 0, and flagged "kg not recorded".
  - Fewer sets than planned → logged as recorded, noted "2 of 3 sets".
- Writes the `workouts` doc `<date>_<sk>` (the app's own id format), unless one
  already exists for that date and session. The owner's typed log wins.
  `entries` keep plan order.
- **Cycle:** if the session is the current cycle day's gym session, write a
  `cycle` tick `done` for that day. If it's a different session, write the tick
  for `dayOfSession(sk)`: the cycle follows what was actually done, and the
  recap says so.
- **Recap** (Telegram, 2–4 lines + one per assumption): what was saved, what
  was assumed, what goes up next time, and any suggestion buttons.

Rides keep their current import (sync step 7 → `rides` docs). The tick ticks
the cycle when a ride of at least 20 min is logged on a ride day: a hard day
with any ride, or E1/L1/R1 days.

### Cycle settling (the cycle waits)

At the first tick after local midnight, for yesterday:
- A tick already dated yesterday: nothing to do.
- The day was **rest** (day 8): tick `done`.
- The day had only an **optional** ride (day 1 is the gym day, so this means
  day 7 in phase 1): tick `skip`.
- Otherwise (a gym or a required ride was missed): **no tick.** Today becomes
  that same cycle day, and every planned day behind it slides by one.

### The plan record (`viking_docs` coll `plan`, doc `current`)

```
{ builtAt, date, week, phase, deload, cycleDay, hash,
  targets: { [exKey]: { kg, reps, sets, note } },
  days: [ { date, cycleDay, kind: 'gym'|'ride'|'rest',
            session?, ride?: { code, from?, minutes, reason? },
            garmin?: { name, sport: 'strength'|'cycling', dto, hash },
            slot?: { start, end } | null, note? } × 7 (today … +6) ],
  suggestions: [ { id, kind: 'reset', ex, kg, status: 'pending'|'ok'|'no', at } ] }
```

The tick rebuilds it every 15 min, and right after any import or answered
suggestion. It writes only when `hash` changes. Ride rules, in order, per day
(ported from sync step 9.3 and briefing step 8.3):
1. A deload week turns hard rides and L1 into E1 ≤ 60 min, Z1–Z2.
2. The hard-ride cap per rolling 8 days counts both logged and planned rides.
3. No hard ride within 24 h before Lower A/B.
4. The day after a night/double shift ending 00:00–08:00 makes a hard ride an
   E1 ≤ 60.
5. **Today only**, readiness from `life_health`: HRV status LOW/UNBALANCED,
   readiness < 40, sleep < 6 h, body battery < 30, or sleep stress ≥ 30 turns
   a hard ride into an E1 ≤ 60.

### Garmin mirror (routine)

Every run, for each plan day from today to +6:
- Garmin workout name `Viking <label> (<Ddd D Mon>)`. The description ends with
  `[viking:<hash>]`.
- Reuse a workout with the same name and hash. A same name with a different
  hash: delete that dated Viking workout and upload the new one. Upload the DTO
  verbatim.
- On the Garmin calendar: unschedule any `Viking…` workout on that date that
  isn't the planned one, then schedule the planned one. Rest days have no
  Viking workout.
- Never touch the four library workouts, Garmin's own plans, or any workout
  not starting with `Viking `.
- Housekeeping: delete dated `Viking … (…)` workouts whose date is more than
  14 days past. Activities are not affected.
- Record what was mirrored in `viking_docs` coll `plan` doc `garmin`:
  `{ [date]: { name, workoutId, hash, scheduledAt } }`.
- If `plan/current.builtAt` is older than this run's raw import, use it anyway.
  The next run catches up.

### Google Calendar blocks (tick, through the bridge)

- For each plan day with a session, from today to +6: one event, either
  `🏋️ Viking Lower A` (60 min) or `🚴 Viking E1 · Endurance 75 min` (ride
  minutes + 10).
- It's placed at the earliest free time inside the day's `train_window`
  (`HH:MM–HH:MM` text). Non-clock windows ("Late afternoon…") use 16:30 for
  the start. If nothing is free, it goes at the window start and the note says
  it overlaps.
- The description is `[jarvis] training · viking:<date>`. Reconcile against the
  existing `viking:` events in range: create, move, or delete. The tick never
  touches other events.
- With the bridge unlinked, it skips quietly.

### Suggestions (✅/✖️)

- **Automatic (rule-decided, no ask):** weight bumps, deload halving, ride
  swaps, cycle slides.
- **Asked:** for a stalled exercise, "Reset <exercise> to <kg> and build back?"
  ✅ sets the override, ✖️ dismisses it for 3 sessions. Callback data is
  `vk:<suggestionId>:ok|no`.
- Exercise swaps, calorie changes and big plan changes appear only as advice in
  the weekly briefing.

### Chat (Jarvis agent tools)

- `viking_status`: today's plan, targets, the last session and what was assumed.
- `viking_fix`: correct a logged set ("squat was 3×6", "crunch was 20 kg"). It
  rewrites the `workouts` doc and the next rebuild picks it up.

### Weekly briefing (Saturday ~19:00)

- The tick keeps `viking_docs plan/weekly`, a pure summary of the last 7 days
  against the 7 before:
  - per lift: kg and reps, planned vs done, PRs (best e1RM), stalls
  - sessions planned / done / missed / slid
  - rides: Z2 minutes vs target, hard rides vs cap
  - deload or retest ahead
- The routine `weekly-review.md` (Saturday) composes the message. It covers:
  - the training deep-dive from `plan/weekly`
  - Garmin training status, load and recovery
  - recovery & readiness from `life_health` vs shifts, with one fix
  - habits done (`life_tasks` list `Habits`)
  - pending suggestions as buttons
  - one line on the most useful change
- Approved suggestions are in `plan/current` before Sunday's first sync.
- The new `monthly-review.md` (first Sunday) carries money, subscriptions and
  inbox.

### Habits (Google Tasks)

A new list `Habits` joins `TASK_LISTS`. `life_tasks` gains `remind_anchor`
(`wake` | `winddown`) and `remind_offset_min`. Seeded once (`supabase/scripts/04_habits_seed.sql`):

| Task | Recur | Reminder |
|---|---|---|
| Morning routine: full bottle of water, move, read 10 pages, set two priorities | daily | wake + 15 min |
| Evening shutdown: brain dump, open loops, 3 gratitudes, plan tomorrow, bedtime alarm | daily | folded into the wind-down nudge (✅ Done button there) |
| Call or visit family | weekly:0 | none (morning briefing lists it) |
| Message someone and check in | weekly:1,2,4 | none |
| Quality time with my wife, no phones | weekly:1,2,3,4,5,6 | none |
| Plan a date night | every:14d | none |

An anchored task gets its `remind_at` from that date's `life_day_plan` and is
recomputed when the plan moves, until it has reminded.

### App and Ascend

- **Viking becomes read-only:**
  - Every logging input goes: the weigh-in and check-in, supplements, the Train
    logger, the Body forms, the Fuel ticks/extras, the Ride form, cycle
    done/skip, Undo, and the delete buttons.
  - The kcal ± buttons on coach flags go.
  - Coach "Weigh in today" and "Measure your waist" flags are hidden.
  - Charts, history, est. 1RM, checkpoints, weekly ride summary, zones and
    benchmarks stay.
  - Settings (start date, phase mode) stay.
  - The Today tab gains a "Next on your watch" card read from `plan/current`.
- **Ascend:**
  - The chooser goes; sign-in lands on Viking.
  - `/ascend/*` redirects to `/`, and "Switch to Ascend" goes.
  - The `ascend-reminders` cron job is unscheduled.
  - Ascend's code and tables stay in place untouched.

## Decisions made by Claude (owner may correct)

1. **Stalls offer a 10 % reset, not an exercise swap.** The plan has no swap
   catalog. Swaps stay advice.
2. **The reps target is last lowest + 1.** "Assume the plan" then never fakes a
   jump to the top of the range from missing reps unless the target already
   was the top.
3. **A different session than planned re-aligns the cycle** to what was done,
   rather than being treated as an extra.
4. **Rides tick the cycle at 20 min or more** on a ride day. Gym-day rides are
   extra and tick nothing.
5. **Dated workouts for every gym day** (weights change per session). Old ones
   are cleaned up after 14 days.
6. **Benchmark retest entry stays** in the app. It's rare, not daily, and has no
   Garmin source.
7. **"Plan a date night" every 14 days** (it was a one-off side quest).
8. **Calendar block length:** gym 60 min, rides planned minutes + 10.

## Left to the builder

- The visual styling of the read-only screens and the "Next on your watch" card,
  following `viking.css`.
- Garmin exercise keys for exercises not in sync.md's list (`csrow`, `revpec`,
  `legext`, `mpress`): category only, or none.
- Telegram copy within the tone of existing messages.
