# Brief: Deload phase for the Reset portal (D's gym program)

Target: give the Reset program a real, recurring deload so D can recover. She is in program week 12 and has had no deload since the old week-5 one; weeks 9–12 silently repeat the week 7–8 peak settings and the week counter stops at 12.
References: none visual. The reference is the spec below plus the existing Reset code style (`src/features/reset/`), its tests and its comment voice.
Bar (code mapping, scored by an independent reviewer agent, 1–10): correctness of the rules 10, consistency (plan card, day cards, ticked boxes, logged session, time estimate all agree) 9.5, persistence and sync safety 9.5, UX copy and clarity for D 9, tests 9, code quality matching repo style 9. Stop when the reviewer is "wowed" (every dimension at or above its bar, no open findings).
Calibration offset: none. My own scores never decide a stop.
Rules: no new dependencies. Keep all existing features working. No regressions: the full `npm test` suite and `npm run typecheck` stay green. Do not touch the dark System/Viking/Ascend apps.
Time: hard cap 3h. Started 2026-11-24 12:45 UTC. Cap 15:45 UTC.
Deliverable: code + tests + a Supabase migration file, committed and pushed to `ccr-c7b60f9e-h2i6l0`. No PR. No screenshots per round (user declined). Migration is NOT applied to the live database by this run; the user is told it must be applied before deploying.
Permissions: commit + push to the session branch yes. PR no. Apply DB migration no (ask after).
User's words: "she's at week 12, however the app does not follow a deload phase, I need this feature so she can rest. Deload should change instructions, sets, recommended volume etc." · "When making edits, run two agents in parallel, one to edit, and one to review. Loop and edit mistakes until reviewer is wowed."

## Decisions from intake (user answers)

1. Timing: automatic cycle + a manual switch.
2. Deload changes: fewer sets (about half) and lighter weight. NOT chosen: easier conditioning, longer rests / no supersets.
3. After the deload: a new block starts, heavier; week counter keeps counting (no 12 cap).
4. Week advance: stays manual (− / +).
5. Rhythm: every 6th week of a block is the deload (5 hard + 1 easy).
6. Intensity: sets halved (rounded up, min 1), same reps, load about 65% of her recent best (RPE 5–6). Card shows e.g. "Recent best 40 kg → aim 26 kg".
7. Manual switch: makes the current program week a deload; pressing + ends it; the next automatic deload counts 6 weeks from the week after it.
8. The old week-5 deload is replaced by the new rule. Intervals NOT changed in a deload (rounds as written). Squat cue not specially changed beyond the general deload RPE note. Mobility days run as normal.
9. Block shape (6 weeks): wk1 base (block 1 only: the half-set ramp-in), wk2–3 add load, wk4 density (45-sec superset rests), wk5 peak (density + 6×40 s intervals), wk6 deload.
10. Start heavier: in week 1 of block 2+, each loaded card shows a target from her logs (~5% over recent best, rounded to 2.5 kg, at least one 2.5 kg step up); plain advice text when that exercise has no logged weight.
11. Mobility days: unchanged during a deload.
