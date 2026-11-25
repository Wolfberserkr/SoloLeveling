# Garmin-first Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Train from the Garmin watch. Jarvis imports the sets, runs the Viking progression in tested code, keeps the watch and Google Calendar in step with a cycle that waits for the owner, sends a Saturday briefing, and retires Ascend for three habit tasks. Reset is not touched.

**Architecture:** The Viking and bike rules move to `supabase/functions/_shared/viking/` so the app, the tests and the `life-bot` Deno tick share one copy. Pure modules turn raw Garmin sets into Viking docs, settle the 8-day cycle, and build a plan record (`viking_docs` coll `plan`) with ready-made Garmin workout JSON. The tick runs them every minute. The Claude sync routine, the only part that can reach Garmin, copies raw activities in and the plan's workouts out.

**Tech Stack:** TypeScript (Vite/React app, Deno edge function), Vitest, Supabase Postgres (`viking_docs`, `life_*`), Telegram Bot API, the Google Apps Script bridge, Garmin through the Claude routine's connector.

**Spec:** `docs/superpowers/specs/2026-11-25-garmin-first-training-design.md`. Read it first: the rules below argue from it.

## Global Constraints

- Nothing under `src/features/reset/`, no `reset_*` table, and no `tests/reset*.test.ts` changes. `npm test` must stay green, Reset tests included.
- Shared modules under `supabase/functions/_shared/` use explicit `.ts` import suffixes and no Node, Deno or DOM APIs (pure; `today`/`now` passed in).
- Exercise keys, session keys and ride codes are frozen (`vikingData.ts` header). The `workouts` doc id stays `<YYYY-MM-DD>_<SessionKey>`.
- Garmin names: dated workouts are `Viking <label> (<Ddd D Mon>)`, e.g. `Viking Lower A (Wed 25 Nov)`, `Viking E1 · Endurance 75 min (Sat 28 Nov)`. Only names starting `Viking ` are ever touched. The four library workouts (`Viking Upper A`, `Viking Upper B`, `Viking Lower A`, `Viking Lower B`) are never edited, deleted or scheduled.
- HR targets in bpm: Z1 90–114 · Z2 115–135 · Z3 136–150 · Z4 151–167 · Z5 168–186 (custom HR, `workoutTargetTypeId` 4, never `zoneNumber`).
- Calendar events Jarvis makes carry `[jarvis]`. Training blocks also carry `viking:<YYYY-MM-DD>`. Never touch others.
- Timezone from `life_profile.timezone` (America/Aruba). Local dates are `YYYY-MM-DD`.
- No `DELETE` statements in routine SQL (the connector blocks on confirmation). Use upserts and `processed_at` markers.
- Commits end with the session's attribution lines. Work on branch `ccr-f8c4ff87-7uj579`. Never push to `main`.

## Review Focus

1. **The import arrives after midnight.** A session done Tuesday evening but imported Wednesday 01:00, after the midnight settle ran, must tick the cycle once (dated Tuesday) and must not be counted as missed → Task 6, `settle: late import after midnight`.
2. **The same activity is seen twice, or the owner typed the session too.** Re-running the import is a no-op, and an existing `workouts` doc for that date+session wins → Task 5, `import: idempotent and owner wins`, and Task 9's `processed_at` guard.
3. **An activity recorded from an old library workout** (e.g. 25 Nov's Lower A: 6 groups, no farmer's carry, bodyweight crunch × 30, squat reps null) maps every set to the right exercise → Task 5's real-data fixture test.
4. **The watch never shows a reckless weight.** A target is never more than one `STEP[inc]` above the last top kg, never has kg on `bw`/`pull`, and the reset override is never above the last top → Task 4, `targets: bounded`.
5. **No settings or empty history** (a new device, or Viking not set up) must not crash the tick or push anything → Task 6, `planAhead: no settings → []`, and Task 9's guard.

---

### Task 1: Move the Viking rules to shared code

**Files:**
- Create: `supabase/functions/_shared/viking/data.ts`, `logic.ts`, `bikePlan.ts`, `bikeLogic.ts` (the contents of the four `src/features/viking/` files, imports rewritten to `./data.ts`, `./logic.ts`, `./bikePlan.ts`)
- Modify: `src/features/viking/vikingData.ts`, `vikingLogic.ts`, `bikePlan.ts`, `bikeLogic.ts`. Each becomes `export * from '../../../supabase/functions/_shared/viking/<file>.ts';`
- Test: `tests/vikingShared.test.ts`

**Interfaces:**
- Produces: every existing export, unchanged in name and type, from both paths.

- [ ] **Step 1: Write the failing test**

```ts
import * as shared from '../supabase/functions/_shared/viking/logic';
import * as app from '@/features/viking/vikingLogic';
import { SESS } from '../supabase/functions/_shared/viking/data';
it('app and Deno share one copy of the rules', () => {
  expect(app.viking).toBe(shared.viking);
  expect(Object.keys(SESS)).toEqual(['UA', 'LA', 'UB', 'LB']);
});
```
- [ ] **Step 2: Run** `npx vitest run tests/vikingShared.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Move the files** with `git mv`, then rewrite their imports and add the re-export shims.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: all pass, `viking.test.ts` and `bike.test.ts` unchanged.
- [ ] **Step 5: Commit** `refactor(viking): share the plan rules with the life-bot`.

### Task 2: Migration 0037

**Files:**
- Create: `supabase/migrations/0037_viking_garmin.sql`

**Interfaces:**
- Produces:
  - `viking_docs.coll` also allows `'garmin_in'` and `'plan'`
  - `life_tasks.remind_anchor text check (remind_anchor in ('wake','winddown'))` (nullable)
  - `life_tasks.remind_offset_min int not null default 0`
  - pg_cron job `ascend-reminders` unscheduled

- [ ] **Step 1: Write the migration.**
  - Drop and re-add `viking_docs_coll_check` with the 0029 list plus `'garmin_in','plan'`. Read 0029 for the exact current list.
  - Add the two `life_tasks` columns with `add column if not exists`.
  - Unschedule `ascend-reminders` with the same guarded `do $$ … $$` pattern 0028 uses for the RPG heartbeat.
  - Add a header comment documenting the two new colls: `garmin_in/<activityId>` holds the raw strength sets from the routine; `plan/current`, `plan/<date>`, `plan/garmin`, `plan/state` and `plan/weekly` are written by life-bot.
- [ ] **Step 2: Verify** with `grep -c "garmin_in" supabase/migrations/0037_viking_garmin.sql` (≥ 1), and check that the statements are idempotent (`if exists` / `if not exists`).
- [ ] **Step 3: Commit** `feat(viking): migration for Garmin import and plan docs`.

### Task 3: Garmin exercise map and workout builders

**Files:**
- Create: `supabase/functions/_shared/viking/garmin.ts`
- Test: `tests/vikingGarmin.test.ts`

**Interfaces:**
- Consumes: `SESS`, `Exercise`, `SessionKey`, `PhaseKey` (data.ts); `Rx` (bikeLogic.ts).
- Produces:
  - `type GarminEx = { category: string; exerciseName?: string }`
  - `const GARMIN_EX: Record<string, GarminEx | null>`, keyed by every exercise key in `SESS`
  - `type StrengthTarget = { kg: number | null; reps: number; sets: number; note: string }`
  - `type GarminDto = Record<string, unknown>`
  - `restSeconds(rest: string): number`
  - `buildStrengthWorkout(sk: SessionKey, t: Record<string, StrengthTarget>, name: string, description: string): GarminDto`
  - `buildRideWorkout(rx: Rx, week: number, phase: PhaseKey, name: string, description: string): GarminDto`
  - `workoutName(label: string, date: string): string`
  - `hashOf(x: unknown): string`, an 8-hex FNV-1a of key-sorted JSON

`GARMIN_EX` values:
- **Upper A:** `bench` BENCH_PRESS/BARBELL_BENCH_PRESS · `csrow` ROW · `dbsp` SHOULDER_PRESS/SEATED_DUMBBELL_SHOULDER_PRESS · `pulldown` PULL_UP/LAT_PULLDOWN · `incdb` BENCH_PRESS/INCLINE_DUMBBELL_BENCH_PRESS · `clat` LATERAL_RAISE/ONE_ARM_CABLE_LATERAL_RAISE · `ezcurl` CURL/STANDING_EZ_BAR_BICEPS_CURL · `pushdown` TRICEPS_EXTENSION/TRICEPS_PRESSDOWN
- **Lower A:** `squat` SQUAT/BARBELL_BACK_SQUAT · `rdl` DEADLIFT/ROMANIAN_DEADLIFT · `legpress` SQUAT/LEG_PRESS · `lycurl` LEG_CURL/LEG_CURL · `stcalf` CALF_RAISE/STANDING_CALF_RAISE · `crunch` CRUNCH/CABLE_CRUNCH · `farmer` CARRY/FARMERS_CARRY
- **Upper B:** `incbb` BENCH_PRESS/INCLINE_BARBELL_BENCH_PRESS · `pullup` PULL_UP/PULL_UP · `mpress` SHOULDER_PRESS · `scrow` ROW/SEATED_CABLE_ROW · `pecdeck` FLYE/CABLE_CROSSOVER · `dblat` LATERAL_RAISE/DUMBBELL_LATERAL_RAISE · `revpec` null · `incurl` CURL/INCLINE_DUMBBELL_BICEPS_CURL · `ohext` TRICEPS_EXTENSION/CABLE_OVERHEAD_TRICEPS_EXTENSION · `shrug` SHRUG/DUMBBELL_SHRUG
- **Lower B:** `trapdl` DEADLIFT/TRAP_BAR_DEADLIFT · `bss` LUNGE/DUMBBELL_BULGARIAN_SPLIT_SQUAT · `legext` null · `securl` LEG_CURL/LEG_CURL · `secalf` CALF_RAISE/SEATED_CALF_RAISE · `hkr` LEG_RAISE/HANGING_KNEE_RAISE · `abwheel` CORE/KNEELING_AB_WHEEL

**Strength DTO shape.** Mirror the owner's library workout read on 25 Nov:
- `sportType {sportTypeId:5, sportTypeKey:'strength_training'}` and one segment.
- One `RepeatGroupDTO` per exercise in `SESS[sk].ex` order. Every exercise is included, even at 1 set. Each group has `numberOfIterations = sets`, `endCondition {conditionTypeId:7, conditionTypeKey:'iterations'}`, `endConditionValue = sets` and `smartRepeat:false`.
- The group's children are exactly [exercise `ExecutableStepDTO` (`stepTypeId:3 'interval'`), rest (`stepTypeId:5 'rest'`, `endCondition {2,'time'}`, `endConditionValue = restSeconds`)].
- The exercise step:
  - `description = ex.n`, plus `· <note>` when `t.note` is set
  - reps end condition `{10,'reps'}` with `endConditionValue = reps`. For `ex.u === 'm'`, use `{1,'lap.button'}` and add `<reps> m` to the description instead.
  - `category`/`exerciseName` from `GARMIN_EX`, or null when the entry is null
  - `weightValue = kg` with `weightUnit {unitId:8, unitKey:'kilogram', factor:1000}` when `kg` is a positive number; otherwise both null
- `stepOrder` counts up across groups and children: group 1, exercise 2, rest 3, group 4, …
- This structure is what makes a recorded set's `wktStepIndex` equal `3 × group index` (spec, Constraints).

**Rides.** Follow sync.md 9.4 exactly. Use `sportTypeId:2 'cycling'`, time end conditions, and custom HR targets from Global Constraints. Durations:
- E1: `rx.min[0]` min, Z2, or Z1–Z2 (90–135) when `rx.zones` includes Z1
- R1: 30 min Z1
- H1: 15 min Z2 warm-up; a repeat group of N × (3 min Z4 + 210 s at 90–135), with N = `min(6, 4 + floor((week−1)/2))` in phase 1, else 5 × (4 min Z4 + 210 s); 10 min Z2 cool-down
- H2: 10 min Z2, 45 min with no target, 5 min Z1
- H3: 15 min Z2, 10 × (30 s Z5 + 150 s Z1), 5 min Z1
- L1: 120 min Z2

`restSeconds`: `'2–3 min'` → 150 (midpoint), `'2 min'` → 120, `'90 s'` → 90, `'60 s'` → 60, `'60 s after pair'` → 60, `'superset'` → 15.

- [ ] **Step 1: Write the failing tests**

```ts
it('maps every plan exercise', () => {
  for (const sk of ORDER) for (const e of SESS[sk].ex) expect(e.k in GARMIN_EX).toBe(true);
});
it('restSeconds', () => {
  expect(restSeconds('2–3 min')).toBe(150); expect(restSeconds('90 s')).toBe(90);
  expect(restSeconds('superset')).toBe(15); expect(restSeconds('60 s after pair')).toBe(60);
});
it('strength DTO: one [exercise, rest] group per exercise, so set g sits at FIT index 3g', () => {
  const t = Object.fromEntries(SESS.LA.ex.map((e) => [e.k, { kg: e.k === 'squat' ? 112.5 : null, reps: e.r[0], sets: e.s, note: '' }]));
  const dto = buildStrengthWorkout('LA', t, 'Viking Lower A (Wed 25 Nov)', 'x') as any;
  const groups = dto.workoutSegments[0].workoutSteps;
  expect(groups).toHaveLength(SESS.LA.ex.length);
  expect(groups[0].numberOfIterations).toBe(3);
  expect(groups[0].workoutSteps[0]).toMatchObject({ category: 'SQUAT', exerciseName: 'BARBELL_BACK_SQUAT', weightValue: 112.5, endConditionValue: 5 });
  expect(groups[1].workoutSteps[0].weightValue).toBeNull();
  expect(groups[6].workoutSteps[0].endCondition.conditionTypeKey).toBe('lap.button'); // farmer's carry, metres
  expect(groups.map((g: any) => g.stepOrder)).toEqual([1, 4, 7, 10, 13, 16, 19]);
});
it('ride DTO: E1 75 min is one Z2 step in bpm', () => {
  const dto = buildRideWorkout({ code: 'E1', min: [75, 75], zones: ['Z2'], detail: '' }, 7, '1', 'n', 'd') as any;
  const s = dto.workoutSegments[0].workoutSteps;
  expect(s).toHaveLength(1);
  expect(s[0]).toMatchObject({ endConditionValue: 4500, targetValueOne: 115, targetValueTwo: 135 });
  expect(s[0].targetType.workoutTargetTypeId).toBe(4);
});
it('H1 in phase 1 week 7 has 6 climbs', () => {
  const s = (buildRideWorkout({ code: 'H1', min: [50, 60], zones: ['Z2', 'Z4'], detail: '' }, 7, '1', 'n', 'd') as any).workoutSegments[0].workoutSteps;
  expect(s[1].numberOfIterations).toBe(6);
});
it('workoutName and hash', () => {
  expect(workoutName('Lower A', '2026-11-25')).toBe('Viking Lower A (Wed 25 Nov)');
  expect(hashOf({ a: 1, b: [2] })).toBe(hashOf({ b: [2], a: 1 }));
  expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: 2 }));
});
```
- [ ] **Step 2: Run** `npx vitest run tests/vikingGarmin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `garmin.ts` to the interfaces above.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(viking): Garmin exercise map and workout builders`.

### Task 4: Next-session targets

**Files:**
- Create: `supabase/functions/_shared/viking/targets.ts`
- Test: `tests/vikingTargets.test.ts`

**Interfaces:**
- Consumes: `viking()`/`Viking` (logic.ts), `SESS`, `STEP`, `EXBY` (data.ts), `StrengthTarget` (Task 3).
- Produces:
  - `type Overrides = { kg?: Record<string, number> }`
  - `nextTargets(v: Viking, sk: SessionKey, date: string, ov: Overrides): Record<string, StrengthTarget>`
  - `resetKg(top: number, inc: IncKey): number`: 90 % of top, rounded down to a multiple of `STEP[inc]` (or of 0.5 when the step is 0)

Rules (spec, Targets):
- **kg:** `v.exHint(ex).kg`. It's `null` when the hint kg is `''`, when `inc` is `'bw'` or `'pull'`, or when it isn't > 0.
- **The override wins** over the hint: `ov.kg[k]`.
- **reps:** `ex.r[0]` when there's no history, or when kg went up vs the last top. Otherwise `min(ex.r[1], min reps of the last session + 1)`.
- **sets:** `v.setCount(ex, sk, v.phaseOf(date), v.isDeloadWeek(v.weekOf(date)))`.
- **note:**
  - `''` in normal cases
  - `'+<step> kg'` after a bump
  - `'No set to failure: deload'` in a deload
  - `'Reset: build back'` with an override
  - `'Stalled 3 sessions'` when `plateau`

- [ ] **Step 1: Write the failing tests.** Build data with `viking.test.ts`'s `data()`/`workout()` helpers, copied locally.

```ts
it('targets: top of range on every set bumps by one step and drops reps to the bottom', () => {
  const v = viking(data({ workouts: { a: workout(day(0), 'LA', [{ ex: 'squat', sets: [{ kg: 110, reps: 8 }, { kg: 110, reps: 8 }, { kg: 110, reps: 8 }] }]) } }));
  expect(nextTargets(v, 'LA', day(8), {}).squat).toMatchObject({ kg: 115, reps: 5, sets: 3 });
});
it('targets: not there yet → same kg, lowest reps + 1', () => {
  const v = viking(data({ workouts: { a: workout(day(0), 'LA', [{ ex: 'squat', sets: [{ kg: 110, reps: 6 }, { kg: 110, reps: 5 }, { kg: 110, reps: 5 }] }]) } }));
  expect(nextTargets(v, 'LA', day(8), {}).squat).toMatchObject({ kg: 110, reps: 6 });
});
it('targets: bodyweight and assisted moves never carry kg', () => {
  const v = viking(data({ workouts: { a: workout(day(0), 'LB', [{ ex: 'hkr', sets: [{ kg: 82, reps: 15 }] }]) } }));
  expect(nextTargets(v, 'LB', day(8), {}).hkr.kg).toBeNull();
  expect(nextTargets(v, 'UB', day(8), {}).pullup.kg).toBeNull();
});
it('targets: first time → no kg, bottom of range', () => {
  expect(nextTargets(viking(data()), 'LA', day(0), {}).farmer).toMatchObject({ kg: null, reps: 30 });
});
it('targets: deload week halves sets (rounded up), same kg', () => {
  const v = viking(data({ workouts: { a: workout(day(0), 'LA', [{ ex: 'squat', sets: [{ kg: 110, reps: 5 }] }]) } }));
  expect(nextTargets(v, 'LA', day(35), {}).squat).toMatchObject({ sets: 2, kg: 110 }); // week 6
});
it('targets: override wins and resetKg rounds down to the step', () => {
  expect(resetKg(110, 'bbL')).toBe(95); // 99 → 95
  const v = viking(data({ workouts: { a: workout(day(0), 'LA', [{ ex: 'squat', sets: [{ kg: 110, reps: 5 }] }]) } }));
  expect(nextTargets(v, 'LA', day(8), { kg: { squat: 95 } }).squat.kg).toBe(95);
});
it('targets: bounded: never more than one step above the last top', () => {
  for (const sk of ORDER) for (const e of SESS[sk].ex) {
    const v = viking(data({ workouts: { a: workout(day(0), sk, [{ ex: e.k, sets: [{ kg: 50, reps: e.r[1] }] }]) } }));
    const kg = nextTargets(v, sk, day(8), {})[e.k].kg;
    if (kg !== null) expect(kg).toBeLessThanOrEqual(50 + STEP[e.inc]);
  }
});
```
- [ ] **Step 2: Run** `npx vitest run tests/vikingTargets.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `nextTargets` and `resetKg`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(viking): next-session targets for the watch`.

### Task 5: Import a Garmin strength activity

**Files:**
- Create: `supabase/functions/_shared/viking/garminImport.ts`
- Create: `tests/fixtures/garmin-2026-11-25-lower-a.json`
- Test: `tests/vikingImport.test.ts`

**Interfaces:**
- Consumes: `GARMIN_EX`, `StrengthTarget` (Task 3); `SESS`, `SessionKey`, `PhaseKey` (data.ts); `WorkoutDoc`, `VikingData` (logic.ts).
- Produces:
  - `type GarminSet = { category: string | null; name: string | null; reps: number | null; weightG: number | null; type: 'ACTIVE' | 'REST'; idx: number | null }`
  - `type GarminIn = { activityId: string; name: string; date: string; sets: GarminSet[]; processedAt?: string | null; result?: string }`. This is the doc the routine writes to `garmin_in/<activityId>`; `date` is the local start date.
  - `sessionOf(a: GarminIn): SessionKey | null`
  - `type ImportResult = { session: SessionKey; docId: string; doc: WorkoutDoc; assumptions: string[]; dropped: number }`
  - `importStrength(a: GarminIn, D: VikingData, planned: Record<string, StrengthTarget> | null, meta: { week: number; phase: PhaseKey; deload: boolean; savedAt: number }): ImportResult | null`. It returns null when `sessionOf` is null, or when `D.workouts[docId]` already exists (the owner wins).

Rules (spec, Import):
- `sessionOf` matches `/^Viking (Upper|Lower) (A|B)\b/`. Otherwise it votes: the session with the most ACTIVE-set categories found in its `GARMIN_EX`, needing at least 3 matches, else null.
- **Set mapping:** take `SESS[sk].ex[floor(idx/3)]` when its `GARMIN_EX` category equals the set's category, or the entry is null. Otherwise take the first exercise in the session whose `GARMIN_EX` matches both category and name, then category alone. If none, drop the set and count it.
- **Value rules:**
  - Reps null → `planned?.[k]?.reps ?? ex.r[0]`, and record the assumption once per exercise.
  - `inc` `bw` → kg 0. `pull` → `planned` kg or 0.
  - The weight equals the previous ACTIVE set's weight, that set was a different exercise, and the planned kg for this exercise is null → kg 0, with the assumption `<name>: kg not recorded`.
  - Fewer sets than `planned.sets` → assumption `<name>: <n> of <planned> sets`.
- **Copy** in the assumptions: `Squat: reps not recorded, assumed 5`.
- **Doc:** entries in `SESS[sk].ex` order, only exercises that have sets; kg = `weightG / 1000` rounded to 0.5.

Fixture: write the 25 Nov activity's ACTIVE sets as `GarminIn` (`activityId '25193624779'`, `name 'Viking Lower A'`, `date '2026-11-25'`):

| idx | category / name | reps | weightG |
|---|---|---|---|
| 0 | SQUAT / BARBELL_BACK_SQUAT | null | 110000 |
| 0 | SQUAT / BARBELL_BACK_SQUAT | null | 110000 |
| 0 | SQUAT / BARBELL_BACK_SQUAT | null | 110000 |
| 3 | DEADLIFT / ROMANIAN_DEADLIFT | 5 | 120000 |
| 3 | DEADLIFT / ROMANIAN_DEADLIFT | 10 | 110000 |
| 6 | SQUAT / LEG_PRESS | 10 | 120000 |
| 6 | SQUAT / LEG_PRESS | 10 | 120000 |
| 9 | LEG_CURL / LEG_CURL | 12 | 54000 |
| 9 | LEG_CURL / LEG_CURL | 12 | 54000 |
| 9 | LEG_CURL / LEG_CURL | 12 | 54000 |
| 12 | CALF_RAISE / STANDING_CALF_RAISE | 15 | 82000 |
| 12 | CALF_RAISE / STANDING_CALF_RAISE | 15 | 82000 |
| 12 | CALF_RAISE / STANDING_CALF_RAISE | 15 | 82000 |
| 15 | CRUNCH / CRUNCH | 15 | 82000 |

Each row also has `type: 'ACTIVE'`. Include the REST sets in between (`type 'REST'`, everything else null).

- [ ] **Step 1: Write the failing tests**

```ts
const a = JSON.parse(readFileSync('tests/fixtures/garmin-2026-11-25-lower-a.json', 'utf8')) as GarminIn;
const meta = { week: 7, phase: '1' as const, deload: false, savedAt: 1 };
it('import: the 25 Nov Lower A from the old library workout maps every set', () => {
  const r = importStrength(a, emptyData(), null, meta)!;
  expect(r.session).toBe('LA'); expect(r.docId).toBe('2026-11-25_LA'); expect(r.dropped).toBe(0);
  const by = Object.fromEntries(r.doc.entries.map((e) => [e.ex, e.sets]));
  expect(by.squat).toEqual([{ kg: 110, reps: 5 }, { kg: 110, reps: 5 }, { kg: 110, reps: 5 }]);
  expect(by.rdl).toEqual([{ kg: 120, reps: 5 }, { kg: 110, reps: 10 }]);
  expect(by.crunch).toEqual([{ kg: 0, reps: 15 }]);
  expect(r.assumptions).toContain('Back squat / hack squat: reps not recorded, assumed 5');
  expect(r.assumptions.some((s) => s.startsWith('Cable crunch: kg not recorded'))).toBe(true);
});
it('import: planned reps fill the gaps when a plan snapshot exists', () => {
  const r = importStrength(a, emptyData(), { squat: { kg: 110, reps: 6, sets: 3, note: '' } }, meta)!;
  expect(r.doc.entries[0].sets[0].reps).toBe(6);
});
it('import: idempotent and owner wins', () => {
  const D = { ...emptyData(), workouts: { '2026-11-25_LA': { date: '2026-11-25', session: 'LA', week: 7, phase: '1', deload: false, entries: [], savedAt: 0 } } } as VikingData;
  expect(importStrength(a, D, null, meta)).toBeNull();
});
it('sessionOf: truncated names and category voting', () => {
  expect(sessionOf({ ...a, name: 'Viking Upper B · deload (Fri 20' })).toBe('UB');
  expect(sessionOf({ ...a, name: 'Strength' })).toBe('LA');
  expect(sessionOf({ ...a, name: 'Strength', sets: a.sets.slice(0, 1) })).toBeNull();
});
```
- [ ] **Step 2: Run** `npx vitest run tests/vikingImport.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `garminImport.ts`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(viking): import strength sets from Garmin`.

### Task 6: Cycle settling and the 7-day planner

**Files:**
- Create: `supabase/functions/_shared/viking/planner.ts`
- Test: `tests/vikingPlanner.test.ts`

**Interfaces:**
- Consumes: `viking`, `CycleDoc`, `RideDoc`, `VikingData`, `dn`, `iso` (logic.ts); `bike`, `cycleDay`, `nextDay`, `dayOfSession`, `dayRides`, `prescribe`, `isHard`, `Rx` (bikeLogic.ts); `BIKE_PHASES`, `HARD_WINDOW_DAYS` (bikePlan.ts); `nextTargets`, `Overrides` (Task 4); `StrengthTarget`, `buildStrengthWorkout`, `buildRideWorkout`, `workoutName`, `hashOf`, `GarminDto` (Task 3).
- Produces:
  - `type Health = { hrvStatus?: string; readiness?: number; sleepH?: number; bodyBattery?: number; sleepStress?: number }`
  - `type PlanCtx = { today: string; afterNight: Set<string>; health?: Health; overrides: Overrides }`
  - `type PlanDay = { date: string; cycleDay: number; kind: 'gym' | 'ride' | 'rest'; session?: SessionKey; ride?: { code: RideCode; from?: RideCode; minutes: number; reason?: string }; targets?: Record<string, StrengthTarget>; garmin?: { name: string; sport: 'strength' | 'cycling'; dto: GarminDto; hash: string } }`
  - `tickId(date: string, day: number): string` → `` `${date}_auto_${day}` ``
  - `gymTick(D: VikingData, date: string, sk: SessionKey, savedAt: number): { id: string; doc: CycleDoc; realigned: boolean }`
  - `rideTick(D: VikingData, ride: RideDoc, savedAt: number): { id: string; doc: CycleDoc } | null`
  - `endOfDay(D: VikingData, date: string, savedAt: number): { id: string; doc: CycleDoc } | null`
  - `planAhead(D: VikingData, ctx: PlanCtx, days?: number): PlanDay[]` (default 7)

Rules (spec, Import → Cycle; Cycle settling; Plan record):
- **`gymTick`:** let `cur = bike(viking(D)).current().day`. If `cycleDay(cur).gym === sk`, tick `{date, day: cur, status:'done'}`, `realigned false`. Otherwise tick `day: dayOfSession(sk)`, `realigned true`. Ignore it (return the existing tick) if a tick with that id exists.
- **`rideTick`:** null when `ride.minutes < 20`, when a tick dated `ride.date` already exists, or when the current cycle day has a gym session or no ride codes. Otherwise tick the current day `done`.
- **`endOfDay(date)`:**
  - null when a tick dated `date` exists.
  - The current day is 8: `done`.
  - The current day has no gym, and `dayRides(...).optional` is true for the date's phase: `skip`.
  - Otherwise null (missed: the plan slides).
- **`planAhead`:** an empty list when `D.settings` is null. Otherwise, starting at `ctx.today` with `current().day`:
  - **Day 1** begins at today, unless a `workouts` doc or a tick is dated today, then it begins tomorrow.
  - Each later calendar day takes the next cycle day.
  - **Gym days** get `targets = nextTargets(v, sk, date, overrides)` and a strength DTO named `workoutName(SESS[sk].n, date)`, or `'<n> · deload'` in a deload week.
  - **Ride days** take the first code from `dayRides`, prescribed with `prescribe`. Then apply the spec's ride rules in order (deload; hard cap counting logged rides plus hard rides already planned in this list; Lower next day; `afterNight.has(date)`; on `date === today` only, `health`).
    - A swap turns the ride into `{code:'E1', from, minutes: min(60, …), reason}`.
    - Reasons: `'deload week'`, `'hard-ride cap (<n> in 8 days)'`, `'Lower <A|B> tomorrow'`, `'after a night shift'`, `'readiness: <what>'`.
    - The DTO name is `workoutName('<code> · <RIDES[code].n> <minutes> min', date)`.
  - **Optional-only days** (day 7 in phase 1) are `kind 'rest'` with no garmin.
  - **Day 8** is `kind 'rest'`.
  - Each `garmin.hash = hashOf(dto)`.

- [ ] **Step 1: Write the failing tests.** Use the helpers from Task 4's tests, with START `'2026-01-05'`.

```ts
it('planAhead: no settings → []', () => { expect(planAhead(emptyData(), ctx(day(0)))).toEqual([]); });
it('planAhead: starts at the current cycle day and walks one day per date', () => {
  const D = data({ workouts: { a: workout(day(0), 'UA', [{ ex: 'bench', sets: [{ kg: 80, reps: 5 }] }]) } });
  const p = planAhead(D, ctx(day(1)));
  expect(p.map((x) => x.cycleDay)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  expect(p[0]).toMatchObject({ kind: 'gym', session: 'LA' });
  expect(p[0].garmin!.name).toBe(`Viking Lower A (${fmtGarmin(day(1))})`);
});
it('endOfDay: a missed gym day slides the plan', () => {
  const D = data({ workouts: { a: workout(day(0), 'UA', []) } }); // current day 2 (Lower A)
  expect(endOfDay(D, day(1), 1)).toBeNull();
  expect(planAhead(D, ctx(day(2)))[0].session).toBe('LA');
});
it('endOfDay: rest day ticks done, phase-1 day 7 ticks skip', () => {
  const D8 = data({ cycle: { t: { date: day(0), day: 7, status: 'done', savedAt: 0 } } });
  expect(endOfDay(D8, day(1), 1)!.doc).toMatchObject({ day: 8, status: 'done' });
  const D7 = data({ cycle: { t: { date: day(0), day: 6, status: 'done', savedAt: 0 } } });
  expect(endOfDay(D7, day(1), 1)!.doc).toMatchObject({ day: 7, status: 'skip' });
});
it('gymTick: a different session realigns the cycle to what was done', () => {
  const D = data({ workouts: { a: workout(day(0), 'UA', []) } }); // expects LA
  expect(gymTick(D, day(1), 'UB', 1)).toMatchObject({ realigned: true, doc: { day: 4 } });
});
it('settle: late import after midnight ticks once, dated the training day', () => {
  const D = data({ workouts: { a: workout(day(0), 'UA', []) } });
  expect(endOfDay(D, day(1), 1)).toBeNull();          // 00:00: nothing logged yet
  const t = gymTick(D, day(1), 'LA', 2);              // 01:00: import of yesterday's LA
  expect(t.doc).toMatchObject({ date: day(1), day: 2, status: 'done' });
  const D2 = { ...D, cycle: { [t.id]: t.doc } };
  expect(planAhead(D2, ctx(day(2)))[0].cycleDay).toBe(3);
  expect(endOfDay(D2, day(1), 3)).toBeNull();         // idempotent
});
it('rides: deload, cap, night shift and readiness swap hard rides for E1 ≤ 60', () => {
  // cycle day 3 (hard ride) planned on day(2); test each reason separately
  // deload: start the plan in week 6 → reason 'deload week'
  // cap: one hard ride logged within 8 days in phase 1 → reason starts 'hard-ride cap'
  // afterNight: ctx.afterNight has the date → 'after a night shift'
  // health { hrvStatus: 'LOW' } on today → reason starts 'readiness'
  // each: expect(day.ride).toMatchObject({ code: 'E1', minutes: 60, from: 'H1' })
});
```
`ctx(today)` returns `{ today, afterNight: new Set(), overrides: {} }`. `fmtGarmin` is a local copy of the `Ddd D Mon` format. Write the four ride cases as four `it` blocks with real data, built the way the comments describe.
- [ ] **Step 2: Run** `npx vitest run tests/vikingPlanner.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `planner.ts`.
- [ ] **Step 4: Run** the tests, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(viking): cycle settling and 7-day planner`.

### Task 7: Calendar slots and reconcile

**Files:**
- Create: `supabase/functions/_shared/viking/calendarPlan.ts`
- Test: `tests/vikingCalendar.test.ts`

**Interfaces:**
- Consumes: `PlanDay` (Task 6); `CalEvent` (`_shared/scheduling.ts`); `zonedTime`, `Interval` (`_shared/lifeLogic.ts`).
- Produces:
  - `type Block = { date: string; title: string; start: string; end: string; overlaps: boolean }`
  - `blockMinutes(d: PlanDay): number`: gym 60, ride `minutes + 10`
  - `blockTitle(d: PlanDay): string`: `🏋️ Viking Lower A`, or `🚴 Viking E1 · Endurance 75 min`
  - `trainingSlot(date: string, window: string, minutes: number, tz: string, busy: Interval[]): { start: Date; end: Date; overlaps: boolean }`
  - `desiredBlocks(days: PlanDay[], windows: Record<string, string>, tz: string, busy: Interval[]): Block[]`: rest days give no block
  - `reconcile(desired: Block[], existing: CalEvent[]): { create: Block[]; update: Array<{ id: string; block: Block }>; remove: string[] }`

Rules:
- **Window parsing:** take the first `HH:MM–HH:MM` in `window`. Otherwise, use the first `HH:MM` as start with a 4 h window. With no clock at all, start 16:30 with a 3 h window.
- **Placement:** the earliest 15-min-aligned start where `[start, start+minutes)` fits inside the window and misses every `busy` interval. If none fits: the window start, with `overlaps: true`.
- **Reconcile** looks only at existing events whose description contains `[jarvis]` and `viking:<date>`. Match by date:
  - The title or the times differ → update.
  - No desired block for that date → remove.
  - A desired block with no event → create.

- [ ] **Step 1: Write the failing tests**

```ts
it('slot: first free time inside the window', () => {
  const busy = [{ start: zonedTime('2026-11-26', '06:00', TZ), end: zonedTime('2026-11-26', '07:10', TZ) }];
  const s = trainingSlot('2026-11-26', '06:00–11:00', 60, TZ, busy);
  expect(hhmm(s.start, TZ)).toBe('07:15'); expect(s.overlaps).toBe(false);
});
it('slot: text window falls back to 16:30', () => {
  expect(hhmm(trainingSlot('2026-11-26', 'Late afternoon after sleep, easy only', 60, TZ, []).start, TZ)).toBe('16:30');
});
it('slot: nothing free → window start, flagged', () => {
  const busy = [{ start: zonedTime('2026-11-26', '05:00', TZ), end: zonedTime('2026-11-26', '12:00', TZ) }];
  expect(trainingSlot('2026-11-26', '06:00–11:00', 60, TZ, busy)).toMatchObject({ overlaps: true });
});
it('reconcile: create, move, remove; never touches foreign events', () => {
  const ev = (id: string, date: string, start: string, desc: string): CalEvent => ({ id, title: '🏋️ Viking Lower A', start, end: start, allDay: false, description: desc });
  const r = reconcile([blk('2026-11-26', '07:00'), blk('2026-11-27', '07:00')], [
    ev('a', '2026-11-26', at('2026-11-26', '08:00'), '[jarvis] training · viking:2026-11-26'),
    ev('b', '2026-11-28', at('2026-11-28', '08:00'), '[jarvis] training · viking:2026-11-28'),
    ev('c', '2026-11-27', at('2026-11-27', '07:00'), 'my own gym note'),
  ]);
  expect(r.update.map((u) => u.id)).toEqual(['a']); expect(r.remove).toEqual(['b']);
  expect(r.create.map((c) => c.date)).toEqual(['2026-11-27']);
});
```
`blk` and `at` are small local helpers that build `Block`s and ISO times in `TZ = 'America/Aruba'`.
- [ ] **Step 2: Run** the test. Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(viking): training blocks for Google Calendar`.

### Task 8: Weekly summary and suggestions

**Files:**
- Create: `supabase/functions/_shared/viking/weekly.ts`
- Test: `tests/vikingWeekly.test.ts`

**Interfaces:**
- Consumes: `viking`, `best`, `VikingData` (logic.ts); `bike` (bikeLogic.ts); `EXBY` (data.ts); `resetKg` (Task 4).
- Produces:
  - `type Suggestion = { id: string; kind: 'reset'; ex: string; kg: number; status: 'pending' | 'ok' | 'no'; at: string; snoozeUntil?: number }`
  - `type WeeklySummary = { from: string; to: string; lifts: Array<{ ex: string; name: string; sessions: number; topKg: number; prevTopKg: number | null; bestE1rm: number; pr: boolean; stalled: boolean }>; sessions: { planned: number; done: number; slid: number }; rides: { z2: number; z2Target: number; hard: number; cap: number; minutes: number }; deloadNext: boolean; retestDue: boolean }`
  - `weekSummary(D: VikingData, today: string, slid: number): WeeklySummary`: the 7 days ending yesterday vs the 7 before. `planned` = gym days in those 7 cycle days; `done` = `workouts` docs dated in range. `slid` is passed in by the caller from `plan/state`.
  - `suggestionsFor(D: VikingData, existing: Suggestion[], today: string): Suggestion[]`: one pending `reset` per `plateau` exercise, with kg = `resetKg(last top, inc)`. Keep existing ones. Skip an exercise with a `no` whose `snoozeUntil` (its history length + 3) hasn't been reached. The id is `` `${ex}-${today}` ``.

- [ ] **Step 1: Write the failing tests**
  - `weekSummary: a PR on squat is flagged`: two LA sessions, the later one with a higher e1RM → `pr: true`.
  - `weekSummary: rides count Z2 and hard vs cap`: reuse `bike.test.ts`'s ride helpers.
  - `suggestionsFor: plateau → one reset at 90% rounded down`: 4 sessions with no improvement → `[{ kind: 'reset', ex: 'squat', kg: 95, status: 'pending' }]`.
  - `suggestionsFor: a declined reset waits 3 sessions`: with `{status:'no', snoozeUntil: 7}` and 5 sessions logged → no new pending.
- [ ] **Steps 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(viking): weekly summary and stall suggestions`.

### Task 9: life-bot Viking tick (settle, import, rebuild, recap)

**Files:**
- Create: `supabase/functions/life-bot/viking.ts`
- Create: `supabase/functions/_shared/viking/recap.ts` (pure copy)
- Modify: `supabase/functions/life-bot/tick.ts` (call it once per user after step 1)
- Test: `tests/vikingRecap.test.ts`

**Interfaces:**
- Consumes: Tasks 4–8, `DayPlan` (lifeLogic), `sendMessage`/`Keyboard` (telegram.ts), `Db` (agent.ts).
- Produces:
  - `recapText(r: ImportResult, next: Record<string, StrengthTarget>, realigned: boolean): string`. Telegram HTML:
    - a first line `🏋️ <b>Lower A saved</b> · Wed 25 Nov`
    - one `• ` line per assumption
    - one line `Next time: Squat 110→115 kg · Leg curl 54→55 kg`, listing only exercises whose kg went up, at most 4
    - `Cycle moved to match what you did.` when realigned
  - `suggestionKeyboard(s: Suggestion): Keyboard`: `[[{text:'✅ Reset', data:'vk:<id>:ok'},{text:'✖️ Keep pushing', data:'vk:<id>:no'}]]`
  - `vikingTick(db: Db, userId: string, chatId: number, tz: string, now: Date, plans: DayPlan[]): Promise<{ imported: number; rebuilt: boolean }>`
  - `loadViking(db: Db, userId: string): Promise<{ D: VikingData; plan: Record<string, unknown> }>`, exported for Task 10

`vikingTick` order:
1. **Load.** Read every `viking_docs` row for the user, paging by 1000 the way `vikingDb.fetchAll` does (`garmin_in` grows without bound). Fill `VikingData` from `COLLS`. Keep `plan/*` and `garmin_in/*` aside. With no `settings`, return early.
2. **Settle.** Read `plan/state.settledThrough`, initialised to yesterday on the first run. For each date after it up to yesterday, `endOfDay` and upsert the tick. Then store `settledThrough = yesterday`, plus `slid` (missed days counted in the last 7).
3. **Import.** For each `garmin_in` doc with no `processedAt`:
   - Call `importStrength` with `planned` = `plan/<date>.targets` when present.
   - On a result: upsert `workouts/<docId>`, then `gymTick` and upsert. Send `recapText`, plus `suggestionKeyboard` messages for new pending suggestions.
   - On null: if it's not a Viking session, send `Logged "<name>" on Garmin. Not a Viking session, so I left it out.` once; if the owner's doc already exists, send nothing.
   - In every case, set `processedAt` and `result`.
4. **Ride ticks.** For each `rides` doc dated in the last 3 days, apply `rideTick`.
5. **Rebuild** when something was imported or ticked, a suggestion changed, or `now` minute % 15 === 0.
   - Inputs: `afterNight` comes from `life_shifts` (confirmed, ending 00:00–08:00 local); `health` comes from `life_health` today; `overrides` comes from `ok` suggestions whose exercise has had no session since `at`.
   - Run `planAhead`, `suggestionsFor` and `weekSummary`.
   - Write `plan/current` only when `hashOf(days + suggestions)` differs from the stored hash.
   - Always write `plan/<today>` (today's PlanDay, targets included) and `plan/weekly`.
6. All upserts go through `db.from('viking_docs').upsert({...}, { onConflict: 'user_id,coll,doc_id' })`. Data is merged for `plan/state`.

- [ ] **Step 1: Write the failing tests** for `recapText`:
  - with the Task 5 fixture result and next targets squat 115 → contains `Lower A saved`, `Squat` / `110→115`, and `reps not recorded, assumed 5`
  - no "Next time" line when nothing went up
  - `realigned` adds the cycle line
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement** `recap.ts`, then `viking.ts`, and call `vikingTick` from `tickUser`, wrapped in try/catch with `console.error('life tick: viking failed', err)`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(life-bot): import Garmin lifts and keep the Viking plan`.

### Task 10: Calendar blocks, suggestion buttons, chat tools

**Files:**
- Modify: `supabase/functions/life-bot/viking.ts` (add `syncTrainingBlocks`)
- Modify: `supabase/functions/life-bot/index.ts` (`vk` callback)
- Modify: `supabase/functions/life-bot/agent.ts` (two tools)

**Interfaces:**
- Consumes: `desiredBlocks`, `reconcile`, `blockTitle` (Task 7); `bridge`, `gcalEnabled`, `liveEvents` (calendar.ts); `busyFromEvents` (scheduling.ts); `loadViking` (Task 9).
- Produces:
  - `syncTrainingBlocks(db: Db, userId: string, tz: string, days: PlanDay[], plans: DayPlan[]): Promise<void>`. It runs inside `vikingTick` after a rebuild that changed the hash, and every 15 min; it returns at once when `!gcalEnabled()`. Busy times come from the live events minus `viking:` events. Windows come from `plans[].trainWindow`. It creates through `bridge.create({title, start, end, allDay:false, description:'[jarvis] training · viking:<date>', remindersMin:[30]})`, updates through `bridge.update(id, {start, end, title})` and removes through `bridge.remove`.
  - Callback `vk:<id>:ok|no`. It sets the suggestion's status in `plan/current.suggestions` (`no` also sets `snoozeUntil`). `ok` settles the buttons to `✅ Next <exercise>: <kg> kg`, `no` to `✖️ Keeping the weight`. Then it forces a rebuild by clearing `plan/current.hash`.
  - Agent tool `viking_status` (no input): returns `plan/current.days`, the targets for the next gym day, the last `workouts` doc, and the last `garmin_in.result`.
  - Agent tool `viking_fix`, input `{ date: string; session: 'UA'|'LA'|'UB'|'LB'; exercise: string; set?: number; kg?: number; reps?: number }`. It patches `workouts/<date>_<session>`: one set (1-based) or every set of that exercise, adding the set when `set` = current length + 1. It then clears `plan/current.hash` and replies with the changed sets. It refuses unknown exercise keys, listing the session's keys and names.
- Tool descriptions: `viking_status` covers "what's my next session / what weight / what did you log". `viking_fix` covers corrections like "squat was 3×6" or "crunch was 20 kg".

- [ ] **Step 1:** Implement all three. They are glue over tested functions, so check them with `npm run typecheck`.
- [ ] **Step 2: Verify** with `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 3: Commit** `feat(life-bot): training calendar blocks, reset buttons, Viking chat tools`.

### Task 11: Habits with shift-aware reminders

**Files:**
- Modify: `supabase/functions/_shared/lifeLogic.ts` (`TASK_LISTS` + `'Habits'`, new `anchoredRemindAt`)
- Modify: `supabase/functions/life-bot/tick.ts` (anchor reminders; the wind-down nudge includes the evening shutdown)
- Modify: `supabase/functions/life-bot/tasks.ts` (`spawnNext` copies `remind_anchor`/`remind_offset_min` and leaves `remind_at` null for anchored tasks)
- Create: `supabase/scripts/04_habits_seed.sql`
- Test: `tests/life.test.ts` (add cases)

**Interfaces:**
- Produces:
  - `anchoredRemindAt(anchor: 'wake' | 'winddown', offsetMin: number, plan: DayPlan, prefs: LifePrefs): Date`: `wake` → `plan.wakeAt + offset`; `winddown` → `windDownAt(plan, prefs)`
  - Tick, every 15 min: for open tasks with `remind_anchor` not null, `reminded_at` null and `due_on <= today`, set `remind_at = anchoredRemindAt(...)` from that date's plan when it differs. This moves with shift changes.
  - Wind-down nudge: when an open `winddown`-anchored task is due today, the existing wind-down message gets `\n☑️ <title>` appended, with `[[{ text: '✅ Done', data: 'tk:<id>:d' }]]` as its keyboard. That task's `reminded_at` is set so the generic reminder doesn't fire.
- Seed script, idempotent with `where not exists` on `(user_id, title)`, for the owner from `life_profile`: the six rows from the spec's Habits table, `list 'Habits'`, `area 'personal'`, `due_on` = the next matching local date, `remind_anchor`/`remind_offset_min` per the table (wake 15; winddown 0; others null).

- [ ] **Step 1: Write the failing tests**
  - `anchoredRemindAt: wake + 15 follows the shift`: use `planDay` for a 05:00 morning shift and a day off; the expected times are `wakeAt + 15 min`.
  - `anchoredRemindAt: winddown equals windDownAt`
  - `TASK_LISTS includes Habits` and `listFor('habits') === 'Habits'`
- [ ] **Steps 2–4:** Run (FAIL), implement, run `npm test` (PASS).
- [ ] **Step 5: Commit** `feat(life): habit tasks with reminders that follow the shift`.

### Task 12: Routines and docs

**Files:**
- Modify: `life/routines/sync.md`
- Modify: `life/routines/weekly-review.md`
- Create: `life/routines/monthly-review.md`
- Modify: `README.md`, `docs/LIFE_ASSISTANT.md`

Changes:
- **sync.md step 7, "Lifting".** Replace the nudge. For every Garmin `strength_training` activity in the last 7 days that has no `garmin_in/<activityId>` doc:
  - Call `get_activity_exercise_sets`.
  - Upsert `viking_docs (coll 'garmin_in', doc_id '<activityId>')` with the `GarminIn` JSON (Task 5 interface): `name`, local `date`, and `sets` trimmed to `category`/`name` (from `exercises[0]`), `reps` (`repetitionCount`), `weightG` (`weight`), `type` (`setType`), `idx` (`wktStepIndex`), with `processedAt: null`. Use `on conflict do nothing`.
  - life-bot does the rest.
- **sync.md step 8.3.** The briefing's training line comes from `viking_docs plan/current`'s day for today: session or ride, any swap reason, and the targets for the top 3 exercises. Drop the readiness and cycle arithmetic (it's in code now). Keep the "say why" wording from the day's `reason`.
- **sync.md step 9.** Replace the whole step with "Mirror the plan to Garmin" (every run), following the spec's Garmin mirror section word for word: names, `[viking:<hash>]`, reuse/replace, schedule/unschedule, library and foreign workouts untouched, 14-day cleanup, record in `plan/garmin`, a stale plan is fine. Keep the 9.4 exercise-key list only as a reference note. The DTOs come ready-made.
- **weekly-review.md** becomes the Saturday training briefing:
  - It reads `plan/weekly`, `plan/current`, `life_health` (14 days), `life_shifts`/`life_day_plan`, `life_tasks` where `list = 'Habits'`, and Garmin training status/load.
  - One message, `kind 'weekly'`, ≤ 30 lines, sections in this order: Training, Recovery & readiness (vs shifts, one fix), Habits (done/expected per habit), Next week (the plan's next 7 days), then one closing line.
  - Then one message per pending suggestion, with buttons `[[{"text":"✅ Reset","data":"vk:<id>:ok"},{"text":"✖️ Keep pushing","data":"vk:<id>:no"}]]`.
  - Advice-only items (swap an exercise, kcal, missed-session pattern) go in the text without buttons.
  - Then set `prefs.lastWeeklyReview`.
- **monthly-review.md:** the old sections 4–6 (money, subscription audit, inbox) plus the week-ahead bills, run on the first Sunday of the month. It starts with "If today (local) isn't the first Sunday of the month, stop."
- **README / LIFE_ASSISTANT:**
  - The Viking section says the app is read-only and fed from Garmin.
  - Ascend is retired; its code and tables are kept.
  - Jarvis's Training row describes import, progression, the cycle and calendar blocks.
  - The Nudges row gets the Saturday briefing and monthly money.
  - The scheduled-tasks list becomes sync, weekly (Sat ~18:39), monthly (Sun).

- [ ] **Step 1:** Make the edits.
- [ ] **Step 2: Verify** with `grep -n "Tap Train in Viking" life/routines/sync.md` (no output), `grep -n "garmin_in" life/routines/sync.md` (≥ 1), and `grep -n "Viking week on the watch (Sundays)" life/routines/sync.md` (no output).
- [ ] **Step 3: Commit** `docs(life): routines for the Garmin-first plan, Saturday briefing, monthly money`.

### Task 13: Read-only Viking app, Ascend retired

**Files:**
- Modify: `src/App.tsx`, `src/features/viking/VikingApp.tsx`, `src/features/viking/viking.css` (the card only)
- Modify: `src/features/viking/vikingLogic.ts` is a shim; the coach change goes in `supabase/functions/_shared/viking/logic.ts`
- Test: `tests/viking.test.ts` (one case)

Changes:
- **`App.tsx`:**
  - `MainGate` renders `VikingApp` directly.
  - The `/ascend/*` route becomes `<Navigate to="/" replace />`.
  - Remove the `PortalChooser`, `AscendApp` and `setPortal` imports that are no longer used. Leave the `src/features/ascend/` and `src/features/portal/` files in place, unimported. Delete nothing.
- **`VikingApp.tsx`:**
  - Remove every write path: the setup card stays (first run only), plus `saveWeigh`, `saveCheckin`, `toggleSupp`, `adjust`, the `useLogger`/`TrainTab` logger UI, Body's `saveWeight`/`saveWaist` forms, Fuel's `toggle`/`saveExtras`, `RidesView`'s form, `CycleCard`'s done/skip/Undo, and every `ConfirmButton` delete.
  - Keep history lists, charts, `LiftChart`, ride summary, zones, benchmarks (including the retest entry), the Settings sheet, and the 'Switch to Ascend' button removed.
  - Add a "Next on your watch" card on Today. It reads `viking_docs plan/current` with a direct `supabase.from('viking_docs').select('data').eq('coll','plan').eq('doc_id','current').maybeSingle()` and shows today's or the next day's session/ride, the top 3 targets, and any swap reason. When there's no plan: "Jarvis hasn't built a plan yet."
- **`coach(T, opts?: { nags?: boolean })`:** with `nags: false`, it omits the 'Weigh in today' and 'Measure your waist' flags, and strips `adj`/`al` from every flag. Today calls it with `{ nags: false }`.

- [ ] **Step 1: Write the failing test:** `coach({nags:false}) drops input nags and kcal buttons`. With empty data, `viking(data()).coach(day(0), { nags: false })` has no flag titled `Weigh in today`, and none with `adj`.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement** the coach option and the UI changes.
- [ ] **Step 4: Run** `npm test && npm run build`. Expected: PASS. Then run the app (`npm run dev`). In a Playwright check at phone width (390 px), sign-in lands on Viking, no input fields are visible on Today/Train/Body/Fuel/Ride, and `/ascend` redirects to `/`. Take a screenshot for the user.
- [ ] **Step 5: Commit** `feat(viking): read-only dashboard fed by Garmin; retire Ascend`.

### Task 14: Rollout (each step needs the owner's go-ahead)

- [ ] **Step 1:** Push the branch and open a PR. After the owner merges it, the deploy workflow applies 0037 and deploys `life-bot`. Check `select jobname from cron.job`: `ascend-reminders` should be gone.
- [ ] **Step 2:** Run `supabase/scripts/04_habits_seed.sql` in the SQL editor. Check that six rows are in `life_tasks` with `list = 'Habits'`, and that the Habits list shows in Google Tasks within 5 minutes.
- [ ] **Step 3:** Update the scheduled-task prompts. Their inline copies don't read the repo files.
  - The sync trigger's prompt becomes the new `sync.md` (find its id with `list_triggers`).
  - `trig_01NpEtQTQpdD6FT6qV3r7PN8` gets the new `weekly-review.md` and cron `CRON_TZ=America/Aruba 39 18 * * 6`.
  - Create `Jarvis monthly review`: `CRON_TZ=America/Aruba 13 18 * * 0`, with the same connectors as the weekly one and the `monthly-review.md` prompt.
- [ ] **Step 4: First live check.** Run the sync once (fire the trigger), then confirm:
  - `garmin_in` docs for 24 Nov (Upper A) and 25 Nov (Lower A)
  - `workouts/2026-11-24_UA` and `workouts/2026-11-25_LA` saved
  - two recaps on Telegram
  - `plan/current` holds 7 days starting at cycle day 3
  - the next run puts dated `Viking …` workouts on the Garmin calendar, with no library workout scheduled
  - training blocks in Google Calendar
- [ ] **Step 5:** Report to the owner what ran, and anything that needs his check on the watch: target kg on the next Upper B, the farmer's carry step showing metres.
