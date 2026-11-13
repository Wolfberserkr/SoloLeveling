# Cook ledger: Jarvis dashboard redesign

Copy this to `cook/ROUNDS.md` at the start of a run. Keep the header current. Add one round entry per round, newest at the bottom. Label every number as measured or eyeballed.

Started: 2026-11-13 16:06 UTC
Time: floor none | cap 4h (ends 20:06 UTC)
Bar: layout 9 | light/depth 9 | color 9 | type/components 9 | density/clarity 9 | motion 9 (out of 10)
Calibration offset: [none yet] (from [user estimate, date])
Usage: 5h window, about 20% per hour, never 100%
Gate: stills approved no | republish not started
Best so far: r00 baseline (current live design)

## Decisions

Made without asking, one line each.
- 16:08 No outside references: image hosts are blocked by the egress proxy; the bar rests on the rubric and fresh critics, approved stills become the reference.
- 16:08 Shots are 8 fixed UI states rendered from the mock-data harness, so every round is comparable.
- 16:08 Critics see before (r00) on the left and the new round on the right, plus the rubric.

## User feedback inbox

Exact words. Close an item only when a still or clip proves it.
- 16:06 "redo this artifact using this skill" | open

---

## Round 01

Time: 16:06 to 16:15 | total elapsed 0.15h (clock)
Usage: not readable
Focus: whole system (the user's request), because r00 carried the HUD noise the brief bans

Changes:
- New tokens (calm navy, Inter, 16px radius), compact sticky top bar, view titles, sentence-case section titles
- Removed particles, radar sweep, pulses, data streams, scan shimmer, number flicker, ring orbit/glint, tile waves, bracket corners, em dashes
- Health rings in one swipe row, streaks card, attention as a left accent bar

Stills: `cook/stills/r01/` | Side by side: `cook/compare/r01/` (r00 left, r01 right)

Scores, eyeballed: critic median (2 critics: same model + Sonnet), no calibration yet

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 6.5 | 6 | 6 | 6 | 5.5 |
| S02 Health | 6 | 6 | 7 | 6.5 | 6 |
| S03 Agenda | 7 | 6 | 6 | 6.5 | 6.5 |
| S04 Money | 7 | 6 | 6 | 6.5 | 6.5 |
| S05 Sleep sheet | 7 | 7 | 5.5 | 7 | 7 |
| S06 Desktop | 5.5 | 6 | 5.5 | 6.5 | 6 |
| S07 Light | 6.5 | 4.5 | 5.5 | 6 | 5.5 |
| S08 More | 7 | 6 | 6.5 | 6.5 | 7 |

Own score (logged, never decides): about 7.5

Measured: shot harness, 0 page errors (playwright pageerror). Color per region not measured (no reference images).

Top gaps from critics:
1. Every card gets its own colored border or stripe; nothing stands out, the UI reads as permanently alarmed. Neutral chrome, one accent, semantic color only on small marks.
2. No hero metric: Home leads with a paragraph, Money with no big number.
3. Emoji as icons; light mode flat (no elevation, weak secondary text); desktop grid has dead areas and a centered rail.

Progress note sent: 16:15
Stop check: bar no | cap not reached | stills approved no -> next round
Next focus: neutral chrome + attention dots, Home hero, one icon set, Money hero, light-mode depth, desktop grid
---

## Round 02

Time: 16:15 to 16:23 | total elapsed 0.3h (clock)
Usage: not readable
Focus: color/accent system and hero metrics (both critics' weakest area in r01)

Changes:
- Neutral card chrome; attention is a pulsing dot by the card title
- Home: "Good afternoon" heading, quieter status text, readiness hero ring; desktop 12-column grid, rail top-aligned
- One stroke icon set replaces emoji in the UI; Money hero (spent this month + budget ring + savings line); smooth sparklines with gradient fill
- Copy: "Mark paid", "Apply suggestion", no debug-style command text; light-mode depth tokens
- Harness: waits for number count-up before capturing (r01 numbers were caught mid-roll)

Stills: `cook/stills/r02/` | Side by side: `cook/compare/r02/` (r01 left)

Scores, eyeballed: critic median (2 fresh critics: same model + Sonnet)

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 6 | 7 | 7 | 6 |
| S02 Health | 6.5 | 6 | 7 | 7 | 6 |
| S03 Agenda | 6 | 5.5 | 6.5 | 6 | 6 |
| S04 Money | 6.5 | 6 | 7 | 6.5 | 6 |
| S05 Sleep sheet | 7 | 7 | 6 | 7 | 7 |
| S06 Desktop | 5.5 | 6 | 7 | 7 | 5.5 |
| S07 Light | 7 | 6 | 7 | 7 | 6 |
| S08 More | 7 | 6 | 7 | 6.5 | 7 |

Measured: 0 page errors in the harness. Found and fixed after scoring: sparkline strokes were truncated by the dash-based draw-in (non-scaling stroke vs pathLength); sparklines now fade in.

Top gaps from critics:
1. Depth: every card the same flat surface; needs page, card and raised hero levels.
2. Secondary text: long "·" chains truncate or wrap and compete with hero numbers; readiness ring label unclear (readiness vs sleep score).
3. Agenda rows inconsistent; desktop row has empty cards; doubled nav badges; sheet header order inverted.

Stop check: bar no | cap not reached | stills approved no -> next round
Next focus: surface levels + hero cards, secondary-text hierarchy, agenda row system, desktop row heights
---

## Round 03

Time: 16:23 to 16:28 | total elapsed 0.4h (clock)
Usage: not readable
Focus: depth (surface levels) and secondary-text hierarchy, both critics' weakest areas in r02

Changes:
- Raised hero cards (readiness, money), quieter secondary cards
- Readiness: ring caption, labelled values, no repeated paragraph; HRV on desktop
- Money hero: consistent numbers; budgets card without legend; bills actions stacked
- Health streaks rewritten (no money in Health), date labels under trend tiles, fade cue on the ring row
- Agenda: one task row component (title, meta line), emoji stripped from event titles, solid hairlines
- Sheets: handle, title first; light mode top bar; alert line wraps instead of truncating; no doubled nav badges

Stills: `cook/stills/r03/` | Side by side: `cook/compare/r03/` (r02 left)

Scores, eyeballed: critic median (2 fresh critics: same model + Sonnet)

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 6 | 7 | 7 | 6.5 |
| S02 Health | 6.5 | 6 | 6.5 | 6.5 | 6.5 |
| S03 Agenda | 7 | 5.5 | 6.5 | 7 | 7 |
| S04 Money | 7 | 6 | 7 | 7 | 7.5 |
| S05 Sleep sheet | 7 | 7 | 6 | 7.5 | 7 |
| S06 Desktop | 5.5 | 6 | 7 | 6.5 | 5.5 |
| S07 Light | 7 | 6 | 6.5 | 7 | 6.5 |
| S08 More | 7 | 6 | 7 | 7 | 7 |

Measured: 0 page errors in the harness.

Top gaps from critics:
1. Depth still flat: concrete tokens suggested (base #0A0F14, borderless surface about 4% lighter, hero about 8% lighter with top highlight and 0 12px 32px shadow; light: white on #F1F3F6, tinted header).
2. Hero ambiguity (Readiness title vs Sleep score ring); greeting paragraph and alert banner too loud; zero streaks in the lead slot.
3. Desktop row voids; agenda gutter and checkbox styling; money ring repeats the headline, pace marker needs a caption; settings rows inconsistent.

Stop check: bar no | cap not reached | stills approved no -> next round
Next focus: elevation tokens, one metric per hero, quieter greeting and alerts, desktop grid, agenda checkbox and gutter, money pace
---

## Round 04

Time: 16:28 to 16:34 | total elapsed 0.5h (clock)
Usage: not readable
Focus: depth (critics' elevation tokens), one metric per hero, desktop grid

Changes:
- Elevation tokens (base #0A0F14, borderless surface, hero with top highlight and 0 12px 32px shadow), light page #F1F3F6
- One-sentence greeting, Voice moved to More, triage-style alert row
- Rings: whole numbers from 10, inline units (fixed a centering regression); health streaks moved last; a color per metric in trend tiles
- Agenda: "To do" gutter, light custom checkboxes; Money: pace chip instead of the duplicate ring, visible pace marker, bill status beside the name
- Desktop: 3 x 2 grid of equal-height cards; settings rows with descriptions and plain-language system names

Stills: `cook/stills/r04/` | Side by side: `cook/compare/r04/` (r03 left)

Scores, eyeballed: critic median (2 fresh critics: same model + Sonnet)

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 6.5 | 6.5 | 7 | 6 |
| S02 Health | 7 | 6 | 7.5 | 6.5 | 6 |
| S03 Agenda | 7 | 5.5 | 6.5 | 7 | 7 |
| S04 Money | 7 | 6.5 | 6 | 7 | 6.5 |
| S05 Sleep sheet | 6.5 | 6.5 | 5.5 | 7 | 6.5 |
| S06 Desktop | 6.5 | 6.5 | 7 | 7 | 6.5 |
| S07 Light | 7 | 6.5 | 6.5 | 7 | 6 |
| S08 More | 7 | 6 | 6.5 | 7 | 6.5 |

Measured: 0 page errors in the harness.

Top gaps from critics:
1. Data visualisation: charts have no y-axis, no latest-value marker, no target band, no legend, only two x labels.
2. Hero label still conflicts (Recovery title, Sleep score ring); pace chip reads muddy and "ahead of pace" is ambiguous.
3. Light-mode shadows faint, ring track pinkish; settings not list cells; ECG strip reads as decoration.

Stop check: bar no | cap not reached | stills approved no -> next round
Next focus: one chart component (y labels, gridlines, target band, latest dot, 4 x ticks, legend), hero label, pace chip, light shadows

## Round 05 (16:34–16:42 UTC)

Focus: one chart component.
- Sparklines: latest dot, hi/lo scale, target zone, 4 x ticks, a color per metric
- Bar charts: y gridlines with a right gutter, legend option
- Hero named after its ring ("Last night"); pace chip reads "on plan for day N" / "spending faster than planned"; heart-rate line labelled

Stills: `cook/stills/r05/` | Side by side: `cook/compare/r05/`

Scores, eyeballed: 2 fresh critics (I, J), median

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 7 | 7 | 7 | 7 |
| S02 Health | 7 | 7 | 7 | 7 | 6.5 |
| S03 Agenda | 6.5 | 7 | 7 | 6.5 | 7 |
| S04 Money | 7 | 7 | 6.5 | 7 | 7.5 |
| S05 Sleep sheet | 7 | 7.5 | 6.5 | 7 | 6.5 |
| S06 Desktop | 6.5 | 7 | 7 | 7 | 6.5 |
| S07 Light | 7 | 6.5 | 7 | 7 | 7 |
| S08 More | 6.5 | 7 | 7 | 7 | 6.5 |

Top gaps: no surface hierarchy beyond the hero; muddy tinted status fills (pace chip olive, notes brown); legend shows a color that is not in the chart; alerts are a run-on list; settings are stacked buttons, not list cells; briefing preview shows raw emoji and a faded cut line.

## Round 06 (16:42–16:44 UTC)

- Sleep and steps tiles as mini bar charts with a dashed target; a "vs avg" chip on every trend tile (good/bad by metric direction)
- Sleep sheet: the first fact is a full-width hero, plus the stage bar (deep / light / REM / awake)
- Legends list only the classes present; alert row reads "N need you · top item and N−1 more"; pace chip neutral with a status dot; nav dots hidden (counts only)

Stills: `cook/stills/r06/` | Side by side: `cook/compare/r06/` (r05 left). Not scored separately: folded into round 07.

## Round 07 (16:44–16:46 UTC)

- Notes: neutral surface with a 3px status edge (no more brown/maroon tints)
- Briefing preview: emoji stripped, three clean lines, no fade
- Settings: hairline list rows, whole row tappable with a chevron, full-width range control; Agenda mode control full width
- Desktop: Read aloud sits beside the status line; light mode gets 1px hairlines on cards, header and nav

Stills: `cook/stills/r07/` | Side by side: `cook/compare/r07/` (r06 left). Scores: pending (critics K, L).

Round 07 scores (critics K, L), eyeballed median:

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 6 | 7 | 7 | 6.5 |
| S02 Health | 6.5 | 6 | 7 | 6.5 | 6.5 |
| S03 Agenda | 6.5 | 6 | 6 | 7 | 6.5 |
| S04 Money | 6.5 | 6.5 | 6.5 | 7 | 6.5 |
| S05 Sleep sheet | 6 | 5.5 | 6.5 | 7 | 6 |
| S06 Desktop | 6.5 | 6 | 7 | 7 | 6.5 |
| S07 Light | 7 | 7 | 6.5 | 7 | 6.5 |
| S08 More | 6.5 | 6 | 6.5 | 7 | 7 |

Both critics: weakest is depth (cards on cards, no single raised hero, tiles nested in cards). Also the ring carousel reads as clipped, agenda rows mix four styles, and the cyan segmented control is the loudest thing on screen.
Calibration note: scores dropped about 0.5 from round 05 with different critics on more polished stills, so critic spread is about ±0.5. Track medians across rounds, not single scores.

## Round 08 (16:47–16:49 UTC)

- Agenda: one row component (time gutter, 22px glyph or checkbox, title, meta) for shifts, events, training, lights out and tasks; overdue on its own line
- Segmented controls neutral (raised grey), ring carousel sized for 3.3 cards
- Delta chip only at 10% or more; overdue bill gets the filled button; "Sleep plan" subhead in Next up
- Inset surfaces recessed (#0C1218), cards with a 4% top highlight; light mode coral #D9573F

## Round 09 (16:49–16:52 UTC)

- Stats inside cards: one surface with hairline rows instead of nested tiles; sheet hero card raised (surface-2 #1A2430)
- Hero card per screen: surface-2 plus a deeper shadow; light mode hero gets the strongest lift and the header rule is gone
- Ring carousel shows a visible peek of the 4th ring
- Desktop: Read aloud on the heading line, right edge; nav active state is a filled pill (no glow); inbox actions in a footer row

Stills: `cook/stills/r09/` | Side by side: `cook/compare/r09/` (r08 left). Scores: pending (critics M, N).
