# Spec: Reset deload cycle

Code lives in `src/features/reset/`. Tests in `tests/reset*.test.ts`. Read `cook/BRIEF.md` for the user's decisions; this file turns them into rules.

## 1. Program calendar (pure function, `resetData.ts`)

State gains `deloadWeeks: number[]` — program weeks D switched to deload by hand. `week` keeps counting up with no 12 cap (clamp 1..99).

`weekPhase(week, deloadWeeks)` walks weeks 1..week:
- `blockStart = 1`, `block = 1`.
- For each w: `blockWeek = w - blockStart + 1`. `deload = blockWeek === 6 || deloadWeeks.includes(w)`. If `deload` and `w < week`: next block starts at `w + 1` (`block++`).
- Returns `{ week, block, blockWeek, kind, rampIn, manual, scheduled }` where
  - `kind`: blockWeek 1 → `'base'`, 2–3 → `'load'`, 4 → `'density'`, 5 → `'peak'`, deload → `'deload'`.
  - `rampIn`: block 1 && blockWeek 1 (the old week-1 half-set rule).
  - `manual`: this week is a deload only because of `deloadWeeks`. `scheduled`: blockWeek 6.
- A manual deload on blockWeek 1..5 ends that block early. A manual deload on a week that is already blockWeek 6 changes nothing.
- Sanity values (deloadWeeks = []): week 5 → block 1 peak; week 6 → deload; week 7 → block 2 base (no ramp-in); week 12 → block 2 deload (D's week right now); week 13 → block 3 base.
- With deloadWeeks = [9]: week 9 deload (manual), week 10 → block 3 wk1, week 15 → block 3 deload (scheduled).

Unknown/garbage `deloadWeeks` from cache or cloud must not crash: treat non-arrays as `[]`, ignore non-integers.

## 2. Prescription (`weekPrescription` takes the phase, not a bare week number)

Strength/accessory exercises (not `conditioning`, not retired), on non-mobility days:
- rampIn: sets = ceil(sets/2), min 1 (unchanged rule).
- density and peak: superset (`pair`) rests drop to `densityRestSec` (45).
- peak: conditioning runs 6 × 40 s hard / 30 s easy (unchanged numbers).
- deload: sets = ceil(sets/2), min 1. Reps unchanged. Rests as written (no density). Conditioning exactly as written (user did not choose to change it). A ramp exercise keeps its ramp set as set 1.
- Mobility days (`day.kind === 'mobility'`): no deload change at all. The prescription function needs to know the day kind or the caller must skip it; pick whichever keeps every caller (day view, store box count, time estimate, logged session) consistent.

Every place that previously used `s.week` for prescriptions (store `ensureDay`/slot prescription, DayView, PlanView estimate, `estimateSeconds`, `weekNote`) must use the phase, so the boxes she ticks, the card text, the session estimate and the logged session totals agree.

## 3. Load guidance (from her logs)

Base = the best (max) weight she logged for that exercise id (the slot's *current* exercise, after swaps) in the last 56 days (local edits + `cloudLogs`). Max ignores the lighter deload weights by design.
- deload: aim = round to nearest 2.5 kg of 0.65 × base. Note: "Deload: 2 of 4 sets · ~65% weight — aim 26 kg (recent best 40 kg)". No logged weight: "Deload: 2 of 4 sets · about 65% of your usual weight, RPE 5–6".
- block ≥ 2, blockWeek 1: start = round to nearest 2.5 of 1.05 × base, and at least base + 2.5. Note: "New block: start at 42.5 kg (recent best 40 kg)". No logged weight: "New block: start one pin heavier than last block".
- Bodyweight / timed / conditioning exercises never get a kg target.
- Weights are display strings like the existing ones; format 42.5 not 42.50.

## 4. UI

Plan tab week bar: shows "Week 12" plus a line like "Block 2 · Deload week" / "Block 3 · Week 1 of 6 · Base". A deload switch:
- scheduled deload: shown as on and locked, labelled as a scheduled deload.
- otherwise: a toggle "Take a deload this week" that adds/removes the current week in `deloadWeeks`. Turning it off restores the normal week.
- During a deload the plan card is visibly calmer (use the existing light theme tokens in `reset.css`; no new fonts, no purple gradients, no glowing orbs, no em dashes in NEW copy).
Plan tips (`WEEK_TIPS`/`tipForWeek`) become phase-based; the deload tip tells her: half the sets, about 65% weight, same reps, RPE 5–6, stop every set with 4+ reps in the tank, leave fresher than she came in, sleep and protein matter more this week, next week starts a new heavier block. Base-of-new-block tip explains the heavier start. Keep the existing voice; `<b>` is allowed as today.
Day view: the week note on each card follows §3. Session header estimate uses the phase.

## 5. Persistence and sync

- `ResetState.deloadWeeks: number[]`, default `[]`. Cache load must default it for old caches.
- Cloud: new column `deload_weeks integer[] not null default '{}'` on `public.reset_app_state` via a new migration `supabase/migrations/0036_reset_deload_weeks.sql` (follow the style of `0025_reset_tracker.sql`; RLS already covers the table).
- `upsertAppState` writes it; `fetchAll` reads it (null → `[]`); the cloud merge in the store takes it the same way it takes `week`.
- Toggling deload re-sizes any day in progress exactly like `bumpWeek` does (keep ticks that still fit), saves the cache and upserts.
- `bumpWeek` cap raised from 12 to 99.

## 6. Tests

Update the existing tests that assumed the old 8-week rules (week 5 deload, week 6+ density, week 7+ peak) to the new phase rules, and add tests for: `weekPhase` sanity values above; manual deload shifting the next scheduled deload; deload prescription (half sets, ramp kept, conditioning untouched, mobility untouched); load targets (rounding, min +2.5, 56-day window, swaps use current exercise, no target for bodyweight/timed); store toggle (persists, re-sizes progress, survives cloud merge, garbage input); the hour-cap time test across every phase kind. `npm test` and `npm run typecheck` must pass.
