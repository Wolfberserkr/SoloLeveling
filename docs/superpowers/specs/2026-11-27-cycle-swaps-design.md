# Cycle swaps: the 8-day cycle as a checklist

Date: 2026-11-27 · Status: draft for the owner's review

## Why

On 27 Nov the owner did tomorrow's Upper B instead of today's ride, and meant to
ride on the 28th. He started the dated workout "Viking Upper B (Sat 28 Nov)" on the
watch himself. The watch already makes that kind of swap easy. Jarvis doesn't
understand it.

Today the cycle is a strict sequence: the next day is always the one after the last
day ticked. When the watch records a session out of order, `gymTick` "realigns" the
cycle to that session's day. Every day it jumped over is dropped without a word. On
27 Nov that would have deleted the ride and put Lower B on the watch for the 28th.
That was prevented by hand, with two marker ticks (see *Rollout*).

The owner swaps today and tomorrow most often, and sometimes moves sessions around
his shifts. He chose this approach:
- **Jarvis works the swap out from what the watch recorded** and asks with buttons.
- **He can also swap or move days ahead of time on Telegram.**
- **The cycle becomes a checklist** (approach 2 below).

## Goals

1. **A session done early never drops the days it jumped over.** Those days are
   planned next, in cycle order, and go onto the watch.
2. **Ride-first swaps work too.** If he rides on a gym day and does that gym session
   later, the ride counts as the cycle's ride, and that ride day isn't planned again.
3. **One-tap correction.** Whenever Jarvis assumes a swap, the Telegram message says
   what moved and offers `✖️ Skip <day>`, for when it really was a skip.
4. **Moves ahead of time on Telegram**:
   - "swap today and tomorrow"
   - "move Lower B to Tuesday, I'm on nights"
   - "make Thursday my rest day"

   Jarvis rewrites the 7-day plan and replies with the new order, any rule changes
   (a hard ride turned into E1) and any shift conflicts. The watch follows at the
   next sync.
5. **The app's cycle card shows the checklist**: which days of this lap are done,
   skipped or still to do.

## Non-goals

- Strava activity names and descriptions. That's a separate project, next.
- Reset (D's portal): untouched.
- Making the sync run more often, or pushing to the watch straight away. Telegram
  moves reach the watch at the next 3-hourly sync. For a same-morning swap the owner
  already has the right tool: start the other dated workout on the watch. Jarvis's
  reply says so.
- Changing which rides or sessions a lap contains, or the progression rules.

## Anti-goals

These count as failures even if everything else works:
- A day of the lap is dropped without a message.
- A session already done this lap is planned again. On 28 Nov that would have been
  Upper B a second time.
- Two Viking workouts on one date, or a pin that silently overrides the hard-ride
  rules: no hard ride the day before Lower A/B, and the hard-ride cap.
- A late Garmin import that reclassifies a day and leaves the cycle inconsistent.
- Anything changing on the app's other tabs, the progression targets or the
  Garmin mirror (sync step 9).

## Constraints

- **The rules are shared code.** `supabase/functions/_shared/viking/` is used by
  life-bot (Deno) and by the app through re-exports in `src/features/viking/*.ts`.
  `bikeLogic.bike(v).current()` is the one place that decides "where the cycle
  stands". It's used by:
  - `planner.ts`: `gymTick`, `rideTick`, `endOfDay`, `planAhead`
  - `engine.ts`: the freeze check
  - `bikeLogic.ts`: `today`, and `rideFlags` for pending rides
  - the app's `CycleCard`
- **Ticks** are `viking_docs` coll `cycle`, `{date, day, status: 'done'|'skip', savedAt}`,
  with deterministic ids `<date>_auto_<day>`. `v.sorted('cycle')` orders them by
  date, then `savedAt`.
- **The engine runs every minute** in the life-bot tick, behind
  `prefs.vikingGarmin`, which is on. The import, ride and end-of-day items run as
  one stream in date order (`engine.ts` step 3).
- **Garmin data arrives late.** The sync runs every 3 h at :12 UTC. A session can
  reach `garmin_in` up to about 3 h after it ends, so after the end-of-day item for
  its date has run.
- **Live cycle data** on 27 Nov: `2026-11-24_auto_1`, `2026-11-25_auto_2`,
  `2026-11-27_auto_4`, plus the hand-made marker `2026-11-27_swap_2` (a `skip` of
  day 2). If the 28 Nov ride happens before this ships, `2026-11-28_auto_3` and
  the marker `2026-11-28_swap_4` will also exist.
- Phase 1 (Foundation cut) is current. Day 7's ride is optional (R1), so day 7
  plans as rest and settles as `skip`.

## Approaches considered

1. **Pinned days on the old sequence.** Keep "next = the day after the last tick"
   and save swaps as date → day pins. This is the smallest change. But pins fight
   the sequence: a done swap still needs a correcting tick, which is the two-marker
   problem from 27 Nov, now built into the code. Rejected.
2. **The cycle as a checklist (chosen by the owner).** Each lap has 8 boxes. A tick
   fills its own box, and the next day is the first open box. Swaps need nothing
   special, skips are explicit, and Telegram moves are pins placed on top. It
   changes the one rule that the app and planner share, so it needs the most
   tests.
3. **An "owed" list next to the sequence.** Days jumped over go on a list that the
   planner places first. It's in between, but it's a second piece of state that
   has to agree with the ticks. Rejected in favour of 2.

## The design

### Laps (`bikeLogic.ts`)

Add a pure function `lap(ticks)`, which walks the sorted ticks:
- Start with an empty lap: 8 boxes, all open.
- For each tick:
  - **Its box is open:** fill it, with `done` or `skip` and the tick's date.
  - **Its box is already filled in this lap:** close the lap and start a new one
    with this tick. The old lap's open boxes are *passed*. This is the "went back
    to Upper A" case, a realign to a new lap, just as today.
  - **All 8 boxes are filled:** close the lap; the next tick starts a new one.
- It returns `{ boxes: Array<{ day, status: 'open'|'done'|'skip', date? }>, startedAt }`
  for the current lap, plus `passed` for the lap just closed (used by the recap).

Then `current()` becomes:
- the **first open box** of the current lap, in order 1 → 8;
- day 1 of a new lap when every box is filled;
- with no ticks at all: the day after the last logged gym session, as today.

It still returns `{ day, lastDate }`.

Every caller of `current()` gets the new meaning without changing.
`rideFlags`/`today` also need "the day after this one", which today is
`nextDay(cur)`. Add `b.after(day)`: the next open box after `day` in this lap
(new lap: day 1). Use it wherever code asks "what's next" for the rules
(Lower tomorrow, hard ride before Lower).

The `Gym rotation differs` flag in `today()` compares the cycle with
`v.nextSession()` (the session after the last one logged). A swap makes that
comparison false. Drop the flag. The checklist replaces it.

### Ticks (`planner.ts`)

- **`gymTick(D, date, sk)`:** fill `dayOfSession(sk)`.
  - That box is the first open one: a normal tick.
  - It's open but later than the first open box: **early**. Return
    `{ …, early: [days of the open boxes before it] }`.
  - It's already filled in this lap: **new lap**. Return `{ …, newLap: true }`.
    This replaces `realigned`.
  - The tick id stays `<date>_auto_<day>`, and an existing id returns null, as now.
- **`rideTick(D, date)`**, for ≥ 20 min of rides on a date that has no tick yet:
  - The first open box is a ride day (has codes, no gym): fill it, as now.
  - The first open box is a gym day: **no tick yet.** The ride may be a ride-first
    swap, and that's settled at the end of the day (below).
- **`endOfDay(D, date)`**, for a finished date with no tick:
  1. **Ride-first swap.** The date has ≥ 20 min of rides, no gym workout dated that
     day, and the first open box is a gym day. Fill the **first open ride box
     after it** (status `done`, savedAt so it sorts before any later tick). Return
     it with `early: [the gym day]`, so the engine sends a swap message.
     - **Late-import guard:** decide only once Garmin has certainly delivered that
       day. That means the latest `plan/garmin[*].mirroredAt` (any date) is later
       than the end of `date` in local time, since the sync copies sessions in
       (step 7) before it mirrors (step 9). Until then, return `'wait'`. The engine
       then stops settling at that date (it doesn't advance `settledThrough`), and
       the next tick tries again.
     - A ride on a day that also has a gym workout stays an extra, as now.
  2. Otherwise, the rules are unchanged, but they use the first open box: rest box
     8 → `done`; an optional-ride day → `skip`; otherwise `'slid'`.
- The new-lap check also covers `viking_fix`, which calls `gymTick` in
  `life-bot/viking.ts`. Its reply text changes from "realigned" to the new wording.

### Pins: moving days ahead of time

- Pins live in their own doc, `plan/pins: Record<date, day>` (see *Decisions from
  the builder check*), with at most one box per date and one date per box.
- **`planAhead`** walks its 7 dates and simulates the lap:
  - A date with a pin whose box is still open (and not placed yet) places that box.
  - Any other date places the first open box that is neither pinned to a later date
    in the window nor placed yet.
  - Placing a box fills it in the simulation. When the simulated lap is full, a
    new lap starts at day 1.
  - Pins never place a box that's already filled.
- **The rules are checked on the planned order**, not the cycle order: the next
  *planned* day is the one that counts for "no hard ride the day before Lower", and
  planned plus logged rides count for the cap. A pin can't break a rule. It gets
  the existing swap (hard → E1 ≤ 60 min) with its reason, and the Telegram reply
  says so.
- **Pins are dropped:**
  - when their date has passed (an undone box just stays open and is planned
    next);
  - when their box gets filled on another date;
  - when the owner clears them.

  The engine does this in step 3, after settling.
- **The freeze:** a pin on today that differs from the frozen day drops the
  freeze. The owner's explicit move beats the morning freeze.
- **New life-bot tool `viking_move`**:
  - Input: `{ moves: [{ what, date }], clear? }`. `what` is a session (`UA|LA|UB|LB`),
    a ride code from the plan, `rest`, or a cycle day number. "Swap today and
    tomorrow" is two moves.
  - It validates:
    - dates within today … today + 6;
    - `what` resolves to an open box in the current or next lap;
    - no clash with other pins (a new move on a date replaces that date's old pin).
  - It writes the pins, runs the planner as a **preview** with the shift context
    (`afterNight`, training windows), and returns the 7 days with each day's
    session or ride, any rule swap and its reason, and warnings:
    - a gym session pinned to a date that has no training window;
    - a hard ride the morning after a night shift.
  - It doesn't write `plan/current` (the next tick rebuilds it within a minute).
    It returns when the watch will have it: the next sync time.
- **Agent prompt** (`agent.ts`): the Viking lines say the owner can do sessions in
  any order, that Jarvis assumes a swap when the watch records one early, and that
  `viking_move` handles "swap", "move" and "rest day" requests. For a same-morning
  swap, it suggests starting the other dated workout on the watch.

### Messages

- **Gym session done early** (the recap, `recap.ts`): it replaces the "🔄 Cycle
  moved" line with
  `↔️ Swapped: <E1 · Endurance 60 min> moves to <tomorrow / Sun 29 Nov>.`, naming
  the open days it passed (at most 3, then "and N more"). The keyboard adds
  `✖️ Skip <day name>`, one button per passed day (at most 3), plus `✖️ Skip all`
  when there are two or more. The callback is `vks:<activityId>:<day>|all`.
- **Ride-first swap** (sent by the engine when `endOfDay` returns `early`):
  `↔️ You rode on <date> instead of <Lower A>: the ride counts as day <n>, and
  <Lower A> is next.` It has the same skip buttons. The callback is
  `vks:r<date>:<day>|all`, under a claim `vkswap:<date>` so it's sent once.
- **New lap**: `🔄 New lap: <Upper A> started it, so <the open days> were passed.`
  No buttons. This is today's behaviour, with clearer wording.
- **A skip tap** writes `skip` ticks for those boxes, dated the swap's date, with a
  `savedAt` just before the early tick. It answers "Skipped <day>" and the plan
  rebuilds on the next tick. Tapping twice is harmless (the ids are deterministic).

### App (`VikingApp.tsx` → `CycleCard`)

- **The header** stays `Cycle · day N of 8`, where N is the first open box, and the
  card shows that day as today.
- **Under it, a row of 8 small boxes**: done ✓, skipped –, open ○, and the current
  one highlighted. Each has its day's short name (UA, LA, Ride, UB, LB, E1, Ride,
  Rest).
- **The footnote** becomes: "Do the days in any order. Jarvis ticks a day when the
  watch records it, and the next day is the first one not done yet. Swap or move
  days on Telegram." The `Last: …` line stays.
- The card has to fit 390 px with no horizontal scroll, matching the rest of the
  app.

### Tests

- **`tests/bike.test.ts`**: `lap()`:
  - in order;
  - one early (the 27 Nov case: 1, 2, 4 → current 3; then 3 → current 5);
  - two early;
  - an already-filled box starts a new lap;
  - a full lap rolls over;
  - with no ticks;
  - skips count as filled;
  - `after()`.
- **`tests/vikingPlanner.test.ts`**:
  - gymTick's early/newLap;
  - rideTick defers on a gym day;
  - endOfDay's ride-first swap, including its `'wait'` guard, and a ride on a day
    with a gym workout staying an extra;
  - pins placed, expired, and dropped when their box fills elsewhere;
  - rules on the planned order (hard ride pinned before Lower → E1);
  - the lap rolls over inside the 7-day window.
- **`tests/vikingEngine.test.ts`**, end to end with the in-memory store:
  - the 27–29 Nov scenario: UB on 27 → plan 28 ride, 29 LB; ride on 28 → 29 LB;
    no Upper B planned twice;
  - a ride-first swap with a late gym import inside the guard window;
  - the skip callback;
  - a pin plus the freeze.
- **`tests/vikingRecap.test.ts`**: the swap, ride-swap and new-lap texts and
  keyboards.
- Existing tests that assume "next = the day after the last tick" while ticks are
  in order stay green unchanged. Any that encode the old realign-drops-days
  behaviour are updated, and the change is named in the commit.

### Decisions from the builder check

These are Claude's calls unless marked as the owner's.

- **A pinned box is that date's box.** When a date has a pin whose box is open,
  `gymTick`, `rideTick` and `endOfDay` treat the pinned box as that date's first
  open box. So:
  - a pinned session done on its date is a normal tick, with no swap message;
  - a pinned ride on a gym-day cycle fills its own box;
  - a pinned rest settles as `done` at the end of its date.
  The pin is then dropped because its box is filled.
- **A move to a day already done this lap is refused.** `viking_move` replies with
  the reason and what's next ("Upper A is done this lap; next is Lower B"). Moves
  never close a lap. Only a session the watch records can start a new lap, as now.
  Pins are `date → day` for the current lap. A pin for a box of the next lap is
  allowed only when the 7-day preview shows that lap starting before the pin's
  date. Otherwise it's refused.
- **The ride-first wait never stalls for long.** "Garmin has delivered date d"
  means either of these is later than the end of d (local):
  - the latest `plan/garmin[*].mirroredAt`;
  - the `insertedAt` of any `garmin_in` dated after d (the sync's step 7 copies
    every strength session of the window in one pass, so a later one proves the
    earlier ones were copied).
  - **While waiting**, the stream stops at d's end-of-day item. Items dated after
    d wait too, so nothing is decided against later ticks and no back-dated tick
    is ever inserted.
  - **The wait is capped**: 12 h after the end of d, Jarvis decides with what it
    has, and logs that the cap was hit.
  - The wait only happens on a date where he rode on a gym day with no gym
    workout, so normal days never wait.
- **A tick is never inserted before a later one.**
  - A skip tap fills only boxes that are still open, and dates its ticks the
    latest tick's date (savedAt after it). A box filled since the swap message
    is left alone, and the tap answers "already done".
  - A `viking_fix` that creates a session on a date before the latest tick fills
    its box only if that box is open, and never starts a new lap from there.
- **Which box a ride-first swap fills depends on the ride.** A ride of at least
  45 min on a gym day with no gym workout counts:
  - hard (by code, else by `type`) → the first open hard-ride box (3, or 7 from
    phase 2);
  - otherwise → the first open easy box (6, or the day-3/7 box when the planner
    would swap it to E1 anyway).
  - Shorter rides, and rides with no matching open box, stay extras.
  - 45 min is the bottom of the shortest planned ride that isn't optional (H2/H3).
    An R1 spin is always optional, so it never fills a box.
- **Pins and skip decisions are separate docs**, not `plan/state`. The tick writes
  `plan/state` whole and would race a chat-side write. Pins go in `plan/pins`
  (`{[date]: day}`, written only by `viking_move` and read by the tick). The engine
  drops expired or filled pins by writing that doc too, in the same tick that
  reads it. `viking_move` writes with a jsonb merge, and the tick removes keys one
  at a time (`data - '<date>'`), so neither loses the other's change. Skip taps
  write `cycle` ticks directly, which is safe because ids are deterministic and
  the tick re-reads cycle docs every run.

## Rollout

- **One PR.** CI already runs the tests and `deno check`. The deploy on merge
  redeploys life-bot.
- **In the same release, remove the hand-made markers.** Delete the cycle docs
  `2026-11-27_swap_2` and, if it exists, `2026-11-28_swap_4`. Under the checklist
  rule, `swap_2` (day 2 already filled) would start a new lap.
  - This is a one-off cleanup of docs Claude made by hand in this session. The
    owner approves it with the design.
  - Do it right after the deploy, and check `plan/current` on the next tick.
- **Expected live state after cleanup**:
  - ticks 1, 2, 4, then 3 (once the 28 Nov ride is in);
  - current = 5, so Lower B is next;
  - no Upper B in the next 7 days until the lap rolls over.
- **Rollback**: redeploy the previous life-bot. The ticks are the same shape, but
  under the old rule 1, 2, 4, 3 means "next = 4" (Upper B again). If you roll back
  after a swap, add a one-off `skip` tick for day 4 dated after the last tick, or
  fix it by hand.
- **Routine prompts:** no change. Sync step 9 copies `plan/current` as it is. The
  weekly review's "slid days" stays meaningful (an open box that waited).

## Left to the builder

- Function and field names beyond the ones above, and how `lap()` is cached inside
  `bike(v)`.
- How the planner simulation is shared with `viking_move`'s preview (ideally the
  same `planAhead` call with the pins passed in).
- The exact styling of the 8-box row, within the app's existing CSS.
- Wording details of the messages, as long as they say what moved, where to, and
  offer the skip.
