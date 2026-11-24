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
