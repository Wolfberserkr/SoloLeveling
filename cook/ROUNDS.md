# Rounds: Reset deload cycle

Start: 2026-11-24 12:45 UTC · Cap: 15:45 UTC · Baseline: 229/229 tests green, typecheck not yet run.

## Decisions
- Old cook run (Jarvis, shipped) archived to cook-archive/2026-11-13-jarvis/.
- Loop shape for a code task: an editor agent and a reviewer agent run in parallel. The reviewer studies the code and spec while the editor builds, then reviews the diff. Findings go back to the editor. Repeat until the reviewer signs off.
- Load base = max logged weight in 56 days, so deload weights never drag down the next target.
- Mobility days are skipped by the deload rule; conditioning is untouched (user did not pick those changes).
- Migration written, not applied to the live DB.

