# Garmin-first Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Train from the Garmin watch. Jarvis imports the sets, runs the Viking progression in tested code, keeps the watch and Google Calendar in step with a cycle that waits for the owner, sends a Saturday briefing, and retires Ascend for three habit tasks. Reset is not touched.

**Architecture:** The Viking and bike rules move to `supabase/functions/_shared/viking/`. Pure modules there turn raw Garmin sets into Viking docs, settle the 8-day cycle and build a plan record with ready-made Garmin workout JSON. `engine.ts` runs one tick against an injected `VikingStore`, tested with an in-memory store. life-bot supplies the Supabase/Telegram/bridge store behind a `prefs.vikingGarmin` switch. The Claude sync routine, the only part with Garmin access, copies raw activities in and the plan's workouts out.

**Tech Stack:** TypeScript (Vite/React app, Deno edge function), Vitest, Deno `check` in CI, Supabase Postgres, Telegram Bot API, the Google Apps Script bridge, Garmin via the routine's connector.

**Spec:** `docs/superpowers/specs/2026-11-25-garmin-first-training-design.md` (revision 2). Read it first; every rule below argues from it.

## Global Constraints

- Nothing under `src/features/reset/`, no `reset_*` table, and no `tests/reset*.test.ts` changes. `npm test` stays green, Reset included.
- `supabase/functions/_shared/**` uses explicit `.ts` imports and no Node, Deno or DOM APIs. Time is passed in.
- Exercise, session and ride keys are frozen. The `workouts` id stays `<YYYY-MM-DD>_<SessionKey>`. Tick ids are `<date>_auto_<day>`.
- Garmin: only names starting `Viking ` are touched.
  - The four library workouts (`Viking Upper A`, `Viking Upper B`, `Viking Lower A`, `Viking Lower B`) may be **unscheduled**, but are never edited or deleted.
  - Jarvis deletes only workouts recorded in `plan/garmin`.
- HR targets in bpm: Z1 90–114 · Z2 115–135 · Z3 136–150 · Z4 151–167 · Z5 168–186 (`workoutTargetTypeId` 4, never `zoneNumber`).
- Calendar: Jarvis's training events carry `[jarvis] training · viking:<date>`. Never touch other events.
- Everything new in life-bot runs only when `life_profile.prefs.vikingGarmin === true`. The import start date is `prefs.vikingGarminSince`.
- Two PRs: Tasks 1–12 are PR 1. It's inert until the switch is on; its only visible effect is an empty Google Tasks list. Task 13 is PR 2 (the app UI and Ascend's cron job), built and merged only after the Garmin flow has run well live.
- No `DELETE` in routine SQL. The routine only upserts and updates.
- Commits end with the session's attribution lines. Branch `ccr-f8c4ff87-7uj579`; never push `main`.

## Review Focus

1. **The watch didn't count reps** (normal: every set on 20 Nov, the squats on 25 Nov). The target must hold; it must never creep upward or bump the kg → Task 4 `targets: estimated reps hold the target`, and Task 9 `engine: four uncounted squat sessions never raise the kg`.
2. **A "kg not recorded" set (kg 0, `est`) must never become a 1–2 kg target** → Task 4 `targets: kg 0 / est kg is unknown, not a weight`.
3. **The import lands after midnight**, after the settle already ran → Task 6 `settle: late import after midnight`, and Task 9 `engine: stream order`.
4. **An activity from an old library workout or a deload copy**, with drifted exercises, 2-set groups and a trailing `UNKNOWN` set, maps every set correctly → Task 5's three real-data fixtures.
5. **The tick runs twice at once, sees the same activity twice, or fails halfway** (a Telegram 5xx, a write error) → Task 9 `engine: idempotent, one recap`, `a failed send never loses the import`, `a throw after the claim releases it`.

---

### Task 1: Share the Viking rules; type-check the edge function in CI

**Files:**
- Create: `supabase/functions/_shared/viking/{data,logic,bikePlan,bikeLogic}.ts` (moved with `git mv`, imports rewritten to `./x.ts`)
- Modify: `src/features/viking/{vikingData,vikingLogic,bikePlan,bikeLogic}.ts` → one-line shims `export * from '../../../supabase/functions/_shared/viking/<file>.ts';`
- Modify: `supabase/functions/_shared/viking/logic.ts`: `SetEntry` gains `est?: Array<'kg' | 'reps'>`; `WorkoutDoc` gains `source?: 'garmin'` and `garminIds?: string[]`
- Modify: `.github/workflows/ci.yml`: add a job using `denoland/setup-deno@v2` (deno 2.x) that runs `deno check supabase/functions/life-bot/index.ts`
- Test: `tests/vikingShared.test.ts`

**Interfaces:**
- Produces: every existing export, from both paths; the new optional fields.

- [ ] **Step 1: Write the failing test**

```ts
import * as shared from '../supabase/functions/_shared/viking/logic';
import * as app from '@/features/viking/vikingLogic';
it('app and Deno share one copy of the rules', () => { expect(app.viking).toBe(shared.viking); });
```
- [ ] **Step 2: Run** `npm ci && npx vitest run tests/vikingShared.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Move and shim.** Do the `git mv`, the import rewrites, the shims, the two type additions and the CI job.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build`. Expected: all pass. The CI job runs on push; if `deno check` fails on code that was already there, fix only the type errors it reports, then note them in the commit message.
- [ ] **Step 5: Commit** `refactor(viking): share the plan rules with the life-bot; deno check in CI`.

### Task 2: Migration 0037

**Files:**
- Create: `supabase/migrations/0037_viking_garmin.sql`

**Interfaces:**
- Produces:
  - `viking_docs.coll` also allows `'garmin_in'` and `'plan'`
  - `life_tasks.remind_anchor text check (remind_anchor in ('wake','winddown'))`
  - `life_tasks.remind_offset_min int not null default 0`
  - `life_tasks.remind_auto_at timestamptz`
  - `life_tasks.skipped_at timestamptz`
  - an index `viking_docs_garmin_in_open` on `(user_id) where coll = 'garmin_in' and (data->>'processedAt') is null`
  - The Ascend cron job is **not** touched here. It goes in PR 2 (Task 13).

- [ ] **Step 1: Write the migration.**
  - Re-create `viking_docs_coll_check` from 0029's list plus `'garmin_in','plan'`.
  - Add the columns with `add column if not exists`, and the index with `if not exists`.
  - Add a header comment documenting `garmin_in/<activityId>` and `plan/{current,state,garmin,weekly,<date>,decision-<id>}`.
- [ ] **Step 2: Verify** that `grep -c "garmin_in" supabase/migrations/0037_viking_garmin.sql` is ≥ 2, and that every statement is idempotent.
- [ ] **Step 3: Commit** `feat(viking): migration for Garmin import, plan docs and habit reminders`.

### Task 3: Garmin exercise map and workout builders

**Files:**
- Create: `supabase/functions/_shared/viking/garmin.ts`
- Test: `tests/vikingGarmin.test.ts`

**Interfaces:**
- Consumes: `SESS`, `ORDER`, `Exercise`, `SessionKey`, `PhaseKey` (data.ts); `Rx` (bikeLogic.ts).
- Produces:
  - `type GarminEx = { category: string; exerciseName?: string }`
  - `const GARMIN_EX: Record<string, GarminEx | null>`
  - `type StrengthTarget = { kg: number | null; assistKg?: number | null; reps: number; sets: number; note: string }`
  - `type GarminDto = Record<string, unknown>`
  - `restSeconds(rest: string): number`
  - `buildStrengthWorkout(sk: SessionKey, t: Record<string, StrengthTarget>, name: string, description: string): GarminDto`
  - `buildRideWorkout(rx: Rx, week: number, phase: PhaseKey, name: string, description: string): GarminDto`
  - `dtoMinutes(dto: GarminDto): number`: the total time of time-ended steps × iterations, rounded up. It's 0 for strength.
  - `garminDate(date: string): string`: `'Wed 25 Nov'`
  - `workoutName(label: string, date: string): string`: `` `Viking ${label} (${garminDate(date)})` ``
  - `hashOf(x: unknown): string`: an 8-hex FNV-1a of key-sorted JSON
  - `withMarker(dto: GarminDto): { dto: GarminDto; hash: string }`: hash = `hashOf({ ...dto, description: null })`, then `description += ' [viking:<hash>]'`

`GARMIN_EX` values:
- **Upper A:** `bench` BENCH_PRESS/BARBELL_BENCH_PRESS · `csrow` ROW · `dbsp` SHOULDER_PRESS/SEATED_DUMBBELL_SHOULDER_PRESS · `pulldown` PULL_UP/LAT_PULLDOWN · `incdb` BENCH_PRESS/INCLINE_DUMBBELL_BENCH_PRESS · `clat` LATERAL_RAISE/ONE_ARM_CABLE_LATERAL_RAISE · `ezcurl` CURL/STANDING_EZ_BAR_BICEPS_CURL · `pushdown` TRICEPS_EXTENSION/TRICEPS_PRESSDOWN
- **Lower A:** `squat` SQUAT/BARBELL_BACK_SQUAT · `rdl` DEADLIFT/ROMANIAN_DEADLIFT · `legpress` SQUAT/LEG_PRESS · `lycurl` LEG_CURL/LEG_CURL · `stcalf` CALF_RAISE/STANDING_CALF_RAISE · `crunch` CRUNCH/CABLE_CRUNCH · `farmer` CARRY/FARMERS_CARRY
- **Upper B:** `incbb` BENCH_PRESS/INCLINE_BARBELL_BENCH_PRESS · `pullup` PULL_UP/PULL_UP · `mpress` SHOULDER_PRESS · `scrow` ROW/SEATED_CABLE_ROW · `pecdeck` FLYE/CABLE_CROSSOVER · `dblat` LATERAL_RAISE/DUMBBELL_LATERAL_RAISE · `revpec` null · `incurl` CURL/INCLINE_DUMBBELL_BICEPS_CURL · `ohext` TRICEPS_EXTENSION/CABLE_OVERHEAD_TRICEPS_EXTENSION · `shrug` SHRUG/DUMBBELL_SHRUG
- **Lower B:** `trapdl` DEADLIFT/TRAP_BAR_DEADLIFT · `bss` LUNGE/DUMBBELL_BULGARIAN_SPLIT_SQUAT · `legext` null · `securl` LEG_CURL/LEG_CURL · `secalf` CALF_RAISE/SEATED_CALF_RAISE · `hkr` LEG_RAISE/HANGING_KNEE_RAISE · `abwheel` CORE/KNEELING_AB_WHEEL

**Strength DTO.** The shape follows the owner's library workout:
- `sportType {sportTypeId:5, sportTypeKey:'strength_training'}`, one segment.
- One `RepeatGroupDTO` per exercise in `SESS[sk].ex` order. All exercises are included, even at 1 set. Each group has:
  - `numberOfIterations = sets`
  - `endCondition {conditionTypeId:7, conditionTypeKey:'iterations'}`
  - `endConditionValue = sets`
  - `smartRepeat:false`
- Its children are exactly [exercise step, rest step]:
  - The exercise step is an `ExecutableStepDTO` with `stepType {3,'interval'}`. Its `description` is `ex.n`, plus `· assist <|assistKg|> kg` (`Math.abs`) when `assistKg` < 0, plus `· <note>` when there is one. Its end condition is reps `{10,'reps'}` with value `reps`. For `ex.u === 'm'`, it's `{1,'lap.button'}` instead, with `<reps> m` added to the description.
  - `category`/`exerciseName` come from `GARMIN_EX`, or are null.
  - `weightValue = kg` plus `weightUnit {unitId:8, unitKey:'kilogram', factor:1000}` only when `kg > 0`; otherwise both null.
  - The rest step has `stepType {5,'rest'}` and `endCondition {2,'time'}`, with value `restSeconds(ex.rest)`.
- `stepOrder` counts up: group 1, exercise 2, rest 3, group 4, …

**Rides.** Follow sync.md 9.4: `sportTypeId:2 'cycling'`, time end conditions, bpm targets.
- E1: `rx.min[0]` min, in Z2, or 90–135 when `rx.zones` includes Z1
- R1: 30 min Z1
- H1: 15 min Z2 warm-up; then N × (3 min Z4 + 210 s at 90–135), with N = `min(6, 4 + floor((week−1)/2))` in phase 1, otherwise 5 × (4 min Z4 + 210 s); then 10 min Z2
- H2: 10 min Z2, 45 min with no target, 5 min Z1
- H3: 15 min Z2, 10 × (30 s Z5 + 150 s Z1), 5 min Z1
- L1: 120 min Z2

`restSeconds` values:

| Input | Seconds |
|---|---|
| `'2–3 min'` | 150 (midpoint) |
| `'2 min'` | 120 |
| `'90 s'` | 90 |
| `'60 s'` | 60 |
| `'60 s after pair'` | 60 |
| `'superset'` | 15 |

- [ ] **Step 1: Write the failing tests**

```ts
it('maps every plan exercise', () => { for (const sk of ORDER) for (const e of SESS[sk].ex) expect(e.k in GARMIN_EX).toBe(true); });
it('restSeconds', () => {
  expect(restSeconds('2–3 min')).toBe(150); expect(restSeconds('90 s')).toBe(90);
  expect(restSeconds('superset')).toBe(15); expect(restSeconds('60 s after pair')).toBe(60);
});
it('strength DTO: one [exercise, rest] group per exercise', () => {
  const t = Object.fromEntries(SESS.LA.ex.map((e) => [e.k, { kg: e.k === 'squat' ? 112.5 : null, reps: e.r[0], sets: e.s, note: '' }]));
  const groups = (buildStrengthWorkout('LA', t, 'Viking Lower A (Wed 25 Nov)', 'x') as any).workoutSegments[0].workoutSteps;
  expect(groups).toHaveLength(7);
  expect(groups[0].numberOfIterations).toBe(3);
  expect(groups[0].workoutSteps[0]).toMatchObject({ category: 'SQUAT', exerciseName: 'BARBELL_BACK_SQUAT', weightValue: 112.5, endConditionValue: 5 });
  expect(groups[1].workoutSteps[0].weightValue).toBeNull();
  expect(groups[6].workoutSteps[0].endCondition.conditionTypeKey).toBe('lap.button');
  expect(groups.map((g: any) => g.stepOrder)).toEqual([1, 4, 7, 10, 13, 16, 19]);
});
it('strength DTO: assisted pull-up has no weight, assist in the description', () => {
  const t = Object.fromEntries(SESS.UB.ex.map((e) => [e.k, { kg: null, assistKg: e.k === 'pullup' ? -20 : null, reps: 6, sets: 3, note: '' }]));
  const step = (buildStrengthWorkout('UB', t, 'n', 'd') as any).workoutSegments[0].workoutSteps[1].workoutSteps[0];
  expect(step.weightValue).toBeNull(); expect(step.description).toContain('assist 20 kg');
});
it('ride DTO: E1 75 min is one Z2 step in bpm', () => {
  const s = (buildRideWorkout({ code: 'E1', min: [75, 75], zones: ['Z2'], detail: '' }, 7, '1', 'n', 'd') as any).workoutSegments[0].workoutSteps;
  expect(s).toHaveLength(1);
  expect(s[0]).toMatchObject({ endConditionValue: 4500, targetValueOne: 115, targetValueTwo: 135 });
});
it('H1 in phase 1 week 7: 6 climbs, 64 min', () => {
  const dto = buildRideWorkout({ code: 'H1', min: [50, 60], zones: ['Z2', 'Z4'], detail: '' }, 7, '1', 'n', 'd');
  expect((dto as any).workoutSegments[0].workoutSteps[1].numberOfIterations).toBe(6);
  expect(dtoMinutes(dto)).toBe(64); // 15 + 6 × 6.5 + 10
});
it('names, hash and marker', () => {
  expect(workoutName('Lower A', '2026-11-25')).toBe('Viking Lower A (Wed 25 Nov)');
  expect(hashOf({ a: 1, b: [2] })).toBe(hashOf({ b: [2], a: 1 }));
  const a = withMarker({ description: 'x', k: 1 }), b = withMarker({ description: 'y', k: 1 });
  expect(a.hash).toBe(b.hash); expect(a.dto.description).toBe(`x [viking:${a.hash}]`);
});
```
- [ ] **Step 2: Run** `npx vitest run tests/vikingGarmin.test.ts`. Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(viking): Garmin exercise map and workout builders`.

### Task 4: Progression targets

**Files:**
- Create: `supabase/functions/_shared/viking/targets.ts`
- Test: `tests/vikingTargets.test.ts`

**Interfaces:**
- Consumes: `viking`/`Viking`, `SetEntry`, `score` (logic.ts); `SESS`, `STEP`, `IncKey`, `Exercise` (data.ts); `StrengthTarget` (Task 3).
- Produces:
  - `type Overrides = { kg?: Record<string, number> }`
  - `type Resets = Record<string, string>`: exercise → ISO timestamp
  - `type Progress = StrengthTarget & { stalled: boolean; lastTop: number | null; repsUnknown: boolean }`
  - `type Hist = Array<{ date: string; startedAt?: string; planned?: number; sets: SetEntry[] }>`
    - `planned` is the set count planned for that session. `nextTargets` fills it from `setCount(ex, doc.session, doc.phase, doc.deload)`.
    - `startedAt` comes from the doc, falling back to `new Date(savedAt).toISOString()`.
  - `progressFor(ex: Exercise, hist: Hist, resetAt: string | undefined, sets: number, override?: number): Progress`
  - `nextTargets(v: Viking, sk: SessionKey, date: string, ov: Overrides, resets: Resets): Record<string, Progress>`
  - `resetKg(top: number, inc: IncKey): number`: `floor(0.9 × top / STEP[inc]) × STEP[inc]`, with 0.5 as the step when `STEP` is 0
  - `const WEIGHTED: IncKey[] = ['bbU', 'bbL', 'mU', 'mL', 'db', 'iso']`

Apply the spec's Progression section exactly.
- A set's kg is "real" when it's > 0 (for `pull`, < 0) and `!est?.includes('kg')`. Its reps are real when `!est?.includes('reps')`.
- `hist` is filtered to sessions whose `startedAt` is after `resetAt`. A session with neither `startedAt` nor `savedAt` counts as `<date>T23:59:00Z`.
- `hit` needs `sets.length ≥ (planned ?? sets.length)`.
- The reps target is clamped to `[r[0], r[1]]`.
- `nextTargets` builds its own `Hist` from `v.sorted('workouts')`, because `v.H` drops the metadata.

- [ ] **Step 1: Write the failing tests.** Copy the `data()`/`workout()`/`day()` helpers from `tests/viking.test.ts`.

```ts
const S = (kg: number, reps: number, est?: SetEntry['est']) => ({ kg, reps, ...(est ? { est } : {}) });
const sq = EXBY.squat, cr = EXBY.crunch;
it('targets: hit the top on every set → +1 step, reps to the bottom', () => {
  expect(progressFor(sq, [{ date: day(0), sets: [S(110, 8), S(110, 8), S(110, 8)] }], undefined, 3)).toMatchObject({ kg: 115, reps: 5 });
});
it('targets: not there → same kg, lowest recorded reps + 1 (kept within the range)', () => {
  expect(progressFor(sq, [{ date: day(0), sets: [S(110, 6), S(110, 5)] }], undefined, 3)).toMatchObject({ kg: 110, reps: 6 });
  expect(progressFor(EXBY.rdl, [{ date: day(0), sets: [S(120, 5), S(110, 10)] }], undefined, 3)).toMatchObject({ kg: 120, reps: 8 });
});
it('targets: fewer sets than planned never bumps', () => {
  expect(progressFor(sq, [{ date: day(0), planned: 3, sets: [S(110, 8)] }], undefined, 3)).toMatchObject({ kg: 110, reps: 8 });
});
it('targets: estimated reps hold the target', () => {
  const h = [{ date: day(0), sets: [S(110, 5, ['reps']), S(110, 5, ['reps']), S(110, 5, ['reps'])] }];
  expect(progressFor(sq, h, undefined, 3)).toMatchObject({ kg: 110, reps: 5, repsUnknown: true });
  const h8 = [{ date: day(0), sets: [S(110, 8, ['reps']), S(110, 8, ['reps']), S(110, 8, ['reps'])] }];
  expect(progressFor(sq, h8, undefined, 3).kg).toBe(110); // assumed 8s never bump
});
it('targets: kg 0 / est kg is unknown, not a weight', () => {
  expect(progressFor(cr, [{ date: day(0), sets: [S(0, 15, ['kg'])] }], undefined, 3)).toMatchObject({ kg: null, reps: 10 });
  expect(progressFor(cr, [{ date: day(0), sets: [S(0, 15)] }], undefined, 3).kg).toBeNull();
  expect(progressFor(cr, [{ date: day(0), sets: [S(20, 12)] }, { date: day(8), sets: [S(0, 15, ['kg'])] }], undefined, 3).kg).toBe(20);
});
it('targets: bodyweight climbs reps, never kg; assisted keeps the assist off the watch', () => {
  expect(progressFor(EXBY.hkr, [{ date: day(0), sets: [S(82, 12)] }], undefined, 3)).toMatchObject({ kg: null, reps: 13 });
  const pu = progressFor(EXBY.pullup, [{ date: day(0), sets: [S(-20, 10), S(-20, 10), S(-20, 10)] }], undefined, 3);
  expect(pu).toMatchObject({ kg: null, assistKg: -17.5, reps: 6 });
});
it('targets: reset override, then the stall baseline restarts', () => {
  expect(resetKg(110, 'bbL')).toBe(95);
  const at = (d: number) => `${day(d)}T10:00:00Z`;
  const old = [0, 8, 16, 24].map((d) => ({ date: day(d), startedAt: at(d), sets: [S(110, 5)] }));
  expect(progressFor(sq, old, undefined, 3).stalled).toBe(true);
  expect(progressFor(sq, old, undefined, 3, 95).kg).toBe(95);
  const after = [...old, ...[32, 40, 48, 56, 64].map((d) => ({ date: day(d), startedAt: at(d), sets: [S(95, 8), S(95, 8), S(95, 8)] }))];
  const p = progressFor(sq, after, at(30), 3);
  expect(p).toMatchObject({ stalled: false, kg: 100 });
});
it('targets: bounded', () => {
  for (const sk of ORDER) for (const e of SESS[sk].ex) for (const kg of [0, 1, 50]) {
    const p = progressFor(e, [{ date: day(0), sets: [S(kg, e.r[1])] }], undefined, 3);
    if (p.kg !== null) { expect(p.kg).toBeGreaterThan(0); expect(p.kg).toBeLessThanOrEqual(kg + STEP[e.inc]); }
    if (e.inc === 'bw' || e.inc === 'pull') expect(p.kg).toBeNull();
  }
});
it('nextTargets: deload halves sets (rounded up), same kg', () => {
  const v = viking(data({ workouts: { a: workout(day(0), 'LA', [{ ex: 'squat', sets: [S(110, 5)] }]) } }));
  expect(nextTargets(v, 'LA', day(35), {}, {}).squat).toMatchObject({ sets: 2, kg: 110 });
});
```
In the reset test, the reset sits at day 30. The five "after" sessions (days 32–64) are the only ones counted, so the stall check restarts and a hit at 95 × 8 bumps to 100.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS).
- [ ] **Step 5: Commit** `feat(viking): progression targets that never move on assumed data`.

### Task 5: Import a Garmin strength activity

**Files:**
- Create: `supabase/functions/_shared/viking/garminImport.ts`
- Create: `tests/fixtures/garmin-2026-11-25-lower-a.json`, `garmin-2026-11-20-upper-b-deload.json`, `garmin-2026-11-24-upper-a.json`
- Test: `tests/vikingImport.test.ts`

**Interfaces:**
- Consumes: `GARMIN_EX`, `StrengthTarget` (Task 3); `SESS`, `EXBY` (data.ts); `WorkoutDoc`, `VikingData` (logic.ts); `viking().setCount`.
- Produces:
  - `type GarminSet = { category: string | null; name: string | null; reps: number | null; weightG: number | null; type: string; idx: number | null }`
  - `type GarminIn = { activityId: string; name: string; date: string; start: string; startUtc: string; sets: GarminSet[]; processedAt?: string | null; result?: string }`. `start` is the local start `YYYY-MM-DDTHH:MM`; `startUtc` is the ISO UTC start from Garmin's GMT time. A new doc gets `startedAt = startUtc`; a merge keeps the earlier one.
  - `sessionOf(a: GarminIn): SessionKey | null`
  - `type ImportResult = { session: SessionKey; docId: string; doc: WorkoutDoc; assumptions: string[]; dropped: number; merged: boolean }`
  - `importStrength(a: GarminIn, D: VikingData, planned: Record<string, StrengthTarget> | null, savedAt: number): ImportResult | { skip: 'not-viking' | 'owner-doc' | 'already' }`. It computes the week, phase and deload itself through `viking(D)`.
  - `shortName(k: string): string`: `EXBY[k].n` cut at `' / '` and `' ('` (`'Back squat'`, `'Lying leg curl'`, `'Pull-up'`)

Rules: the spec's Import section, word for word (session, set → exercise, values, doc).
- Non-`ACTIVE` sets (REST, warm-up and any other type) are ignored and not counted.
- `ACTIVE` sets whose category is null or `UNKNOWN`, or that match no exercise, are dropped and counted in `dropped`.
- A planned exercise with no recorded sets gets no entry, and the note `'<Short>: not recorded'`.
- Copy: `'<Short>: reps not recorded, assumed <n>'`, `'<Short>: kg not recorded'`, `'<Short>: <n> of <planned> sets'`, `'<n> unrecognised set(s) left out'`.

**Fixtures.**
- `garmin-2026-11-25-lower-a.json`: the table below, plus REST sets (`type 'REST'`, other fields null) between them. `activityId '25193624779'`, `name 'Viking Lower A'`, `date '2026-11-25'`, `start '2026-11-25T06:11'`.
- The other two: **fetch them first, before writing any expectation.** Use the Garmin connector's `get_activity_exercise_sets` in this session:
  - `25139907539`: 20 Nov, name `'Viking Upper B · deload (Fri 20'`, start `2026-11-20T07:00`, startUtc `2026-11-20T11:00:59Z`
  - `25182355443`: 24 Nov, name `'Viking Upper A'`, start `2026-11-24T06:14`, startUtc `2026-11-24T10:14:52Z`

  Trim each set to the `GarminSet` fields: category and name come from `exercises[0]`, `type` from `setType`, `idx` from `wktStepIndex`. The LA fixture's startUtc is `2026-11-25T10:11:12Z`. Commit them.

| idx | category / name | reps | weightG |
|---|---|---|---|
| 0 ×3 | SQUAT / BARBELL_BACK_SQUAT | null | 110000 |
| 3 | DEADLIFT / ROMANIAN_DEADLIFT | 5 | 120000 |
| 3 | DEADLIFT / ROMANIAN_DEADLIFT | 10 | 110000 |
| 6 ×2 | SQUAT / LEG_PRESS | 10 | 120000 |
| 9 ×3 | LEG_CURL / LEG_CURL | 12 | 54000 |
| 12 ×3 | CALF_RAISE / STANDING_CALF_RAISE | 15 | 82000 |
| 15 | CRUNCH / CRUNCH | 15 | 82000 |

- [ ] **Step 1: Write the failing tests**

```ts
const load = (f: string) => JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8')) as GarminIn;
const la = load('garmin-2026-11-25-lower-a.json'), ub = load('garmin-2026-11-20-upper-b-deload.json'), ua = load('garmin-2026-11-24-upper-a.json');
const D0 = () => ({ ...emptyData(), settings: { startDate: '2026-10-10', startWeight: 102, phaseMode: 'auto', kcalAdjust: 0 } }) as VikingData;
it('import: 25 Nov Lower A (old library workout) maps every set', () => {
  const r = importStrength(la, D0(), null, 1) as ImportResult;
  expect(r).toMatchObject({ session: 'LA', docId: '2026-11-25_LA', dropped: 0, merged: false });
  const by = Object.fromEntries(r.doc.entries.map((e) => [e.ex, e.sets]));
  expect(by.squat).toEqual([0, 1, 2].map(() => ({ kg: 110, reps: 5, est: ['reps'] })));
  expect(by.rdl).toEqual([{ kg: 120, reps: 5 }, { kg: 110, reps: 10 }]);
  expect(by.crunch).toEqual([{ kg: 0, reps: 15, est: ['kg'] }]);
  expect(r.assumptions).toEqual(expect.arrayContaining([
    'Back squat: reps not recorded, assumed 5', 'Romanian deadlift: 2 of 3 sets', 'Cable crunch: kg not recorded',
  ]));
  expect(r.doc).toMatchObject({ source: 'garmin', garminIds: ['25193624779'], week: 7, deload: false });
});
it('import: 20 Nov deload drops the trailing UNKNOWN set and keeps the pull-up assist-free', () => {
  const r = importStrength(ub, D0(), null, 1) as ImportResult;
  expect(r.session).toBe('UB'); expect(r.dropped).toBe(1);
  expect(r.doc.entries.map((e) => e.ex)).toEqual(['incbb', 'pullup', 'mpress']);
  expect(r.doc.entries[1].sets[0]).toEqual({ kg: 0, reps: 6, est: ['reps'] }); // weight null is recorded, reps assumed
  expect(r.doc.deload).toBe(true);
  expect(r.doc.startedAt).toBe('2026-11-20T11:00:59Z');
});
it('import: 24 Nov Upper A (drifted library) maps every recognised set', () => {
  const r = importStrength(ua, D0(), null, 1) as ImportResult;
  const unknown = ua.sets.filter((s) => s.type === 'ACTIVE' && (!s.category || s.category === 'UNKNOWN')).length;
  expect(r.session).toBe('UA'); expect(r.dropped).toBe(unknown); // UA has no null-category exercises
  for (const e of r.doc.entries) expect(SESS.UA.ex.map((x) => x.k)).toContain(e.ex);
});
it('import: an UNKNOWN set at a null-category exercise index maps to it (leg extension)', () => {
  const lb: GarminIn = { activityId: 'x', name: 'Viking Lower B', date: '2026-11-26', start: '2026-11-26T06:00', startUtc: '2026-11-26T10:00:00Z',
    sets: [{ category: 'UNKNOWN', name: null, reps: 15, weightG: 56000, type: 'ACTIVE', idx: 6 }] }; // legext is LB's 3rd exercise
  const r = importStrength(lb, D0(), { legext: { kg: 56, reps: 12, sets: 2, note: '' } }, 1) as ImportResult;
  expect(r.doc.entries).toEqual([{ ex: 'legext', sets: [{ kg: 56, reps: 15 }] }]); expect(r.dropped).toBe(0);
});
it('import: planned reps fill gaps when a snapshot exists', () => {
  const r = importStrength(la, D0(), { squat: { kg: 110, reps: 6, sets: 3, note: '' } }, 1) as ImportResult;
  expect(r.doc.entries[0].sets[0]).toEqual({ kg: 110, reps: 6, est: ['reps'] });
});
it('import: idempotent and owner wins', () => {
  const r = importStrength(la, D0(), null, 1) as ImportResult;
  expect(importStrength(la, { ...D0(), workouts: { [r.docId]: r.doc } }, null, 2)).toEqual({ skip: 'already' });
  const typed = { ...r.doc, source: undefined, garminIds: undefined };
  expect(importStrength(la, { ...D0(), workouts: { [r.docId]: typed } }, null, 2)).toEqual({ skip: 'owner-doc' });
});
it('import: a second activity for the same session merges', () => {
  const first = importStrength(la, D0(), null, 1) as ImportResult;
  const r = importStrength({ ...la, activityId: '9', sets: la.sets.slice(0, 2) }, { ...D0(), workouts: { [first.docId]: first.doc } }, null, 2) as ImportResult;
  expect(r.merged).toBe(true); expect(r.doc.garminIds).toEqual(['25193624779', '9']);
  expect(r.doc.entries[0].sets).toHaveLength(4);
});
it('sessionOf: truncated names, voting, ties', () => {
  expect(sessionOf({ ...ub, name: 'Viking Upper B · deload (Fri 20' })).toBe('UB');
  expect(sessionOf({ ...la, name: 'Strength' })).toBe('LA');
  expect(sessionOf({ ...la, name: 'Strength', sets: la.sets.slice(0, 1) })).toBeNull();
});
```
Adjust `la.sets.slice(0, 2)` so it holds one squat ACTIVE set and one REST set: 3 + 1 = 4 squat sets after the merge. The 20 Nov pull-up's reps are assumed at `r[0] = 6`: no snapshot, and the reps target from no history is the bottom of the range.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS).
- [ ] **Step 5: Commit** `feat(viking): import strength sets from Garmin`.

### Task 6: Cycle settling and the 7-day planner

**Files:**
- Create: `supabase/functions/_shared/viking/planner.ts`
- Test: `tests/vikingPlanner.test.ts`

**Interfaces:**
- Consumes: `viking`, `CycleDoc`, `RideDoc`, `VikingData`, `dn`, `iso` (logic.ts); `SESS`, `SessionKey`, `PhaseKey` (data.ts); `bike`, `cycleDay`, `nextDay`, `dayOfSession`, `dayRides`, `prescribe`, `isHard`, `Rx` (bikeLogic.ts); `RIDES`, `RideCode`, `BIKE_PHASES`, `HARD_WINDOW_DAYS` (bikePlan.ts); `nextTargets`, `Overrides`, `Resets`, `Progress` (Task 4); `buildStrengthWorkout`, `buildRideWorkout`, `withMarker`, `workoutName`, `hashOf`, `GarminDto` (Task 3).
- Produces:
  - `type Health = { hrvStatus?: string; readiness?: number; sleepH?: number; bodyBattery?: number; sleepStress?: number }`
  - `type PlanCtx = { today: string; afterNight: Set<string>; windows?: Record<string, string>; health?: Health; overrides: Overrides; resets: Resets; frozen?: { date: string; day: PlanDay } }`. `afterNight` is the set of local dates on which a confirmed shift **ends** between 00:00 and 08:00 local. `windows` maps a date to its `train_window`.
  - `type PlanDay` and `type PlanCurrent`, exactly as the spec's Plan section. `targets` is `Record<string, Progress>`.
  - `tickId(date: string, day: number): string`
  - `gymTick(D: VikingData, date: string, sk: SessionKey, savedAt: number): { id: string; doc: CycleDoc; realigned: boolean } | null`: null when a tick with that id exists
  - `rideTick(D: VikingData, date: string, savedAt: number): { id: string; doc: CycleDoc } | null`: uses every ride dated `date`
  - `endOfDay(D: VikingData, date: string, savedAt: number): { id: string; doc: CycleDoc } | 'slid' | null`: null means a tick already exists for that date
  - `planAhead(D: VikingData, ctx: PlanCtx, days?: number): PlanDay[]` (default 7)

Rules: the spec's Import → Cycle, Cycle settling and The plan sections.
- **`rideTick`:** null unless:
  - the summed `minutes` on `date` is ≥ 20
  - no tick is dated `date`
  - `date` ≥ the latest tick's date
  - the current cycle day has no gym and a non-empty `dayRides(...).codes`
- **`planAhead`:**
  - It returns `[]` without settings.
  - Day 1 is `ctx.frozen.day` unchanged, and the rest continue from its cycle day, only when **all** of these hold:
    - `ctx.frozen?.date === ctx.today`
    - today has no workout and no tick
    - `ctx.frozen.day.cycleDay === bike(viking(D)).current().day`

    Otherwise the freeze is ignored.
  - The description is the spec's Descriptions line, built before `withMarker`.
  - **The H1/H3 window is inclusive** (`dn(r.date) ≥ dn(date) − 8`). The cap uses `hardIn` unchanged (exclusive). Hard rides already planned earlier in the list count for both.

- [ ] **Step 1: Write the failing tests.** Use START `'2026-01-05'` and the `data()`/`workout()`/`day()` helpers; `ctx(t)` = `{ today: t, afterNight: new Set(), overrides: {}, resets: {} }`.

```ts
it('planAhead: no settings → []', () => { expect(planAhead(emptyData(), ctx(day(0)))).toEqual([]); });
it('planAhead: starts at the current cycle day, one per date', () => {
  const D = data({ workouts: { a: workout(day(0), 'UA', []) } });
  const p = planAhead(D, ctx(day(1)));
  expect(p.map((x) => x.cycleDay)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  expect(p[0]).toMatchObject({ kind: 'gym', session: 'LA' });
  expect(p[0].garmin!.name).toBe(`Viking Lower A (${garminDate(day(1))})`);
  expect(p[1]).toMatchObject({ kind: 'ride', ride: { code: 'H1' } });
  expect(p[5].kind).toBe('rest'); // day 7, phase 1: optional R1 only
});
it('planAhead: day 3 is H2 when an H1 was ridden in the last 8 days', () => {
  // phase 2 (cap 2), so the earlier H1 doesn't also trip the phase-1 cap of 1
  const D = data({ settings: { startDate: START, startWeight: 102, phaseMode: '2', kcalAdjust: 0 }, workouts: { a: workout(day(0), 'UA', []) }, rides: { r: { date: day(-3), type: 'hard', minutes: 50, code: 'H1' } } });
  expect(planAhead(D, ctx(day(1)))[1].ride!.code).toBe('H2');
});
it('planAhead: an H1 exactly 8 days back makes day 3 an H2, uncapped, even in phase 1', () => {
  // day(2) is the hard-ride day; the earlier H1 sits on day(2 − 8) = day(−6)
  const D = data({ workouts: { a: workout(day(0), 'UA', []) }, rides: { r: { date: day(-6), type: 'hard', minutes: 50, code: 'H1' } } });
  expect(planAhead(D, ctx(day(1)))[1].ride).toMatchObject({ code: 'H2' });
  expect(planAhead(D, ctx(day(1)))[1].ride!.from).toBeUndefined();
});
it('endOfDay: missed gym day slides; rest ticks done; phase-1 day 7 ticks skip', () => {
  expect(endOfDay(data({ workouts: { a: workout(day(0), 'UA', []) } }), day(1), 1)).toBe('slid');
  expect((endOfDay(data({ cycle: { t: { date: day(0), day: 7, status: 'done', savedAt: 0 } } }), day(1), 1) as any).doc).toMatchObject({ day: 8, status: 'done' });
  expect((endOfDay(data({ cycle: { t: { date: day(0), day: 6, status: 'done', savedAt: 0 } } }), day(1), 1) as any).doc).toMatchObject({ day: 7, status: 'skip' });
});
it('gymTick: a different session realigns', () => {
  expect(gymTick(data({ workouts: { a: workout(day(0), 'UA', []) } }), day(1), 'UB', 1)).toMatchObject({ realigned: true, doc: { day: 4 } });
});
it('settle: late import after midnight', () => {
  const D = data({ workouts: { a: workout(day(0), 'UA', []) } });
  expect(endOfDay(D, day(1), 1)).toBe('slid');
  const t = gymTick(D, day(1), 'LA', 2)!;
  expect(t.doc).toMatchObject({ date: day(1), day: 2, status: 'done' });
  const D2 = { ...D, cycle: { [t.id]: t.doc } };
  expect(planAhead(D2, ctx(day(2)))[0].cycleDay).toBe(3);
  expect(endOfDay(D2, day(1), 3)).toBeNull();
  expect(gymTick(D2, day(1), 'LA', 4)).toBeNull();
});
it('rideTick: 2 × 15 min counts; a stale gym-day ride never ticks a later ride day', () => {
  // cycle at day 3 (a ride day): two 15-min rides dated today → done
  // a ride dated before the latest tick → null
});
it('rides: each swap reason', () => {
  // four separate `it` blocks with real data, each expecting { code: 'E1', minutes: 60, from: 'H1' } and a reason:
  // 'deload week' (week 6) · starts 'hard-ride cap' · 'after a night shift' · starts 'readiness' (health { hrvStatus: 'LOW' })
});
it('planAhead: a frozen today is kept when health changes, dropped when the cycle moved', () => {
  // cycle at day 3 (a tick on day(0) for day 2); freeze planAhead(D, ctx(day(1)))[0] (H1)
  // with health { hrvStatus: 'LOW' } → p[0] deep-equals the frozen day
  // add a tick dated day(1) for day 3 (a late import) → the freeze is ignored and p[0].cycleDay === 4
});
```
Write the commented cases out in full with real data, the way the comments describe. Each is a separate `it`.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** `npm test` (PASS).
- [ ] **Step 5: Commit** `feat(viking): cycle settling and 7-day planner`.

### Task 7: Calendar blocks: placement and reconcile

**Files:**
- Create: `supabase/functions/_shared/viking/calendarPlan.ts`
- Test: `tests/vikingCalendar.test.ts`

**Interfaces:**
- Consumes: `PlanDay` (Task 6); `dtoMinutes` (Task 3); `CalEvent` (`_shared/scheduling.ts`); `zonedTime`, `Interval` (`_shared/lifeLogic.ts`).
- Produces:
  - `type Block = { date: string; key: string; title: string; start: string; end: string; overlaps: boolean }`
  - `type BlockState = { eventId: string; key: string; start: string; end: string }`
  - `blockFor(d: PlanDay): { key: string; title: string; minutes: number } | null`
  - `trainingSlot(date: string, window: string, minutes: number, tz: string, busy: Interval[]): { start: Date; end: Date; overlaps: boolean }`
  - `desiredBlocks(days: PlanDay[], windows: Record<string, string>, tz: string, busy: Interval[]): Block[]`
  - `type CalOps = { create: Block[]; update: Array<{ id: string; block: Block }>; remove: string[]; state: Record<string, BlockState> }`
  - `reconcile(desired: Block[], state: Record<string, BlockState>, existing: CalEvent[], now: Date, range: { from: string; to: string }): CalOps`

Rules: the spec's Google Calendar blocks section.
- **Keys:** `gym:LA:60` and `ride:E1:85`.
- **Windows:** take the first `HH:MM–HH:MM`. With only a start time, the window is 4 h. With no clock at all, it starts 16:30 and lasts 3 h.
- **Reconcile** works only on dates in `range`. Events count only when their description has `[jarvis]` and `viking:<date>`. It's adopt-aware, removes nothing whose start is ≤ `now`, and compares times as instants.

- [ ] **Step 1: Write the failing tests**
  - `slot: first free time inside the window`: busy 06:00–07:10, window `06:00–11:00`, 60 min → 07:15, `overlaps false`.
  - `slot: text window → 16:30`.
  - `slot: nothing free → window start, overlaps true`.
  - `reconcile: same key leaves an owner-moved event alone`: state key `gym:LA:60`, existing event at 09:00 vs desired 07:00, same key → no ops.
  - `reconcile: changed key updates the stored event; missing event is recreated`.
  - `reconcile: an unplanned future date is removed, a past one is kept`.
  - `reconcile: adopts a live viking:<date> event with no state; ignores foreign events` (an event 'my own gym note' is never in any op).
- [ ] **Steps 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(viking): Google Calendar training blocks that respect the owner's edits`.

### Task 8: Weekly summary and suggestions

**Files:**
- Create: `supabase/functions/_shared/viking/weekly.ts`
- Test: `tests/vikingWeekly.test.ts`

**Interfaces:**
- Consumes: `viking`, `VikingData`, `score` (logic.ts); `bike` (bikeLogic.ts); `EXBY` (data.ts); `progressFor`, `resetKg`, `WEIGHTED`, `Resets` (Task 4); `shortName` (Task 5).
- Produces:
  - `type Suggestion = { id: string; kind: 'reset'; ex: string; kg: number; status: 'pending' | 'ok' | 'no' | 'applied'; createdAt: string; decidedAt?: string; snoozeUntil?: number }`
  - `type WeeklySummary = { from: string; to: string; lifts: Array<{ ex: string; name: string; sessions: number; topKg: number | null; prevTopKg: number | null; bestE1rm: number | null; pr: boolean; stalled: boolean; repsUnknown: number }>; sessions: { done: number; slidDays: number }; rides: { z2: number; z2Target: number; hard: number; cap: number; minutes: number }; deloadNext: boolean; retestDue: boolean }`
  - `weekSummary(D: VikingData, today: string, slidDates: string[], resets: Resets): WeeklySummary`. `bestE1rm` uses real sets only.
  - `suggestionsFor(D: VikingData, existing: Suggestion[], resets: Resets, nowIso: string): Suggestion[]`. It returns the full new list:
    - It adds one `pending` per `WEIGHTED` exercise that's `stalled`, unless the exercise already has an open suggestion (`pending` or `ok`), or a `no` whose `snoozeUntil` > its session count.
    - It marks `ok` as `applied` once a session with that exercise has `startedAt` > `decidedAt` (falling back to `savedAt`).
    - The id is `` `${ex}-${nowIso.slice(0, 10)}` ``.

- [ ] **Step 1: Write the failing tests**
  - `weekSummary: PR flagged on real sets only`: an estimated-reps session doesn't create a PR.
  - `weekSummary: rides count Z2 and hard vs cap` (reuse `bike.test.ts`'s ride shapes).
  - `suggestionsFor: plateau → one pending reset at 90%, and no second while open`: called twice → one suggestion.
  - `suggestionsFor: declined waits 3 sessions; bw never suggested`.
  - `suggestionsFor: ok → applied after the next session`.
- [ ] **Steps 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(viking): weekly summary and stall suggestions`.

### Task 9: Recap and the engine

**Files:**
- Create: `supabase/functions/_shared/viking/recap.ts`, `supabase/functions/_shared/viking/engine.ts`
- Test: `tests/vikingRecap.test.ts`, `tests/vikingEngine.test.ts` (with an in-memory `VikingStore` defined in the test file)

**Interfaces:**
- Consumes: everything in Tasks 3–8.
- Produces:
  - `recapText(r: ImportResult, before: Record<string, Progress>, after: Record<string, Progress>, realigned: boolean): string` (Telegram HTML; the spec's Recap section)
  - `suggestionKeyboard(s: Suggestion): Keyboard`, where `Keyboard` is `Array<Array<{ text: string; data: string }>>`. It's defined in `recap.ts`, structurally the same as life-bot's.
  - `confirmKeyboard(r: ImportResult, activityId: string): Keyboard | null`. One row per exercise with `est` reps, at most 4: `✅ <shortName> as planned` → `vr:<activityId>:<exKey>`. Then a last row, `✅ All as planned` → `vr:<activityId>:all`. It's null when no reps were assumed.
  - `confirmReps(doc: WorkoutDoc, ex: string | 'all'): WorkoutDoc`: removes `'reps'` from `est` on those sets, and drops `est` when it's empty.
  - The store interface:

```ts
export interface VikingStore {
  load(): Promise<{ D: VikingData; current: PlanCurrent | null; state: PlanState | null; garmin: Record<string, { mirroredAt: string; hash: string }>; inbox: GarminIn[]; snapshots: Record<string, { session?: SessionKey; targets?: Record<string, Progress> }>; decisions: Record<string, { status: 'ok' | 'no'; decidedAt: string }> }>;
  hasWork(): Promise<boolean>;                       // any garmin_in without processedAt, or rides updated in the last 10 min
  put(coll: string, id: string, data: unknown): Promise<void>;
  claim(key: string): Promise<boolean>;              // life_nudge_log insert; false if taken
  release(key: string): Promise<void>;               // delete that life_nudge_log key (life-bot may delete; the no-DELETE rule is for routines)
  send(text: string, kb?: Keyboard | null): Promise<void>;
  context(today: string): Promise<{ afterNight: Set<string>; health?: Health; windows: Record<string, string>; wakeAt: Record<string, string> }>;
  calendar: null | { list(from: Date, to: Date): Promise<{ events: CalEvent[]; live: boolean }>; create(b: Block): Promise<string>; update(id: string, b: Block): Promise<void>; remove(id: string): Promise<void> };
}
export type PlanState = { since: string; settledThrough: string; slidDates: string[]; ridesSeen: string[]; resets: Resets; suggestions: Suggestion[]; blocks: Record<string, BlockState>; frozen?: { date: string; day: PlanDay } };
export function runVikingTick(s: VikingStore, now: Date, tz: string, since: string): Promise<{ imported: number; ticks: number; rebuilt: boolean; calendarOps: number }>;
```
- `load()` returns `inbox` sorted by `start`. `snapshots` covers the last 14 days only. `D` holds only settings + `COLLS`.

`runVikingTick` order (spec: Import order, Cycle settling, The plan, Calendar):
1. **Gate.** If `!(await s.hasWork())`, `now` minute % 15 ≠ 0, and the stored hash isn't null → return.
2. **Load.** Without `D.settings`, return.
   - Initialise `state` when missing: `{ since, settledThrough: addDays(today, -1), slidDates: [], ridesSeen: [], resets: {}, suggestions: [], blocks: {} }`.
   - Fold `decisions` into `state.suggestions`:
     - `ok` sets the status, `decidedAt`, `resets[ex] = decidedAt` and the override.
     - `no` sets the status and `snoozeUntil`.
     - Skip decisions already folded.
   - The engine is the only writer of `plan/state`.
3. **Stream.** Build one list:
   - `inbox` items. Those with `date < since` are put straight back with `processedAt`, result `before switch-on`, and are not imported.
   - rides with `date ≥ max(since, today − 7)` whose id isn't in `ridesSeen`
   - every finished date in `(settledThrough, yesterday]` as an `end-of-day` marker

   The sort key is `${date}T${start}` with `start` normalised to `HH:MM` (activities: the time part of `start`; rides: `start ?? '23:58'`; end-of-day: `'23:59'`). For each item, `i++`, `savedAt = now.getTime() + i`:
   - **Activity:**
     - `if (!(await s.claim('vkimp:' + id))) continue`.
     - Inside `try`: run `importStrength`, then put `workouts`, then `gymTick` and put it, then put `garmin_in` with `processedAt`/`result`. Update the in-memory `D`. Remove any tick date from `slidDates`.
     - `catch`: `await s.release('vkimp:' + id)`, log, and continue with the next item. The next tick retries.
     - After the try, best-effort: `if (await s.claim('vkrecap:' + id))`, `send(recapText(...), confirmKeyboard(...))` in its own try/catch, logged and never rethrown. `before` = `nextTargets` on the D before the import; `after` = on the D after.
     - On `skip`: put `processedAt`/`result`; send one line only for `not-viking`, under the same recap claim.
   - **Ride:** `rideTick` → put, and remove its date from `slidDates`. Add the id to `ridesSeen` (keep the last 60).
   - **End-of-day:** `endOfDay` → put the tick, or push the date to `slidDates` (keep 30). Set `settledThrough`.
4. **Suggestions.** `suggestionsFor` → send a `suggestionKeyboard` message for each new pending one, best-effort, each guarded by `claim('vksug:' + id)`.
5. **Rebuild.** Overrides come from `ok` suggestions.
   - **Freeze** today when `garmin[today]?.mirroredAt ≥ wakeAt[today]` and `state.frozen?.date !== today`. Store the day that's in `plan/current.days[0]` for today. `planAhead` applies the freeze conditions itself.
   - Then `planAhead` with `windows`.
   - Put `plan/current` only when `hashOf({ days, pending })` differs.
   - Put `plan/<today>` (no DTOs) only while today has no workout or tick.
   - Put `plan/weekly` = `weekSummary(...)`.
   - Put `plan/state`.
6. **Calendar.** If `s.calendar` is set and (the plan changed or minute % 15 === 0):
   - `list` from today to +7. If `live` is false, skip.
   - Otherwise: `desiredBlocks` (busy = events without `viking:`), then `reconcile`, then apply the ops, then store `state.blocks`.

- [ ] **Step 1: Write the failing tests**
  - `recapText`:
    - The Task 5 LA result, `before.squat.kg 110`, `after.squat.kg 110`, with `repsUnknown` → contains `Lower A saved`, `Back squat: reps not recorded, assumed 5`, `targets stay`, and no `Next time` line.
    - With `after.lycurl.kg 55` vs `before 54` → contains `Lying leg curl 54→55 kg`.
    - `realigned` → contains `Cycle moved`.
  - `vikingEngine.test.ts` with a `MemoryStore` (maps for docs and claims, an array of sent messages, a fake calendar):
    - `engine: no settings → nothing written`.
    - `engine: imports 24 and 25 Nov, ticks days 1 and 2, sends two recaps, plan starts at day 3`. The data is `settings` + the 22 Nov LB doc, since = `2026-11-24`, and the UA + LA fixtures in the inbox. The run is at `2026-11-25T18:00Z`.
    - `engine: idempotent, one recap`: run twice → `sent.length` unchanged on the second run; the workouts and ticks are unchanged.
    - `engine: stream order`: the LA fixture comes before the UA one in the inbox array, but UA is still imported first (date order). UA's recap says the cycle moved (the plan expected day 6 after the 22 Nov LB), and LA's recap does not (it is day 2, as planned).
    - `engine: four uncounted squat sessions never raise the kg`: four LA activities 8 days apart, each a copy of the fixture with every rep null. After each run, `nextTargets(viking(store D), 'LA', <next day>, {}, {}).squat.kg` is 110. Don't read `plan/current`: LA isn't in the next 7 days right after an LA.
    - `engine: a confirmed session advances`: after one import, apply `confirmReps(doc, 'all')` to the stored doc. With squat sets then 3 × 5 recorded, the next squat target is 110 × 6.
    - `engine: a failed send never loses the import`: `send` throws → the workouts doc, tick and `processedAt` are all written, and a second run sends nothing new (the recap claim was taken).
    - `engine: a throw after the claim releases it`: make the first `put('workouts', …)` throw → `vkimp:<id>` is released, `processedAt` is unset, and the next run imports it.
    - `engine: before-since activity is marked processed, not imported`.
    - `engine: today's snapshot is not overwritten after today is logged`.
    - `engine: a decision doc is folded once` (`ok` → override → the next LA's squat target is the reset kg).
    - `engine: calendar skipped when live is false`.
- [ ] **Steps 2–4:** Run (FAIL), implement, run `npm test` (PASS).
- [ ] **Step 5: Commit** `feat(viking): engine that imports, settles, plans and places training`.

### Task 10: life-bot wiring: the store, switch, buttons, chat tools

**Files:**
- Create: `supabase/functions/life-bot/viking.ts`
- Modify: `supabase/functions/life-bot/tick.ts`, `index.ts`, `agent.ts`

**Interfaces:**
- Consumes: `runVikingTick`, `VikingStore`, `PlanState` (Task 9); `bridge`, `gcalEnabled`, `liveEvents` (calendar.ts); `sendMessage` (telegram.ts); `claim` logic as in tick.ts.
- Produces:
  - `supabaseStore(db: Db, userId: string, chatId: number, tz: string): VikingStore`
    - `load` pages by 1000 over `viking_docs` for `coll in (settings + COLLS)`; `garmin_in` where `processedAt` is null; `plan` for `doc_id in ('current','state','garmin','weekly')`; and `plan` snapshots for the last 14 dates.
    - `hasWork` is a `count` head query over the partial index from Task 2, plus rides `updated_at > now − 10 min`.
    - `context` reads confirmed `life_shifts` (afterNight: the local dates after a shift ending 00:00–08:00 local), `life_health` today, and `life_day_plan` (`train_window`, `wake_at`) for today..+7.
    - `calendar` is `null` when `!gcalEnabled()`. Otherwise it wraps `liveEvents` and `bridge.create/update/remove`, with description `[jarvis] training · viking:<date>` and `remindersMin: [30]`.
  - `tick.ts`: after step 1, `if (readPrefsRaw.vikingGarmin === true) await runVikingTick(supabaseStore(...), now, tz, prefs.vikingGarminSince ?? today)`, inside try/catch with `console.error('life tick: viking failed', err)`. Read the raw prefs, since `readPrefs` may drop unknown keys; check `readPrefs` in lifeLogic and extend `LifePrefs` with `vikingGarmin?: boolean; vikingGarminSince?: string` if needed.
  - `release(key)`: `db.from('life_nudge_log').delete().eq('user_id', userId).eq('key', key)`.
  - `index.ts` callback `vk:<id>:ok|no`:
    - It reads `plan/state` to find the suggestion. If it's missing, or `plan/decision-<id>` already exists, it answers "Already handled".
    - Otherwise it upserts `plan/decision-<id>` = `{ status, decidedAt: now }`, **never** `plan/state`. Then it sets `plan/current.hash = null` (a jsonb update of that key only) and settles the buttons: `✅ Next <shortName>: <kg> kg` / `✖️ Keeping the weight`.
  - `index.ts` callback `vr:<activityId>:<exKey|all>`:
    - It reads `garmin_in/<activityId>.result` for the docId and loads that `workouts` doc. If either is missing, it answers "Already gone".
    - It puts `confirmReps(doc, ex)`, clears `plan/current.hash`, and settles that button's row to `✅ <shortName>: reps confirmed` (or `✅ All confirmed`).
    - `result` must therefore hold the docId: Task 9 writes `result: '<docId>'` on success.
  - `supabaseStore.load` also returns `decisions` from `plan` docs whose `doc_id` starts with `decision-` and that are less than 30 days old.
  - `agent.ts` tools (descriptions as the spec's Chat tools):
    - `viking_status` (no input) → `{ today, next gym day: session + targets (kg, assistKg, reps, sets, note), next 7 days: date/kind/session|code/minutes/reason, last session: date/session/assumed sets, pending suggestions }`
    - `viking_fix` (`{ date, session, exercise, set?, kg?, reps? }`) patches `workouts/<date>_<session>`:
      - `set` is 1-based; omitted, it patches every set; `set = length + 1` appends one.
      - It removes the `est` entries for the fields it set and clears `plan/current.hash`.
      - It refuses unknown keys and lists the session's `shortName`s.
- Both tools are listed in the agent's tool array and handled in its tool switch, following the existing patterns.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Verify** with `npm test && npm run typecheck`, then push. The CI `deno check` job must pass on the pushed commit. Check the run result with the GitHub MCP `actions_list` / `get_job_logs`.
- [ ] **Step 3: Commit** `feat(life-bot): wire the Viking engine behind prefs.vikingGarmin`.

### Task 11: Habits with shift-aware reminders

**Files:**
- Modify: `supabase/functions/_shared/lifeLogic.ts` (`TASK_LISTS` gains `'Habits'`; new `anchoredRemindAt`)
- Modify: `supabase/functions/life-bot/tasks.ts` (`spawnNext` copies `remind_anchor`/`remind_offset_min` and leaves `remind_at` null for anchored tasks; new `rollHabits`)
- Modify: `supabase/functions/life-bot/tick.ts` (anchor reminders; wind-down + evening shutdown; `rollHabits` at day change)
- Create: `supabase/scripts/04_habits_seed.sql`
- Test: `tests/life.test.ts` (add cases)

**Interfaces:**
- Produces:
  - `anchoredRemindAt(anchor: 'wake' | 'winddown', offsetMin: number, planDue: DayPlan, planNext: DayPlan, prefs: LifePrefs): Date`: `wake` → `planDue.wakeAt + offset`; `winddown` → `windDownAt(planNext, prefs)`
  - **Tick, every 15 min:** for open tasks with `remind_anchor`, `reminded_at` null, `due_on` in [today, today+1], and (`remind_at` is null or `remind_at = remind_auto_at`), compute the value. When it differs, update both `remind_at` and `remind_auto_at`.
  - **Wind-down:** when the generic reminder for a `winddown` task would fire within 15 min of the wind-down nudge, the wind-down message appends `\n☑️ <title>` and gets that task's `[[✅ Done tk:<id>:d]]` keyboard. That task's `reminded_at` is set first, so the generic reminder doesn't fire.
  - `habitDueToRoll(t: { due_on: string; remind_at: string | null; reminded_at: string | null }, today: string, now: Date): boolean` (pure, in lifeLogic). It's true when `due_on < today` and either `remind_at` is null, or `reminded_at` is set and `now − reminded_at ≥ 2 h`, or `remind_at` is more than 6 h in the past (it never fired).
  - `rollHabits(db, userId, tz, today, now): Promise<number>`, run every 15 min (no daily claim):
    - Find open `list = 'Habits'` tasks with `recur` where `habitDueToRoll` is true.
    - Set `done_at = skipped_at = now` and `next_spawned = true`.
    - Delete the Google copy (`gcall('delete')`, null `gtask_id`).
    - Insert the next occurrence via `nextOccurrence(addDays(today, -1), recur)`, carrying the anchor fields.
- Seed script: idempotent (`where not exists` on `(user_id, title, done_at is null)`), for the owner from `life_profile`. It inserts the six rows of the spec's Habits table:
  - `list 'Habits'`, `area 'personal'`
  - `due_on` = the next matching local date ≥ today (in SQL, with `America/Aruba`)
  - anchors: wake 15 / winddown 0 / others null
- **Weekdays:** check `parseRecur`'s convention (0 = Sunday, via `getUTCDay`) against the table before writing the seed.

- [ ] **Step 1: Write the failing tests**
  - `anchoredRemindAt: wake + 15 follows the shift`: `planDay` for a 05:00 morning shift and for a day off → each `wakeAt + 15 min`.
  - `anchoredRemindAt: winddown is the end of the due date's waking day`: it equals `windDownAt(planDay(due + 1))`. On a day off and on a morning-shift day, its local date is `due`. When `due` is a night-shift day (21:00–05:00), it falls on `due + 1` before the post-shift sleep.
  - `habitDueToRoll: a night-shift shutdown isn't rolled at 00:30 the next day, but is 2 h after its reminder fired`.
  - `TASK_LISTS includes Habits; listFor('habits') === 'Habits'`.
- [ ] **Steps 2–4:** Run (FAIL), implement, run `npm test` (PASS).
- [ ] **Step 5: Commit** `feat(life): habit tasks with reminders that follow the shift`.

### Task 12: Routines and docs

**Files:**
- Modify: `life/routines/sync.md`, `life/routines/weekly-review.md`
- Create: `life/routines/monthly-review.md`
- Modify: `README.md`, `docs/LIFE_ASSISTANT.md`

Changes. All Viking parts start with "If `prefs.vikingGarmin` isn't true, skip this and leave Garmin training workouts alone."

**sync.md step 7, Lifting.** Replace the nudge. For each Garmin `strength_training` activity whose local date is ≥ `prefs.vikingGarminSince` and within the last 7 days, and which has no `garmin_in/<activityId>` doc:
- Call `get_activity_exercise_sets`.
- Insert `viking_docs ('garmin_in', '<activityId>')` with the `GarminIn` JSON: `name`, `date`, `start` local, `startUtc` (Garmin's GMT start as ISO UTC), and `sets` trimmed to `category`/`name` (`exercises[0]`), `reps`, `weightG`, `type`, `idx`, plus `processedAt: null`.
- Use `on conflict do nothing`.
- Ride docs also get `start` (`HH:MM` local), as they do today.

**sync.md step 8.3.** Replace the whole training bullet. The training line comes from `plan/current.days` for today: session or ride with minutes, the reason if swapped, and the top 3 targets (`kg`, or `assist n kg`, with reps × sets). Delete every sentence about scheduling, unscheduling or copying workouts in 8.3.

**sync.md step 9.** Replace it with "Mirror the Viking plan to Garmin" (every run, as the **last** Viking step, after step 7's inserts). Write the spec's Garmin mirror section out in full as numbered sub-steps:
- First: skip today while `select count(*) from viking_docs where user_id = :uid and coll = 'garmin_in' and data->>'processedAt' is null` > 0.
- The keep path refreshes `mirroredAt`.
- Upload and schedule come before unschedule and delete.
- Library workouts may be unscheduled only.
- End with the `plan/garmin` record (a jsonb merge: `data = viking_docs.data || excluded.data`) and the 14-day cleanup from `plan/garmin`.

Delete the old 9.1–9.6 and the exercise-key list; the DTOs come ready-made.

**weekly-review.md** becomes the Saturday training briefing. It's self-contained, with no "read sync.md": inline the owner query, the hard rules, the outbox format and the button format.
- Reads:
  - `plan/weekly`, `plan/current`, and `plan/state.suggestions` where `status = 'pending'`
  - `life_health` (14 days), `life_shifts` and `life_day_plan` (7 days back and ahead)
  - `life_tasks` where `list = 'Habits'` and `due_on` is in range (done = `done_at` not null and `skipped_at` null; expected = all rows)
  - Garmin training status and load
- Sends one `kind 'weekly'` message, ≤ 30 lines, in the order Training · Recovery & readiness (vs shifts, one fix) · Habits · Next week · one closing line.
- Then one message per pending suggestion, with `[[{"text":"✅ Reset","data":"vk:<id>:ok"},{"text":"✖️ Keep pushing","data":"vk:<id>:no"}]]`.
- Advice only (exercise swaps, kcal, missed-session patterns, reps not counted): text, no buttons.
- Sets `prefs.lastWeeklyReview`.

**monthly-review.md** starts with "If today (local) isn't the first Sunday of the month, stop." Then it has the old money, subscription audit and inbox sections. It's self-contained like the weekly one.

**README / LIFE_ASSISTANT:**
- Viking is read-only and fed from Garmin.
- Ascend is retired (its code and tables are kept).
- Jarvis's Training row: import, progression rules, a cycle that waits, calendar blocks, the switch.
- Nudges row: the Saturday briefing and the monthly money message.
- Scheduled tasks: sync (3-hourly), weekly (Sat 18:39), monthly (Sun 18:13).
- How to turn the switch on and off.

- [ ] **Step 1:** Make the edits.
- [ ] **Step 2: Verify.** Each grep below must print nothing: `grep -n "Tap Train in Viking\|Viking week on the watch (Sundays)\|library workout named exactly" life/routines/sync.md` and `grep -n "Read \`life/routines/sync.md\`" life/routines/weekly-review.md life/routines/monthly-review.md`. And `grep -c "vikingGarmin" life/routines/sync.md` is ≥ 3.
- [ ] **Step 3: Commit** `docs(life): routines for the Garmin-first plan, Saturday briefing, monthly money`.

### Task 13 (PR 2, a separate branch off main after PR 1 is merged and live): Read-only Viking app, Ascend retired

PR 2 is built only after Task 14 step 6. Its branch is `<working branch>-app`, or whatever the session's git rules name.

**Files:**
- Modify: `src/App.tsx`, `src/features/viking/VikingApp.tsx`, `src/features/viking/vikingDb.ts`, `src/features/viking/viking.css` (the card only)
- Modify: `supabase/functions/_shared/viking/logic.ts` (the coach option)
- Create: `supabase/migrations/0038_ascend_off.sql`: unschedule pg_cron `ascend-reminders` with 0028's guarded `do $$` pattern
- Test: `tests/viking.test.ts` (add cases)

Changes:
- **`App.tsx`:**
  - `MainGate` renders `VikingApp` directly; `/ascend/*` → `<Navigate to="/" replace />`.
  - Remove the `PortalChooser`, `AscendApp` and `getPortal` imports and their uses.
  - **Keep** `setPortal` in the SIGNED_OUT handler. It's harmless and still clears the stored value.
  - Delete no feature files.
- **`vikingDb.fetchAll`:** add `.in('coll', ['settings', ...COLLS])`.
- **`VikingApp.tsx`:**
  - Remove: `saveWeigh`, `saveCheckin`, `toggleSupp`, the `adjust` buttons, `useLogger` and the `TrainTab` logger UI, Body's weight/waist forms, Fuel's `toggle`/`saveExtras` controls, `RidesView`'s form, `CycleCard`'s done/skip/Undo, the 'Switch to Ascend' button, and the `ConfirmButton` deletes on weights, waist, workouts and rides.
  - Keep: the first-run setup card, the Settings sheet, benchmark retest entry and delete, and every list, chart and summary.
  - Add "Next on your watch" on Today: `supabase.from('viking_docs').select('data').eq('user_id', uid).eq('coll', 'plan').eq('doc_id', 'current').maybeSingle()`, reloaded with the other data on visibility change. It shows the first non-rest day with session or ride, the top 3 targets and the swap reason. With no plan: "Jarvis hasn't built a plan yet."
- **`coach(T, opts?: { garmin?: boolean })`:** with `garmin: true`:
  - The 'Weigh in today' and 'Measure your waist' flags are omitted, and `adj`/`al` are stripped.
  - The Deload text becomes `'Same exercises and weights, half the sets. The watch shows them halved.'`.
  - 'Stuck exercises' becomes `'… no progress in 3 sessions. Jarvis will offer a reset on Telegram.'`.
  - Today passes `{ garmin: true }`.

- [ ] **Step 1: Write the failing tests:** `coach({garmin:true}) drops input nags and kcal buttons` (empty data → no 'Weigh in today', no `adj`), and `coach({garmin:true}) words the deload for the watch` (week 6 → the text contains 'The watch').
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run build` (PASS).
- [ ] **Step 5: Check in the browser.** Start `npm run dev`, and use the pre-installed Playwright from a `.cjs` script in the scratchpad (`require('playwright')`; the repo is `"type":"module"`; don't install it). At 390 px wide, with a stubbed session (see `tests/resetBackNav.test.ts` and `src/lib/supabase.ts` for the env vars; point them at a local stub, or test the logged-out redirect only, if no key is available), check:
  - `/ascend` → `/`
  - with the cache seeded through `localStorage` `viking_cache_v1_<uid>`, no `input` or `textarea` on Today/Train/Body/Fuel/Ride except Settings and the benchmark entry
  Take a phone screenshot for the owner.
- [ ] **Step 6: Commit** `feat(viking): read-only dashboard fed by Garmin; retire Ascend`.

### Task 14: Rollout (each step needs the owner's go-ahead)

- [ ] **Step 1: Merge PR 1.** Push, open the PR (Tasks 1–12), and wait for the owner to merge. The deploy applies 0037 and deploys `life-bot`. The switch is off, so nothing changes. The only visible effect is an empty "Habits" list appearing in Google Tasks.
- [ ] **Step 2: Save the rollback copy.** Copy the current prompts of the sync trigger (find it with `list_triggers`) and of `trig_01NpEtQTQpdD6FT6qV3r7PN8` verbatim to `life/routines/previous/{sync,weekly-review}.md`, then commit and push.
- [ ] **Step 3: Clean out old workouts.**
  - With the Garmin connector, run `get_scheduled_workouts` from today to +14.
  - For each scheduled workout named `Viking … (…)` (dated, with parentheses) whose description has no `[viking:`: `unschedule_workout` it, then `delete_workout` it.
  - Leave the four library workouts in the library, but unschedule them from today on.
  - List what was removed for the owner.
- [ ] **Step 4: Go live, all within a few minutes, in this order:**
  1. The sync trigger prompt becomes the new `sync.md`.
  2. `trig_01NpEtQTQpdD6FT6qV3r7PN8` gets `weekly-review.md`, cron `CRON_TZ=America/Aruba 39 18 * * 6`.
  3. Create `Jarvis monthly review` with `CRON_TZ=America/Aruba 13 18 * * 0`, the weekly trigger's connectors, and the `monthly-review.md` prompt.
  4. Switch on: `update life_profile set prefs = prefs || '{"vikingGarmin": true, "vikingGarminSince": "2026-11-24"}' where telegram_chat_id is not null;`
  5. Fire the sync trigger.
- [ ] **Step 5: Check after that run.**
  - `garmin_in` docs for `25182355443` and `25193624779`, both with `processedAt`
  - `workouts/2026-11-24_UA` and `2026-11-25_LA` with `source 'garmin'`
  - two recaps on Telegram, with "as planned" buttons where reps weren't counted
  - `plan/current.days[0].cycleDay` is 3, or later if a day has passed
  - training blocks in Google Calendar

  Fire the sync once more, then check that the Garmin calendar from today to +6 has exactly one `Viking …` workout per training day, each with `[viking:` in its description, and that `plan/garmin` is filled. Then run `supabase/scripts/04_habits_seed.sql`, and check the six `Habits` rows and their Google Tasks copies.
- [ ] **Step 6: Report to the owner** what ran and what to check on the watch: the next Upper B weights, the farmer's carry in metres, the pull-up assist text, and whether reps get counted when he edits them on the watch.
- [ ] **Step 7: After a few good days and the owner's OK**, build PR 2 (Task 13), and merge it once he approves.
- [ ] **Step 8: Week-12 deload check, around 26 Dec**: the first deload with 1-set groups (incline DB, the 2-set accessories). After that session, check that its `garmin_in` result has `dropped: 0`. If the indices aren't `3g`, fix the mapping before the next deload.
- **Rollback at any point:**
  - switch off (`prefs || '{"vikingGarmin": false}'`)
  - put the prompts from `life/routines/previous/` back on both triggers, and disable the monthly one
  - revert PR 2 if it's merged

  The old routine then schedules the library workouts again, and the app logger works as before. The data written so far stays.
