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

Round 09 scores (critics M, N), eyeballed median:

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 6.5 | 6 | 6 | 6.5 | 6 |
| S02 Health | 6.5 | 6 | 7 | 6.5 | 6.5 |
| S03 Agenda | 6 | 5.5 | 6 | 6.5 | 6.5 |
| S04 Money | 6 | 5.5 | 6 | 6.5 | 6 |
| S05 Sleep sheet | 6 | 6.5 | 6 | 6 | 6 |
| S06 Desktop | 5.5 | 6 | 6 | 6.5 | 6 |
| S07 Light | 6.5 | 6.5 | 6.5 | 6.5 | 6 |
| S08 More | 6 | 6 | 6 | 6 | 6 |

Honest read: scores went down about 0.5 while the stills got visibly cleaner. Each round brings new critics, who find new things to dislike; the Sonnet critics sit near 6 whatever changes. Three rounds of critics agree on one thing: depth. Card vs page differs by only 2–3% lightness, and insets go darker than their parents.

## Round 10 (16:52–16:59 UTC)

- Surface tokens with visible steps: page #0A0E13, card #161D26, hero #212B37, insets lighter than their parent (#1B232D); light page #ECEFF3
- Money hero: one full-width number, one meta line, a budget bar with a pace marker and a status line (no boxed chip)
- One alarm color: the ring carries coral; the advisory pill and alert icon are neutral with a status dot
- Sleep debt only in the note (no duplicate, no orphan tile); week strip gets a legend and one shift color
- Harness: shots render in the Aruba time zone, so the header clock and "Updated" agree

Stills: `cook/stills/r10/` | Side by side: `cook/compare/r10/` (r09 left). Scores: pending (critics O, P).

Round 10 scores (critics O, P), eyeballed median:

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 6 | 7 | 7 | 7 |
| S02 Health | 7 | 6 | 7 | 7 | 6.5 |
| S03 Agenda | 7 | 6 | 7 | 7 | 6.5 |
| S04 Money | 7 | 6 | 6 | 8 | 6.5 |
| S05 Sleep sheet | 7 | 7 | 7 | 6.5 | 6.5 |
| S06 Desktop | 6 | 6 | 7 | 6.5 | 6.5 |
| S07 Light | 7 | 7 | 7 | 7 | 7 |
| S08 More | 7 | 6 | 6.5 | 7 | 7 |

Up about 0.5–1 from round 09 on most cells. Depth is still 6 on six of eight shots. Found a harness bug: the sleep sheet was captured mid count-up (48 vs 50), so the sheet wait is now 1600 ms.

## Round 11 (17:00–17:08 UTC)

- Hero: accent-tinted top-left glow over surface-2; alert row on a faint warn surface; notes are plain insight cards (no red edge)
- Durations read "50m", "3h 50m", "13h 48m" everywhere; a gridline label is dropped when it collides with the target label
- Trend tiles always show the delta chip (neutral "≈ avg" under 10%); sleep and steps bars that hit target turn green
- API spend: "% used" status line, the limit hint on its own row; systems rows shorter, status pills never wrap; ring units baseline-aligned
- Desktop: cards size to their content, briefing button pinned to the card bottom; light mode: muted text #4A5566, accent text darker for contrast

Stills: `cook/stills/r11/` | Side by side: `cook/compare/r11/` (r10 left). Scores: pending (critics Q, R).

Round 11 scores (critics Q, R), eyeballed median:

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 6 | 7 | 7 | 6.5 |
| S02 Health | 6 | 6 | 7 | 6 | 6 |
| S03 Agenda | 7 | 6 | 6.5 | 7 | 6.5 |
| S04 Money | 7 | 6 | 6 | 7.5 | 6.5 |
| S05 Sleep sheet | 7 | 7 | 7 | 7 | 7 |
| S06 Desktop | 5.5 | 6 | 7 | 6.5 | 6.5 |
| S07 Light | 7 | 7 | 7 | 7 | 7 |
| S08 More | 6 | 6 | 6 | 6.5 | 6.5 |

Flat against round 10. Measured: card pixels (22, 29, 38) on page (10, 14, 19); tiles have no border pixels, yet critics still report "1px borders" and the same plane. Found a real regression: the round 11 baseline rule pushed the ring units ("h", "%") to the top of the arc (measured unit y 165 vs value y 190). Fixed in round 12 (unit y 191).

## Round 12 (17:12–17:21 UTC)

- Ring units back beside the value (regression fix)
- More: section titles above grouped cards (iOS pattern); API spend smaller, one-line status
- Read aloud is an icon button in the header beside refresh; the greeting row is text only; one timestamp (subtitle clock removed, "Updated" on desktop only)
- A hero per screen: the Today card on Agenda and the Sleep tile on Health get the raised, accent-tinted surface
- Selected day chip tinted with an accent ring, not solid cyan; budget bars keep only the pace marker; light-mode alert row on white

Stills: `cook/stills/r12/` | Side by side: `cook/compare/r12/` (r11 left). Scores: pending (critics S, T).

Round 12 scores (critics S, T), eyeballed median:

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 6.5 | 7 | 7 | 6.5 |
| S02 Health | 7 | 6.5 | 7 | 7 | 7 |
| S03 Agenda | 7 | 6.5 | 7 | 7 | 7 |
| S04 Money | 7 | 6.5 | 6.5 | 8 | 7 |
| S05 Sleep sheet | 6.5 | 6.5 | 7 | 7 | 6.5 |
| S06 Desktop | 6 | 6 | 7 | 7 | 6.5 |
| S07 Light | 7 | 6.5 | 7 | 7 | 6.5 |
| S08 More | 6.5 | 6.5 | 6.5 | 7 | 7 |

Best round so far. The Sonnet critic gave 7 on every cell for the first time. Remaining: desktop ragged grid, Sleep plan inside Next up, an alert row that reads as disabled, the Health sleep tile raised for no reason, low-contrast secondary text.

## Round 13 (17:22–17:31 UTC)

- Desktop: a 12-column grid with the sleep hero at 5/12 (128px ring), Next up at 4/12 and the session at 3/12; rows fill the viewport
- Sleep plan moves into the sleep card as one "Tonight · lights out · wake" row; Next up is the shift only
- Alert row: coral 11% surface, a 3px coral edge, a bold "View ›", and a one-line ellipsis (warn-amber variant when nothing is urgent)
- Dark muted text raised to #9AA6B6; settings group headers share one muted style; the Health sleep tile is back to peer elevation
- "Sleep window 07:11–13:11" replaces "asleep → awake"; Mark paid is the same secondary style on every bill; light tab bar gets a hairline

Stills: `cook/stills/r13/` | Side by side: `cook/compare/r13/` (r12 left). Scores: pending (critics U, V).

Round 13 scores (critics U, V), eyeballed median:

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 7 | 6.5 | 7 | 6 |
| S02 Health | 7 | 6 | 6.5 | 7 | 6.5 |
| S03 Agenda | 7.5 | 6.5 | 7 | 7 | 7 |
| S04 Money | 7 | 6.5 | 6.5 | 7.5 | 7 |
| S05 Sleep sheet | 7 | 6.5 | 6 | 6.5 | 7 |
| S06 Desktop | 6 | 6.5 | 6.5 | 7 | 6 |
| S07 Light | 7 | 7 | 6 | 7 | 6 |
| S08 More | 7 | 6.5 | 7 | 7 | 6.5 |

Depth is up (6 → 6.5–7). The weakest is now color meaning. Coral marks a fair score and urgent items alike, Deep sleep was green on the ring and blue in the stage bar, and amber means both "on budget" and "warning". The alert text was also truncated mid-word.

## Round 14 (17:32–17:40 UTC)

- One color map. Data hues are fixed per metric and per sleep stage (rings, tiles, stage bar). Status: good green, watch amber, act red. The score ring is banded: under 60 amber, 60–79 accent, 80+ green, never red. The "vs avg" chip that is worse than average is amber, not red.
- Budgets: 75% amber, 90% red; API spend bar without the unexplained 80% tick
- Alert row: "View" becomes a chevron on phones so the reason fits; the card is labelled "Now" while the shift runs
- Agenda: a red "now" line with the time between past and upcoming items
- Sleep note leads with "13h 48m sleep debt"; stronger sheet scrim and shadow; ring tracks one step stronger; light page #E7EBF0

Stills: `cook/stills/r14/` | Side by side: `cook/compare/r14/` (r13 left). Scores: pending (critics W, X).

Round 14 scores (critics W, X), eyeballed median:

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 6.5 | 6.5 | 7 | 7 |
| S02 Health | 7 | 6.5 | 6.5 | 7 | 6.5 |
| S03 Agenda | 7 | 6.5 | 7 | 7 | 6.5 |
| S04 Money | 7 | 6.5 | 6.5 | 7 | 7 |
| S05 Sleep sheet | 7 | 7 | 7 | 7 | 6.5 |
| S06 Desktop | 6 | 6.5 | 7 | 7 | 6 |
| S07 Light | 7 | 7 | 6 | 7 | 7 |
| S08 More | 7 | 6.5 | 7 | 7 | 6.5 |

Holding at about 7. Specific misses: the amber ring sits on an amber-tinted track that reads as olive, the alert tint looks dirty on navy, the solid cyan Ask pill is the loudest thing on screen, the active tab shows its own badge, the selected segment is too faint, and the budget rows lead with a ratio instead of what's left.

## Round 15 (17:41–17:51 UTC)

- Ring tracks neutral (fg 11%) on every ring; light-mode amber ring #E09A16
- Alert row on the plain card surface with only the coral edge and icon
- Ask is a tinted accent pill; the active tab hides its badge; the selected segment is accent-tinted with an accent ring
- Advisory pill tinted to its status; agenda now line thinner and quieter
- Budgets lead with "ƒ20 left of ƒ500" (or "over"); Dining at 96% is red; the hero bar's pace marker is labelled "today"; durations never break inside "1h 55m"
- Desktop header loses its hairline

Stills: `cook/stills/r15/` | Side by side: `cook/compare/r15/` (r14 left). Scores: pending (critics Y, Z).

Round 15 scores (critics Y, Z), eyeballed median:

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 6.5 | 7 | 7 | 6.5 |
| S02 Health | 7 | 6 | 6.5 | 7 | 7 |
| S03 Agenda | 6.5 | 6.5 | 7 | 7 | 6.5 |
| S04 Money | 7 | 6.5 | 6.5 | 8 | 7 |
| S05 Sleep sheet | 6.5 | 6.5 | 7.5 | 7.5 | 6.5 |
| S06 Desktop | 6 | 6.5 | 7 | 7 | 6.5 |
| S07 Light | 7 | 7 | 7 | 7 | 7 |
| S08 More | 7 | 6 | 6.5 | 7 | 7 |

Plateau at 7 for four rounds (12–15). New, specific misses: the active-tab bar floats above the nav over content; "Morning shift" is as big as the greeting; an overdue task sits after the now line; Sleep and Deep share one blue; summary rings and detail charts share one surface; light-mode Ask pill too pale.

## Round 16 (17:52–18:01 UTC)

- Tab bar: the selected tab is a tinted pill behind its icon (nothing floats above the bar)
- Overdue tasks pin to the top of the day with a red "Overdue" gutter
- "Now" title 21px so the greeting leads; the "Last night" card drops the range average
- Health: summary rings sit on the page (no card), the charts below are the cards; sleep duration is periwinkle #8AB4FF, deep sleep a deeper #3E62CC
- Sleep debt lead number 19px; light-mode Ask is solid accent with white text; inbox "Apply suggestion" is the one primary button

Stills: `cook/stills/r16/` | Side by side: `cook/compare/r16/` (r15 left). Scores: pending (critics AA, AB).

Round 16 scores (critics AA, AB), eyeballed median:

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 7 | 6.5 | 7 | 6.5 |
| S02 Health | 6.5 | 6 | 6.5 | 7 | 6.5 |
| S03 Agenda | 7 | 7 | 7 | 7.5 | 6.5 |
| S04 Money | 7 | 7 | 6 | 8 | 7.5 |
| S05 Sleep sheet | 6.5 | 6.5 | 6.5 | 7 | 6.5 |
| S06 Desktop | 6 | 7 | 6.5 | 7 | 6.5 |
| S07 Light | 7 | 6.5 | 6.5 | 7 | 6.5 |
| S08 More | 7 | 7 | 7 | 7 | 7.5 |

Depth is now 7 on four shots. Color is the split: one critic wants status-only color and neutral data, while the rounds 13–14 critics asked for fixed data hues. Concrete misses: the verdict has no reason; the Money hero leads with spend, not with what is left; the Dining bar is a wall of red; the sheet stat grid leaves an orphan; the "in bed" window reads as conflicting with hours asleep.

## Round 17 (18:02–18:14 UTC)

- Money hero leads with "ƒ610 left" and "about ƒ33 a day for 18 days · spent ƒ1,180"; the bar is neutral, with status in the dot line
- Budget bars neutral until over 100%; a red "Ahead of pace for day 13" flag explains the risk in words
- Sleep verdict: the values behind "Take it easy" (sleep, body battery, REM) get an amber dot and color, so the reason is on the numbers
- Sleep sheet: score and restless side by side, "in bed 07:31 – 13:31" full width; sheet surface #0F141B so cards lift
- Inbox "Apply" back to secondary; harness: sheet captured after 2.8 s so the bars have finished growing

Stills: `cook/stills/r17/` | Side by side: `cook/compare/r17/` (r16 left). Scores: pending (critics AC, AD).

Round 17 scores (critics AC, AD), eyeballed median:

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 6 | 6.5 | 7 | 6.5 |
| S02 Health | 7 | 6 | 6.5 | 7 | 6.5 |
| S03 Agenda | 7.5 | 6.5 | 7 | 7 | 6.5 |
| S04 Money | 7 | 6 | 5.5 | 7 | 6.5 |
| S05 Sleep sheet | 7 | 6.5 | 7 | 6.5 | 7 |
| S06 Desktop | 5.5 | 6 | 6.5 | 7 | 6 |
| S07 Light | 7 | 7 | 7 | 7 | 6.5 |
| S08 More | 7 | 6 | 6 | 7 | 7 |

Neutral budget bars cost color points: both critics want the fill to carry status (round 16 asked for the opposite). Three amber dots read as noise. Desktop is the lowest shot for the eighth round running (equal-height rows leave dead space).

## Round 18 (18:15–18:32 UTC)

- Desktop masonry: 8px grid rows, each card spans rows by its measured height (ResizeObserver), dense packing, so every column stacks content-height cards with no voids
- Budget and hero bars: neutral when on plan, amber once a category runs more than 10 points ahead of pace, red over 100%; the flag text is amber to match
- Verdict: only the single worst value behind "Take it easy" gets the dot
- Phone: the "need you" row sits directly under the greeting, above the sleep card

Stills: `cook/stills/r18/` | Side by side: `cook/compare/r18/` (r17 left). Scores: pending (critics AE, AF).

Round 18 scores (critics AE, AF), eyeballed median:

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 6 | 7 | 7 | 6.5 |
| S02 Health | 7 | 6 | 6.5 | 7 | 6.5 |
| S03 Agenda | 7 | 6.5 | 7 | 7 | 7 |
| S04 Money | 7 | 6.5 | 6.5 | 7.5 | 7 |
| S05 Sleep sheet | 7 | 6 | 6.5 | 7 | 7 |
| S06 Desktop | 6 | 6 | 7 | 7 | 6.5 |
| S07 Light | 7 | 7 | 6.5 | 7 | 7 |
| S08 More | 7 | 6 | 6.5 | 7 | 7 |

Desktop layout split: one critic gives the masonry 7 (up from 5.5), the other 5 (ragged column bottoms). Grey "on plan" bars read as disabled; light-mode amber is still low contrast; the score ring has no state word.

## Round 19 (18:36–18:44 UTC)

- Bars: green on plan, amber ahead of pace, red over budget (one bar spec everywhere)
- Delta chips carry arrows ("↓ 19% vs avg"); overdue bill chip is solid red with white text
- Score caption carries its state ("Sleep score · fair", from Garmin's own quality word when present)
- Light mode: warn #9A6200 for text, ring amber #D98E0B, pale amber advisory pill, Ask outlined in both themes
- Sheets: 50% scrim with an 8px blur, raised sheet surface #131A22 with a top highlight

Stills: `cook/stills/r19/` | Side by side: `cook/compare/r19/` (r18 left). Scores: pending (critics AG, AH).

Round 19 scores (critics AG, AH), eyeballed median:

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 7 | 6.5 | 7 | 6.5 |
| S02 Health | 7 | 6 | 6.5 | 7 | 6.5 |
| S03 Agenda | 7 | 7 | 6.5 | 6.5 | 6.5 |
| S04 Money | 7 | 7 | 6 | 7.5 | 7 |
| S05 Sleep sheet | 7 | 6.5 | 7 | 6.5 | 7 |
| S06 Desktop | 6.5 | 6 | 6.5 | 7 | 6.5 |
| S07 Light | 7 | 6.5 | 6.5 | 7 | 7 |
| S08 More | 7 | 6.5 | 6.5 | 7 | 6.5 |

Small secondary text and low contrast is the shared note. "Ahead of pace" reads as good news. The "grey stub" bars in S05 were checked in a live browser: they measure 83–122px tall, so this is the viewport cropping the tops of tall bars, not a bug. The ECG strip that several critics call decoration is the live heart-rate feature the user asked for (Garmin polling), so it stays.

Decision (logged): a worker restart paused the session from about 18:55 to 21:30 UTC, past the 20:06 cap. Per the cap rule, round 20 is the last round.

## Round 20 (18:50–21:35 UTC, paused by the restart)

- Secondary text at least 13px (meta lines, captions, legends, kv labels) and one step brighter (dark muted #A3AEBD, light #44505F); axis labels 11.5px
- Delta chips larger; week-strip markers 4px with 6px task dots; settings group titles larger and brighter
- Budget flag says what it means: "ƒ263 over pace for day 13"

Stills: `cook/stills/r20/` | Side by side: `cook/compare/r20/` (r19 left). Scores: pending (critics AI, AJ).

Round 20 scores (critics AI, AJ), eyeballed median:

| Shot | Layout | Depth | Color | Type | Clarity |
|---|---|---|---|---|---|
| S01 Home | 7 | 6 | 7 | 7 | 7 |
| S02 Health | 7 | 6 | 6.5 | 7 | 7 |
| S03 Agenda | 7 | 6 | 7 | 7 | 6 |
| S04 Money | 7 | 6.5 | 6.5 | 7.5 | 7 |
| S05 Sleep sheet | 6.5 | 6 | 7 | 7 | 6.5 |
| S06 Desktop | 5.5 | 6 | 7 | 7 | 7 |
| S07 Light | 7 | 7 | 6.5 | 7 | 7 |
| S08 More | 7 | 6 | 7 | 7 | 6.5 |

## Stop check (final)

- Bar (9 on every cell): **not met**. Medians sat at about 7 from round 12 to round 20; depth is about 6 and is the weakest dimension by critic consensus, desktop layout 5.5–7 depending on the critic.
- Time: the 4 h cap (20:06 UTC) was passed during a worker restart; round 20 was finished and logged as the last round.
- Stills approved by the user: **not yet**. The live dashboard is still the pre-cook v14; nothing was published.

What is still below the bar, honestly:
1. Depth: critics keep reading cards as one plane, even with measured steps (page 10,14,19 / card 22,29,38 / hero 33,43,55). The next lever would be fewer cards (dividers instead of nested cards) rather than more steps.
2. Desktop: the masonry fixed the half-empty cards, but the columns end at uneven heights.
3. Recurring asks not done: a hypnogram with a time axis (needs per-minute stage data the sync doesn't store), leading icons and current values on settings rows, a "Tomorrow" divider before after-midnight agenda items, untimed tasks as their own group.
4. Critic disagreements left as decided: the ECG/heart-rate strip stays (user-requested live HR); fixed data hues per metric plus status colors only for warnings.

Start (pre-cook live v14) → end: critic medians about 5.5–7 → about 7, with 7.5–8 on Money type and clarity.
