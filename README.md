# THE SYSTEM

A personal training site with three sides, all behind one Supabase sign-in:

- **Project Viking** (`src/features/viking/`) — the 52-week training plan.
  This is the main side of the site (it replaced the Solo Leveling RPG).
- **Ascend** (`src/features/ascend/`) — a life-RPG, picked from the chooser.
- **Reset** (`src/features/reset/`) — D's separate workout portal.

Built as an installable PWA: **Vite + React + TypeScript + Tailwind**, backed by
**Supabase** (Postgres + Auth + Edge Functions).

## Project Viking

After sign-in a chooser offers Project Viking or Ascend (once per launch; a
reload stays where you were). Viking is a phone-first tracker with five tabs:

| Tab | What it does |
|---|---|
| Today | Week and phase on a 52-week strip, next session in the rotation, 7-day tiles, the **coach**, morning weigh-in, sleep/steps/supplements check-in |
| Train | Session logger (Upper A → Lower A → Upper B → Lower B) with suggested weights, deload toggle, est. 1-rep-max chart, editable history |
| Body | Weight chart with 7-day average and the checkpoint corridor, waist log, Month 3/6/9/12 checkpoints |
| Fuel | Calories / protein / water against the phase target, the plan's four meals as tick boxes, extras, 14-day bars |
| Ride | The bike plan: ride log (code, time, distance, HR, cadence, Z2 minutes, notes, Strava link) with live rule warnings, weekly summary (Z2 vs target, hard rides vs cap, ride time), HR zones, **Benchmarks** (baseline vs retests with a trend chart), sleep and steps |

**The plan is data, the rules are pure functions.**
`vikingData.ts` holds the phases (Foundation cut → Main cut → Diet break →
Finish cut → Lean build), the four sessions (exercise keys are frozen, since
saved workouts key off them), the meal plan, supplements and checkpoints.
`vikingLogic.ts` holds every rule and takes `today` as an argument:

- week = whole weeks since the start date; every 6th week is a deload (half the
  sets, rounded up); accessories get +1 set from phase 2, upper compounds +1 in
  the lean build
- double progression: top of the rep range on every set → suggest the next
  load; no better best set in 3 sessions → swap the exercise
- the coach reads the 7-day average weight trend (too fast / sweet spot /
  stalled, with one-tap ±kcal buttons and a 14-day cool-down), calories,
  protein, main-lift trends, hard rides and sleep

`tests/viking.test.ts` locks those rules.

**The bike plan** (`bikePlan.ts` data, `bikeLogic.ts` rules, `tests/bike.test.ts`)
runs alongside the lifting on an **8-day cycle** (Upper A + optional R1 →
Lower A → hard ride → Upper B → Lower B → endurance → ride → rest). The cycle
is a sequence, not weekdays: Today shows the current day's gym session and ride
card (code, time, target zones, how, where), and it advances when the day is
ticked done or skipped. Saving a gym session ticks its day; saving a ride can
tick a ride day. Weeks, phases and deloads come from the Viking start date.
Rules: no hard ride (H1/H2/H3) within 24 h before Lower A/B; hard rides per
rolling 8 days ≤ the phase cap (1 in phase 1, 2 after); deload weeks swap hard
rides for ≤ 60 min Z1–Z2 and flag any hard ride logged; H3 sprints hidden
before phase 2. A retest prompt shows at the end of each deload week.
Rides stay in the `rides` collection (old easy/hard rides still count);
`cycle` ticks and `benchmarks` retests are new collections (migration 0029).

**Storage.** `vikingDb.ts` keeps one row per document in `viking_docs`
(`supabase/migrations/0028_viking.sql`): `(user_id, coll, doc_id) → data jsonb`,
owner-only RLS, no edge function. The UI renders from a localStorage cache and
writes optimistically; a failed write shows a toast and reloads the server copy.
Unsaved logger input is kept as a per-user draft in localStorage.

The old Solo Leveling RPG code was removed. Its database tables were left in
place untouched; migration 0028 only stops its `system-heartbeat` pg_cron job
so it no longer sends RPG push notifications. The `game` and `cron` edge
functions were deleted from Supabase.

### The "Reset" portal (D's side)

A second, light-themed app lives under `src/features/reset/` and is reached by
role routing in `src/App.tsx` — a standalone workout tracker, separate from
Project Viking. It runs a **4-session machine-based gym program built for fat loss**
(Lower A/B, Upper A/B, plus a mobility session): short rests (45–60 sec
on the machines, 90 sec on the hinge and the squat), paired supersets for
density, interval conditioning on the upper days, and a barbell squat finisher
on every strength session (back squat on the lower days, front on the upper).

**Sessions are picked, not scheduled.** Nothing is tied to a weekday: the plan
tab lets her pick today's session by muscle focus, with a "Last trained"
banner, a *Suggested today* badge on the session trained longest ago whose
body region has recovered, and a soft warning when a region was trained in the
last 48h (`src/lib/sessionPick.ts`).
**Every training day resets at 00:00 local**: any session with ticked sets is
logged to the calendar on the day it was trained (partial if unfinished) and
the % rings return to 0 (`rolloverProgress` in `resetStore.ts`).

The whole program is pure data in `src/features/reset/resetData.ts`: the week
`PLAN` (day ids are frozen — logged history keys off them), `WARMUP` /
`COOLDOWN`, the 8-week `WEEK_TIPS` progression, `INJURY_FLAGS` (lower back /
tennis elbow), and `SWAPS` + `RESERVE` so a busy machine always has an
alternative.

**The program week drives the prescription.** `weekPrescription(ex, week)`
is the one rule set behind what she sees, ticks and logs *and* what the time
model costs: week 1 halves the sets (ramp-in), week 5 deloads to 2 sets per
exercise (same reps, same loads), week 6+ cuts superset rests to 45 sec, and
weeks 7–8 run the intervals as 6 × 40 sec / 30 sec easy. Change the week and
the boxes, % rings and logged sessions re-size automatically; each card shows
a short note on what the week changed.

**The one-hour cap is executable, not a comment.** `estimateMinutes(day, opts)`
costs a session out of its own exercise data — work sets priced as reps ×
tempo, rest, station changes, the squat rack, per-set logging time, warm-up,
cool-down and a contingency buffer — and every `Day.estMin` is derived from it
(then surfaced in the plan cards and the day header). `tests/resetPlan.test.ts`
asserts the *function's* output stays ≤ 60 min in every week of the
progression, so adding sets fails the build instead of silently blowing the
hour. It also locks the week shape, the alternating squat finishers (including
that a squat only ever swaps for another squat), the retired-id fallback, and
id uniqueness; `tests/resetSwaps.test.ts` locks the swap graph.

Retired movements from the old home program live in `RETIRED` — never
programmable, but `exerciseById` resolves them so old logs and personal
records still render with a real name.

Demo videos are per-exercise and user-editable — new gym movements ship with
an empty `video` on purpose (a guessed YouTube id is a dead embed), and the
day view offers a "Search YouTube" link next to the paste-a-link field.

### UI gotcha — calendar grid (don't reintroduce the row gap)

The month calendar (`src/features/reset/ProgressView.tsx` → `Calendar`) uses a
7-column CSS grid of square (`aspect-ratio: 1`) cells. **Never render empty
placeholder `<div>`s to pad the days before the 1st.** A placeholder element
still participates in row sizing, and an `aspect-ratio` cell whose width
resolves against a stale container width (the portal lives in a
`position: fixed; overflow-y: auto` scroller) can inflate the row it sits in —
which showed up as a phantom vertical gap between the first and second week.

Offset the first day with `gridColumnStart: startDow + 1` instead, so **every**
grid item is a real, identically-sized day cell and no leading placeholder can
ever make one row taller than the rest. Same rule applies to any future
calendar/grid: position the first item, don't pad with empty cells.

## Setup (one time)

1. **Database** — open the Supabase SQL editor for project
   `npqpzzarohlvexqpqurg` and run the files in `supabase/migrations/` in order.
2. **Edge function** — with the Supabase CLI:
   ```sh
   npx supabase login          # needs an access token
   npx supabase functions deploy ascend --project-ref npqpzzarohlvexqpqurg
   npx supabase functions deploy ascend-notify --project-ref npqpzzarohlvexqpqurg
   ```
3. **Frontend env** — copy `.env.example` to `.env` and paste the project
   anon key (Supabase dashboard → Settings → API).
4. ```sh
   npm install
   npm run dev        # or: npm run build → deploy dist/ (Vercel config included)
   ```

## Commands

```sh
npm run dev        # dev server
npm test           # unit tests (Viking rules, Reset plan, Ascend)
npm run build      # typecheck + production build (PWA)
npm run android:apk  # build an installable APK (needs the Android SDK)
```

## Android app (APK)

The web app is wrapped in a native Android shell with
[Capacitor](https://capacitorjs.com) (`capacitor.config.ts`, `android/`).
`.github/workflows/android.yml` builds the APK on every push:

- **Any branch** → download `the-system-apk` from the workflow run's
  *Artifacts* section (a zip containing `the-system.apk`).
- **`main`** → also published to the
  [`android-latest` release](../../releases/tag/android-latest). Open that page
  on your phone, tap `the-system.apk`, and allow "install unknown apps" for
  your browser when asked.

**Signing key (do this once so updates install over the old app).** Without
it, every CI build uses a throwaway key and Android refuses to update — you'd
have to uninstall first (and log in again). Generate a key on your computer and
add four repository secrets under **Settings → Secrets and variables → Actions**:

```sh
keytool -genkeypair -keystore release.keystore -alias thesystem \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore   # macOS: base64 -i release.keystore
```

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | output of the `base64` command |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose |
| `ANDROID_KEY_ALIAS` | `thesystem` |
| `ANDROID_KEY_PASSWORD` | key password (same as the keystore one unless you set another) |

Keep `release.keystore` somewhere safe and out of git — losing it means users
must uninstall to get updates.

Web push notifications rely on the browser's Push API, which Android's WebView
doesn't provide, so the toggle reports "not supported" inside the APK. Native
push would need Firebase Cloud Messaging; until then keep the PWA installed
for notifications.

## Deploy

The backend deploys automatically. Pushing to `main` runs
`.github/workflows/deploy.yml`, which applies any new database migrations and
redeploys the `ascend` + `ascend-notify` edge functions. Each step is gated on its secret,
so add these under **Settings → Secrets and variables → Actions**:

| Secret | Enables | Where to get it |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | edge-function deploys | supabase.com/dashboard/account/tokens |
| `SUPABASE_DB_PASSWORD` | `supabase db push` migrations | project DB password (Settings → Database) |

Migration history was baselined (`0001`–`0019` marked applied), so `db push`
only applies files added afterward — keep new migrations numbered in order
(`0020_*.sql`, …) or use `supabase migration new`. Function secrets the runtime
needs (`GEMINI_API_KEY`, `VAPID_*`, `CRON_SECRET`) are set once with
`npx supabase secrets set …`, not in CI.

To deploy by hand instead:

```sh
npx supabase functions deploy ascend --project-ref npqpzzarohlvexqpqurg
npx supabase functions deploy ascend-notify --project-ref npqpzzarohlvexqpqurg
```
