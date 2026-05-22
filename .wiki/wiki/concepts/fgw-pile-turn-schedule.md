---
title: "FGW pile turn schedule"
type: concept
confidence: high
status: stable
sources:
  - ../../raw/papers/2026-05-20-fgw-field-guide-2nd-edition.md
created: 2026-05-20
updated: 2026-05-20
tags: [fgw, compost, turning, schedule]
---

# FGW pile turn schedule

The Farming God's Way Field Guide prescribes 5–6 turns over roughly 39 days, followed by a 4-month cure. The fGw app encodes this as `PILE_TURN_SCHEDULE_DAYS = [3, 6, 9, 19, 29, 39]` and auto-generates six [labor events](../../../SPEC.md) (NIP-52 kind 31923) at those offsets when a builder publishes a pile.

## The schedule

| Turn # | Day from build | Cadence |
|---|---|---|
| 1 | Day 3 | First-phase: every 3 days |
| 2 | Day 6 | First-phase |
| 3 | Day 9 | First-phase |
| 4 | Day 19 | Second-phase: every 10 days |
| 5 | Day 29 | Second-phase |
| 6 | Day 39 | Second-phase (optional 6th turn) |

Source: *"A simple guideline is to turn every 3 days for the first 3 turns and every 10 days for the next 2 or 3 turns. That is 5 or 6 turns. After 2 months the turning process is complete."*

After the last turn, the pile **cures for 120 days**.

## Why this cadence

The Field Guide ties the cadence to *temperature*, not the calendar. The 3/6/9 spacing matches the bacterial-mass surge in a fresh pile — temperature climbs fast, peaks within days, and falls as substrate is consumed. The 10-day gap thereafter accommodates fungal succession, which is slower.

> *"After the 5th or 6th turn, the compost will only get warm not hot and then drop further to ambient temperature during curing."*

The Field Guide also offers a **temperature-driven trigger**: turn when internal temperature exceeds 68 °C, regardless of the day count. *"1st turn after 3 days or when the temperature reaches 68°C."*

## What a turn does (mechanically)

> *"Mix the pile into the adjoining 2m*2m position using a pick, fork or a hoe, bringing the outside material into the inside and moving the inside material to the outside."*

Four functions per turn:
1. Maintains correct temperature (oxygen flush re-ignites bacteria).
2. Mixes ingredients.
3. Brings outside material into the high-temperature core (pathogen kill, weed-seed kill).
4. Allows moisture re-checking and adjustment.

## Staffing implications

A 2 m × 2 m × 2 m pile turn = roughly 8 m³ of material moved. The app's `staffingEstimate(dim, 'turn')` heuristic returns `ceil(volume_m³ / 4)` people at ≥ 1.5 hours — i.e. 2 people × 1.5 hr for the standard pile, scaling linearly. A 6 m × 6 m × 6 m commercial pile (216 m³) returns 54 people, which is the right magnitude only if the pile is processed in tranches.

## How the app surfaces this

- `src/lib/pile/schedule.ts` `generateTurnEvents(pile)` produces six NIP-52 events at +3/+6/+9/+19/+29/+39 days from `pile.plannedBuildDate`, snapped to 9:00 local time in the pile's timezone.
- `src/lib/notifications.ts` schedules local notifications for each upcoming turn (24 h prior; configurable via `PILE_DEFAULT_TURN_HOUR_LOCAL` constant).
- `src/routes/PileDetail.tsx` shows a turn-timeline component highlighting the next-due turn; SPEC-031 added cross-device republish so a turn marked "done" propagates to all members.

## Does this satisfy US pathogen-reduction law?

The 6-turn / 36-day high-temperature window comfortably exceeds the [40 CFR §503 Appendix B PFRP windrow](../../raw/papers/2026-05-20-epa-40cfr-503-pfrp.md) floor (5 turns / 15 days at ≥ 55 °C). See the dedicated thesis: [FGW pile regimen satisfies PFRP windrow](../theses/fgw-pile-satisfies-pfrp.md).

## Edge cases

- **Pile cools early.** If turn-3 doesn't recover temp above 55 °C, the pile may have run out of fuel. Field Guide doesn't address; practitioner remedy is to add fresh manure-and-green at the next turn.
- **Pile gets too wet.** Cap with thatch or grain bags before rain; resume turn schedule.
- **Missed turn.** Turn next available; the pile recovers but pathogen-kill confidence drops if the high-temp window contracts. Notify the chapter (the app does this by default — claim/RSVP fan-out).

## See also

- Reference: [FGW Field Guide compost spec — verbatim](../references/fgw-field-guide-compost-spec.md).
- Concept: [FGW pile build process](fgw-pile-build-process.md).
- Thesis: [FGW pile regimen satisfies PFRP windrow](../theses/fgw-pile-satisfies-pfrp.md).
- Project code: `src/lib/pile/schedule.ts`, `src/domain/fgw.ts` `PILE_TURN_SCHEDULE_DAYS`.
