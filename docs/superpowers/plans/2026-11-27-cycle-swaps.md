# Cycle Swaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Project Viking's 8-day cycle into a per-lap checklist. Sessions can then be done in any order: swaps from the watch are understood, and the owner can move days, or take a day off, from Telegram.

**Architecture:** A pure `lap()` fold over the cycle ticks replaces "the day after the last tick" in the shared rules (`_shared/viking/bikeLogic.ts`). Everything that asks `bike(v).current()` (planner, engine, app) inherits it. Pins (`plan/pins`) and an extra day off (pin value `0`) are planned by `planAhead` and honoured by the tick functions. The engine sends swap messages with skip buttons, and life-bot gets a `vks:` callback and a `viking_move` tool.

**Tech Stack:** TypeScript shared by Vite/React (app) and Deno (life-bot edge function); Vitest (`npm test`); `deno check` in CI; Supabase `viking_docs`.

**Spec:** `docs/superpowers/specs/2026-11-27-cycle-swaps-design.md`. Read it first. Its "Decisions from the builder check" section overrides the earlier sections where they differ.

## Global Constraints

- **Reset is untouched:** no file under `src/features/reset/`, no `reset_*` table, no Reset test changes.
- **Shared code:** rules live in `supabase/functions/_shared/viking/`, with `.ts` import suffixes (Deno). The app re-exports them from `src/features/viking/*.ts`.
- **Tick ids** stay `<date>_auto_<day>` (`tickId`). Skip-tap ticks use the same id scheme.
- **The chat side never writes `plan/state`.** Pins live in `plan/pins` (`{[date]: day}`, with `0` = extra day off). Both `viking_move` and the tick change it only through `editPins` (Task 5), a compare-and-set on `updated_at`, so neither loses the other's keys.
- **A tick is never inserted before the latest tick.** Skip taps date their ticks the latest tick's date, with `savedAt` after it.
- **Ride-first swap:** the rides dated that day total ≥ **45 min**, and that day has no workout. A hard ride → the first open hard-ride box. An easy ride → box 6, else the first open hard box when that date is in a deload week or at the hard-ride cap. Otherwise it's an extra.
- **Ride-first wait:** "delivered" means the latest `plan/garmin[*].mirroredAt`, or the `insertedAt` of any `garmin_in` dated after d, is later than the end of d (local). The wait is capped at **12 h** after the end of d, then Jarvis decides and logs `ride-swap wait capped <date>`.
- **Copy** (Telegram HTML):
  - Gym swap line: `↔️ Swapped: <first passed day's name> moves to <date>.`
  - Ride swap: `↔️ You rode on <date> instead of <gym name>: the ride counts as day <n>, and <gym name> is next.`
  - New lap: `🔄 New lap: <session> started it, so <days> were passed.`
  - Skip buttons: `✖️ Skip <day name>` (at most 3) plus `✖️ Skip all` when there are ≥ 2. The callback is `vks:<activityId>:<day|all>`, or `vks:r<date>:<day|all>` for a ride swap.
- **App footnote copy**, exactly: "Do the days in any order. Jarvis ticks a day when the watch records it, and the next day is the first one not done yet. Swap or move days on Telegram."
- **Box short names:** `UA, LA, Ride, UB, LB, E1, Ride, Rest` for days 1–8.
- Commits end with the session's attribution lines. No model names in commits or code.

## Review Focus

1. **Out of order across a lap rollover.** If the owner does Rest/UA of the next lap while boxes are still open, a new lap starts, the passed days are named, and no session is planned twice. Owned by Task 1 (`lap: filled box starts a new lap and reports passed`) and Task 4 (`engine: new lap recap names the passed days`).
2. **Two ticks with the same date.** Sort is by date then `savedAt`. A skip tap after the early tick must not make the early tick look like "already filled → new lap". Owned by Task 6 (`vks skip ticks sort after the latest tick and fill only open boxes`, pure helper `skipTicks`).
3. **A pin whose box gets filled on another date, or a pin for a past date.** The pin is dropped and nothing is placed twice. Owned by Task 4 (`engine: drops expired and filled pins`).
4. **The watch card with a day off first.** `watchCard` must skip `kind: 'rest'` days, including `cycleDay: 0`. Owned by Task 7 (`watchCard skips a day off`).
5. **Legacy data:** the two hand-made `_swap_` markers in live data. Under the new rule `2026-11-27_swap_2` would start a new lap. The rollout removes them, and a test pins the post-cleanup live state. Owned by Task 4 (`engine: live 27–29 Nov scenario`).

---

### Task 1: Laps in `bikeLogic.ts`

**Files:**
- Modify: `supabase/functions/_shared/viking/bikeLogic.ts` (`bike()`: `current()` at ~106, `rideFlags` ~134, `today()` ~146)
- Test: `tests/bike.test.ts`

**Interfaces:**
- Produces:
  - `export type Box = { day: number; status: 'open' | 'done' | 'skip'; date?: string }`
  - `export type Lap = { boxes: Box[]; passed: number[] }`: 8 boxes for days 1–8. `passed` holds the open days of the lap closed by the most recent "already filled" tick, `[]` otherwise.
  - `export function lap(ticks: CycleDoc[]): Lap`: ticks already sorted (date, then savedAt).
  - `export const firstOpen = (l: Lap): number | null`
  - On `bike(v)`:
    - `lap(): Lap`
    - `current(): { day: number; lastDate: string | null }`: first open box; 1 when the lap is full; no ticks → unchanged.
    - `after(day: number): number`: the next open box after `day` in this lap, cycle order, wrapping to 1 when none.

- [ ] **Step 1: Write failing tests** in `tests/bike.test.ts`, in a new `describe('lap')`. `t(date, day, status='done', savedAt=0)` builds a `CycleDoc`.
  - `lap: in order` — ticks 1, 2, 3 → `firstOpen` 4, `passed` [].
  - `lap: one early (27 Nov case)` — ticks 1, 2, 4 → current 3. Then add 3 → current 5.
  - `lap: two early` — 1, 4, 5 → current 2, and `after(2)` is 3.
  - `lap: filled box starts a new lap and reports passed` — 1, 2, 4, 1 → boxes: 1 done, rest open; `passed` [3, 5, 6, 7, 8]; current 2.
  - `lap: full lap rolls over` — 1…8 → current 1, all boxes open.
  - `lap: skips count as filled` — 1, then 2 with status `skip` → current 3.
  - `lap: no ticks` — `current()` = the day after the last logged gym session's day (unchanged behaviour).
- [ ] **Step 2:** Run `npx vitest run tests/bike.test.ts`. Expected: FAIL (`lap` not exported).
- [ ] **Step 3: Implement** `lap`, `firstOpen`, `bike().lap/current/after` as in the spec's *Laps* section.
  - In `rideFlags` (pending) and `today()`, replace `nextDay(cur.day)` / `nextDay(day)` with `after(...)`.
  - Delete the `Gym rotation differs` flag from `today()`, and delete its test (`words a rotation mismatch…`). Name that removal in the commit.
- [ ] **Step 4:** Run `npm test`. Expected: all pass. If any other test encoded the old realign-drops-days behaviour, update it and list it in the commit body.
- [ ] **Step 5:** Commit `feat(viking): the 8-day cycle as a per-lap checklist`.

### Task 2: Tick functions in `planner.ts` (early, new lap, ride-first, day off, pins)

**Files:**
- Modify: `supabase/functions/_shared/viking/planner.ts` (`gymTick` ~57, `rideTick` ~71, `endOfDay` ~87)
- Test: `tests/vikingPlanner.test.ts`

**Interfaces:**
- Consumes: Task 1's `bike(v).lap()`, `firstOpen`, `after`.
- Produces:
  - `export type Pins = Record<string, number>`: date → cycle day 1–8, or `0` = extra day off.
  - `gymTick(D, date, sk, savedAt, pins: Pins = {}): { id: string; doc: CycleDoc; early: number[]; newLap: boolean } | null`. `realigned` is removed.
    - `early` = the open boxes before `dayOfSession(sk)`, or `[]` when `pins[date] === dayOfSession(sk)`.
    - `newLap` = that box was already filled.
  - `rideTick(D, date, savedAt, pins: Pins = {}): { id; doc } | null`:
    - fills `pins[date]` when it's an open ride box;
    - else fills the first open box when it's a ride day;
    - else null (deferred to `endOfDay`).
  - `endOfDay(D, date, savedAt, o: { pins?: Pins; delivered: boolean }): { id; doc; early: number[] } | 'slid' | 'off' | 'wait' | null`:
    - `pins[date] === 0` → `'off'`;
    - the ride-first conditions (Global Constraints) hold and `!o.delivered` → `'wait'`;
    - they hold and delivered → the ride box tick with `early: [the gym day]`;
    - a pinned open box 8 → `done`;
    - otherwise the old rules applied to the first open box.
    - The old guard `date < latestTickDate → null` stays.

- [ ] **Step 1: Write failing tests** in `tests/vikingPlanner.test.ts` (reuse its `data`, `tick`, `ride`, `workout`, `day` helpers):
  - `gymTick: early returns the passed open boxes` — ticks 1, 2; UB on day(2) → tick day 4, `early` [3], `newLap` false.
  - `gymTick: a pinned session is not early` — same, with `pins {[day(2)]: 4}` → `early` [].
  - `gymTick: filled box → newLap` — ticks 1, 2; UA → `newLap` true, tick day 1.
  - `rideTick: defers on a gym day` — ticks 1 (current 2 = LA); 50 min ride → null.
  - `rideTick: fills a pinned ride box` — ticks 1; `pins {[d]: 3}`; 50 min ride on d → tick day 3.
  - `endOfDay: ride-first swap fills the ride box` — ticks 1 (current 2 = LA); 50 min easy ride on d, no workout; `delivered` true → tick day 6, `early` [2].
  - `endOfDay: hard ride takes box 3` — same with an H1 ride → day 3.
  - `endOfDay: waits until delivered` — same with `delivered` false → `'wait'`.
  - `endOfDay: 30 min ride on a gym day stays extra` → `'slid'`.
  - `endOfDay: ride on a day with a workout stays extra` → null (the workout's tick exists) or `'slid'`, never a ride tick.
  - `endOfDay: day off` — `pins {[d]: 0}` → `'off'`.
  - `endOfDay: pinned rest box 8 ticks done`.
- [ ] **Step 2:** Run `npx vitest run tests/vikingPlanner.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Update the callers so the build passes:
  - `engine.ts`: pass `{}` pins and `delivered: true` for now; `realigned` → `newLap`.
  - `life-bot/viking.ts:467`: reply text `cycle day N ticked` plus ` (a new lap started)` when `newLap`.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit `feat(viking): swaps, ride-first swaps and days off in the tick rules`.

### Task 3: `planAhead` with pins and rules on the planned order

**Files:**
- Modify: `supabase/functions/_shared/viking/planner.ts` (`PlanCtx` ~28, `planAhead` ~112–203)
- Test: `tests/vikingPlanner.test.ts`

**Interfaces:**
- Consumes: Task 2's `Pins`; Task 1's `lap`.
- Produces:
  - `PlanCtx.pins?: Pins`
  - `export function planOrder(D: VikingData, ctx: PlanCtx, days = 7): Array<{ date: string; day: number }>`, where `day` 0 = day off. It's used by `planAhead` and by Task 6's preview.
  - A day off is `PlanDay { date, cycleDay: 0, kind: 'rest', reason: 'day off' }`.

- [ ] **Step 1: Write failing tests:**
  - `planOrder: fills open boxes in order, skipping filled` — ticks 1, 2, 4 → 3, 5, 6, 7, 8, 1, 2 (lap rolls over).
  - `planOrder: a pin places its box on its date` — ticks 1; `pins {[t+2]: 2}` → t: 3, t+1: 4, t+2: 2, t+3: 5.
  - `planOrder: a day off moves everything back a day` — ticks 1; `pins {[t+1]: 0}` → 2, 0, 3, 4…
  - `planOrder: pins for filled boxes are ignored`.
  - `planAhead: a hard ride pinned before Lower becomes E1` — pin H1 box 3 on the date before a planned LB → `ride.code` E1, `from` H1, reason `Lower B tomorrow`.
  - `planAhead: the frozen day is kept only when no pin on today differs`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** First build `planOrder` (the spec's simulation). Then build the days from it, and take `nx` (the next gym session) from the next entry of the order, or `after(lastDay)` for the last entry. The freeze applies only when `!ctx.pins?.[today] || ctx.pins[today] === frozen.day.cycleDay`.
- [ ] **Step 4:** Run `npm test`. Expected: all pass, including the existing planner tests unchanged.
- [ ] **Step 5:** Commit `feat(viking): plan the lap in any order, with pins and days off`.

### Task 4: Engine (pins, wait, messages, pin cleanup)

**Files:**
- Modify: `supabase/functions/_shared/viking/engine.ts` (`VikingStore` ~18, the step-3 stream ~100–190, rebuild ~200)
- Modify: `supabase/functions/_shared/viking/recap.ts`
- Test: `tests/vikingEngine.test.ts` (extend `MemoryStore`), `tests/vikingRecap.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces:
  - `VikingStore.load()` also returns `pins: Pins` and `inserted: Array<{ date: string; insertedAt: string }>` (`garmin_in` from the last 8 days, processed or not).
  - `VikingStore.unpin(dates: string[]): Promise<void>`
  - In `recap.ts`:
    - `swapLine(early: number[], to: string): string`
    - `newLapLine(sk: SessionKey, passed: number[]): string`
    - `rideSwapText(date: string, gym: SessionKey, day: number): string`
    - `skipKeyboard(ref: string, days: number[]): Keyboard | null`, where `ref` is `<activityId>` or `r<date>`.
    - `recapText(r, before, after, swap: { early: number[]; to: string } | null, newLap: number[] | null)`. The `realigned` boolean is removed.
    - Day names come from `CYCLE` (gym session name, else the ride/rest name), at most 3, then `and N more`.

- [ ] **Step 1: Write failing tests.**

  In `tests/vikingRecap.test.ts`:
  - the exact copy of the three lines from Global Constraints;
  - `skipKeyboard` with 1 day (one button, no "all") and with 4 days (3 + all).

  In `tests/vikingEngine.test.ts`:
  - `engine: live 27–29 Nov scenario`
    - Seed ticks `2026-11-24_auto_1` and `2026-11-25_auto_2` plus `LB22`, and inbox UB on 27 Nov.
    - Expect: the recap has the swap line and `vks:` buttons; `plan/current.days[0]` is 28 Nov `ride`; 29 Nov is LB.
    - Then a 60 min ride on 28 Nov, with the clock on 29 Nov → plan day 29 Nov is LB, and no UB anywhere in the 7 days.
  - `engine: ride-first swap waits for delivery, then sends once`
    - LA due, 50 min ride, no workout, no `mirroredAt` after the date → no tick, `settledThrough` unchanged.
    - Set `plan/garmin` `mirroredAt` after the date → tick day 6, the ride swap message sent once (claim `vkswap:r<date>`).
  - `engine: late gym import within the wait wins over the ride swap` — the gym session for that date arrives before delivery → a gym tick, no ride swap.
  - `engine: wait is capped at 12 h`.
  - `engine: drops expired and filled pins` → `unpin` called with those dates.
  - `engine: day off is not a slid date`.
  - `engine: new lap recap names the passed days`.
- [ ] **Step 2:** Run `npx vitest run tests/vikingEngine.test.ts tests/vikingRecap.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `delivered(d)` uses Global Constraints' rule, with the end of d computed in `tz`.
  - On `'wait'`, `break` the stream exactly like the write-error branch, without advancing `settledThrough`.
  - On `'off'`, advance `settledThrough` and don't touch `slidDates`.
  - After the stream, unpin dates `< today`, dates whose box is filled, and dates that have a tick.
  - Pass the remaining pins to `planAhead` and to every tick call.
  - Gym-swap keyboards are the confirm rows followed by the skip rows.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit `feat(viking): engine understands swaps, waits on ride swaps, sends skip buttons`.

### Task 5: life-bot store (pins and inserted)

**Files:**
- Modify: `supabase/functions/life-bot/viking.ts` (`supabaseStore.load` ~190, add `unpin`)

**Interfaces:**
- Consumes: Task 4's `VikingStore` additions.
- Produces: the Supabase implementation.
  - `load` adds `plan/pins` to the `plan` doc read.
  - `load` adds a query `garmin_in` with `insertedAt:data->>insertedAt` and `date:data->>date`, `doc_id` limited to dates ≥ today − 8 (filter on `data->>date`).
  - `export async function editPins(db, userId, set: Pins, remove: string[]): Promise<void>`, shared by `unpin` and Task 6's `vikingMove`.
    - supabase-js can't express `data - key`, so it reads `plan/pins` with its `updated_at`.
    - It applies the change in memory and writes with `.eq('updated_at', old)`, a compare-and-set, or creates the doc when it's missing.
    - It retries up to 3 times when 0 rows match, so a concurrent `viking_move` and tick never lose each other's keys.
  - `unpin(dates)` = `editPins(db, userId, {}, dates)`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `deno check supabase/functions/life-bot/index.ts` (as CI does) and `npm run build`. Expected: both clean.
- [ ] **Step 3:** Commit `feat(life-bot): load pins and garmin_in delivery times for the Viking tick`.

### Task 6: Skip taps and `viking_move`

**Files:**
- Create: `supabase/functions/_shared/viking/moves.ts`
- Modify: `supabase/functions/life-bot/index.ts` (callback ~305: add `kind === 'vks'`)
- Modify: `supabase/functions/life-bot/agent.ts` (Viking prompt lines ~290–296, the tool list after `viking_fix` ~319, the dispatch ~713)
- Modify: `supabase/functions/life-bot/viking.ts` (add `vikingMove`)
- Test: `tests/vikingMoves.test.ts`

**Interfaces:**
- Consumes: Task 1's `lap`, Task 3's `planOrder`/`planAhead`, Task 2's `Pins`.
- Produces (pure, in `moves.ts`):
  - `skipTicks(D: VikingData, date: string, days: number[], nowMs: number): Array<{ id: string; doc: CycleDoc }>`
    - Covers only days whose box is still open.
    - Each is dated `max(date, latest tick date)` with `savedAt` greater than every existing tick's.
    - Status is `skip`.
  - `resolveMoves(D: VikingData, pins: Pins, moves: Array<{ what: string; date: string }>, today: string, clear?: boolean): { pins: Pins; errors: string[] }`
    - `what`: `UA|LA|UB|LB`, a ride code, `off`, or `1`–`8`.
    - A ride code resolves to the first open box whose planned ride code matches. Use `planAhead` without pins to read the codes.
    - Errors use exact copy, for example `Upper A is done this lap; next is Lower B`, `Dates must be today to <today+6>`.
    - A new pin on a date replaces that date's old pin. A box gets one date, and the newest move wins. `off` can't share a date with another pin.

- [ ] **Step 1: Write failing tests** in `tests/vikingMoves.test.ts`:
  - `vks skip ticks sort after the latest tick and fill only open boxes` — ticks 1, 2, 4 (same date as a 4th tick at savedAt 10). Skip [3] → one tick, day 3, status skip, `savedAt` > 10. Then `lap` current is 5, not a new lap. Skip [4] → [].
  - `resolveMoves: swap today and tomorrow` — two moves → two pins, no errors.
  - `resolveMoves: refuses a session done this lap`, with the exact message.
  - `resolveMoves: refuses dates outside the window`.
  - `resolveMoves: off replaces a pin on that date`.
  - `resolveMoves: clear empties pins`.
- [ ] **Step 2:** Run `npx vitest run tests/vikingMoves.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `moves.ts`.**
- [ ] **Step 4: Wire life-bot.**
  - **`vks:` callback**, next to `vr`, with the same `vikingOn` check and try/catch.
    1. Load data.
    2. Find the swap's date: for `r<date>` it's the date; otherwise the date of the `garmin_in` doc.
    3. Read the passed days from the tapped message's keyboard (`all` = every `vks:` row's day). Using the keyboard makes it the source of truth without storing anything.
    4. Write each `skipTicks` result with `createDoc`.
    5. Call `clearPlanHash`, then `dropButtonRow`, or `settleButtons` for "all".
    - Answer `Skipped <name>`, or `Already done` when the result is empty.
  - **`vikingMove(db, userId, tz, today, input)`**:
    1. Read `plan/pins`.
    2. Call `resolveMoves`.
    3. Write the changes with Task 5's `editPins`.
    4. Run `planAhead` with the new pins and the store's `context(today)` as a preview.
    5. Return the 7 days as `dayLine` rows plus warnings:
       - `No training window on <date>` (a gym day with no `windows[date]`);
       - `Hard ride the morning after a night shift on <date>`.
    6. Return `next sync: hh:12 local` (the next :12 past every third UTC hour from 00:12).
    7. Call `clearPlanHash`.
  - **The `viking_move` tool:**
    - `input_schema`:
      - `moves`: an array of `{what, date}`, with `what` described as "UA/LA/UB/LB, a ride code, 'off' for an extra day off (the meaning of 'rest day' / 'day off'), or a cycle day 1–8 ('8' only to move the lap's own rest day)";
      - `clear`: a boolean.
    - Description: swaps and moves around shifts, and that the watch updates at the next sync.
  - **Prompt line ~295:** replace "a skipped day just waits in the cycle" with: "Sessions can be done in any order: Jarvis treats a session the watch records early as a swap and offers skip buttons. Use viking_move for 'swap today and tomorrow', 'move X to <day>' or a day off. For a same-morning swap, tell him to start the other dated workout on the watch; viking_move reaches the watch at the next sync."
- [ ] **Step 5:** Run `npm test`, `deno check supabase/functions/life-bot/index.ts` and `npm run build`. Expected: all clean.
- [ ] **Step 6:** Commit `feat(life-bot): skip buttons and viking_move for swaps, moves and days off`.

### Task 7: App cycle card

**Files:**
- Modify: `src/features/viking/VikingApp.tsx` (`CycleCard` ~591–640), `src/features/viking/viking.css`
- Modify: `supabase/functions/_shared/viking/watchCard.ts` only if the test below fails
- Test: `tests/vikingWatchCard.test.ts`

**Interfaces:**
- Consumes: Task 1's `b.lap()`.

- [ ] **Step 1: Write a failing test** `watchCard skips a day off`. A plan whose first day is `{kind: 'rest', cycleDay: 0, reason: 'day off'}` → the card is the next training day.
- [ ] **Step 2:** Run it. If it already passes (the current code filters out `rest`), keep it as a regression test.
- [ ] **Step 3: Implement the box row.**
  - Under the header, add a row of 8 boxes from `b.lap().boxes`: ✓ done, – skip, ○ open.
  - Each box has its short name from Global Constraints, and the current day gets an outline.
  - It must fit 390 px with no horizontal scroll.
  - Replace the footnote's first sentence with the exact copy from Global Constraints, and keep the `Last: …` line.
- [ ] **Step 4: Verify.**
  - Run `npm run build`. Expected: clean.
  - Run the app (`npm run dev`) and screenshot the Today tab at 390 px wide with Playwright (deviceScaleFactor 1), seeded with ticks 1, 2, 4.
  - Expected: boxes ✓ ✓ ○ ✓ ○ ○ ○ ○, current box 3, `document.documentElement.scrollWidth <= 390`.
- [ ] **Step 5:** Commit `feat(viking): the cycle card shows the lap as a checklist`.

### Task 8: Rollout

**Files:** none. These are live operations, run by the lead after review.

- [ ] **Step 1:** Push the branch. Ask the owner before opening the PR, as the repository rules require. CI must be green: tests, `deno check` and build.
- [ ] **Step 2: After the owner merges** (the deploy workflow redeploys life-bot):
  1. Delete the cycle docs `2026-11-27_swap_2`, and `2026-11-28_swap_4` if present, using `execute_sql`. Approved in the spec.
  2. Clear `plan/current.hash` so the next tick rebuilds.
- [ ] **Step 3: Verify on the next tick.**
  - `plan/current` has the expected live state from the spec: current = 5 once the 28 Nov ride is in; no Upper B in the 7 days until the lap rolls over.
  - The `life-bot` logs show no `[viking]` errors.
- [ ] **Step 4:** Tell the owner the result, and remind them that the Strava naming project is next.
