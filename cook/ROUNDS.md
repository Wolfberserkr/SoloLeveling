# Rounds: Reset deload cycle

Start: 2026-11-24 12:45 UTC · Cap: 15:45 UTC · Baseline: 229/229 tests green, typecheck not yet run.

## Decisions
- Old cook run (Jarvis, shipped) archived to cook-archive/2026-11-13-jarvis/.
- Loop shape for a code task: an editor agent and a reviewer agent run in parallel. The reviewer studies the code and spec while the editor builds, then reviews the diff. Findings go back to the editor. Repeat until the reviewer signs off.
- Load base = max logged weight in 56 days, so deload weights never drag down the next target.
- Mobility days are skipped by the deload rule; conditioning is untouched (user did not pick those changes).
- Migration 0036 written by the lead and applied to live (user said "go ahead and apply the migration"). Found and fixed the old `week between 1 and 12` check, which would have rejected week 13. Verified: column present, check is 1–99, D's row at week 12.

## Round 0 · reviewer pre-check (13:00 UTC)
Reviewer read the spec and code before any edits and raised 10 risks. The lead turned them into decisions and sent them to the editor:
- Rounding: Math.round(x/2.5)*2.5. Deload aim = max(2.5, r(0.65 × best)); new-block start = max(r(1.05 × best), r(best) + 2.5). The spec example "26 kg" was wrong (it is 25).
- Recent best comes only from dated cloud logs, last 56 days, on the slot's current exercise id. Local s.log is not used (keyed by slot, no date).
- Assisted machines (logged weight is assistance) never get a kg target; the text says more or less assistance instead.
- The no-log fallback text has to read fine for bodyweight moves. Timed holds and conditioning get no load text.
- Ramp-in plus deload halves the sets once. The store refuses to switch off a scheduled deload. SwapModal also has to use the phase.
- deload_weeks is sanitised wherever it comes in (integers 1..99, deduped, sorted). weekPhase clamps garbage weeks.

## Round 1 · editor build + reviewer pass (13:20 UTC)
Built: 6-week block calendar (weekPhase), phase-aware prescription on every surface, load targets from dated logs, manual switch (toggleDeload), deload_weeks sync, README, 2 new test files. Commit 9fe48f5.
Measured: npm test 276/276 (baseline 229), typecheck clean. Reviewer adversarial cases 20/22 pass (2 fails = bodyweight bug). Page width 390 on all 8 phone screens (no overflow).
Reviewer scores (bar): rules 9 (10) · consistency 9.5 (9.5) · sync 9.5 (9.5) · copy 8 (9) · tests 8.5 (9) · code 9 (9). Verdict NOT YET.
Findings: [major] bodyweight moves told "go a little heavier" in a new block (also caught by lead); [minor] loaded machines with no logs never told to go lighter in a deload; [minor] static cue "last set all-out" contradicts the deload note; [minor] deload tip is a 12-line right-aligned column at 390 px; [nit] "~65%" → "about 65%".
Next: round 2, editor fixes all five; reviewer re-checks.

## Round 2 · fixes + re-review (13:45 UTC)
Editor fixed all five round-1 findings (2984430). Lead then applied the reviewer's optional nit: non-breaking space before "kg" so "aim 25 kg" never splits across lines; three test expectations updated.
Measured: npm test 278/278, typecheck clean. Reviewer adversarial cases 22/22. No horizontal overflow at 390 px or 1280 px, no page errors. D's first load traced against her live row (week 12, empty deload_weeks): opens on "Block 2 · Deload week", switch locked on; + goes to week 13 and saves (DB cap 99).
Reviewer scores (bar): rules 10 (10) · consistency 9.5 (9.5) · sync 9.5 (9.5) · copy 9 (9) · tests 9 (9) · code 9 (9). Verdict WOWED.
Known and left as is (pre-existing): "Log a past workout" pre-fills full plan set counts even in a deload week; she can adjust the steppers.

## Shipped
Stop check: every dimension at bar by the independent reviewer; time cap 3h not reached (about 1h). The user asked for no screenshots, so no stills gate. Pushed to ccr-c7b60f9e-h2i6l0; migration 0036 live. Not merged to main (no PR, per brief).
