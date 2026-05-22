---
title: "Thesis: A correctly-run FGW pile regimen satisfies the EPA PFRP windrow standard, but FGW's measurement instrumentation does not"
type: thesis
status: investigating
verdict: partially-supported
confidence: medium
core_claim: "FGW's 6-turn / 39-day cadence at 55–68 °C target satisfies 40 CFR §503 Appendix B PFRP windrow (≥5 turns at ≥55 °C for ≥15 days), but the 8mm-rod-5-sec hand-test is not TMECC-defensible, so a chapter pile is regimen-compliant without being measurement-compliant."
key_variables: ["turn count", "high-temperature duration", "temperature instrumentation"]
falsification: "If a calibrated multi-probe temperature log of an FGW-spec pile shows fewer than 5 turns occurring while temp ≥ 55 °C or fewer than 15 cumulative high-temp days, the regimen-compliance claim fails."
sources:
  - ../../raw/papers/2026-05-20-fgw-field-guide-2nd-edition.md
  - ../../raw/papers/2026-05-20-epa-40cfr-503-pfrp.md
  - ../../raw/papers/2026-05-20-epa-40cfr-503-32-class-a.md
created: 2026-05-20
updated: 2026-05-20
tags: [fgw, pfrp, tmecc, compost-standards, regulation, thesis]
---

# Thesis: FGW pile regimen satisfies PFRP windrow, but instrumentation does not

## Core claim

A correctly-run FGW compost pile **meets the EPA PFRP windrow regimen on paper**: at least 5 turns over a ≥15-day window with sustained temperature ≥ 55 °C. But FGW's hand-feel temperature heuristic is **not [TMECC](../../raw/papers/2026-05-20-epa-40cfr-503-pfrp.md)-defensible** — so a chapter pile is **regimen-compliant** but not **measurement-compliant**.

## Key variables

1. **Turn count** during the high-temperature window.
2. **Cumulative duration** at ≥ 55 °C internal temperature.
3. **Temperature instrumentation** — calibrated probe vs hand-feel rod.

## Testable prediction

If a chapter pile is built per the Field Guide and turned per `PILE_TURN_SCHEDULE_DAYS` = `[3, 6, 9, 19, 29, 39]`, AND a calibrated electronic probe logs internal temperature continuously, AND the temperature stays ≥ 55 °C for at least 15 cumulative days within the day-3-to-39 window, the pile satisfies PFRP windrow Alternative 5 of 40 CFR §503.

## Falsification criteria

This thesis fails if any of:
- Fewer than 5 turns occur within the high-temp window. (Field Guide says 5–6, app schedules 6 — so this only fails if the chapter skips turns.)
- Cumulative ≥ 55 °C duration is < 15 days. (Plausible failure: pile cools early due to wet weather, low manure load, or insufficient pile size below `PILE_MIN_DIMENSIONS`.)
- A calibrated probe contradicts the hand-feel test by > 5 °C consistently.

## Scope boundary (what's NOT part of this thesis)

- Class A pathogen *density* compliance ([40 CFR §503.32](../../raw/papers/2026-05-20-epa-40cfr-503-32-class-a.md)) — that requires lab testing (fecal coliform <1000 MPN/g, Salmonella <3 MPN/4g) which FGW does not prescribe.
- USCC STA Certified Compost — voluntary outcome-test program; out of scope.
- Whether FGW *yields better* than other methods — out of scope; see [FGW compost spec — academic standing](../topics/fgw-compost-academic-standing.md).

## Evidence For (regimen meets PFRP)

| Source | Evidence | Strength |
|---|---|---|
| [40 CFR §503 App B (windrow)](../../raw/papers/2026-05-20-epa-40cfr-503-pfrp.md) | Requires ≥5 turns and ≥15 days at ≥55 °C. | Strong (US regulation) |
| [FGW Field Guide turn schedule](../../raw/papers/2026-05-20-fgw-field-guide-2nd-edition.md) | Prescribes 5–6 turns at days 3/6/9/19/29/39 (36-day window). | Strong (primary source) |
| [FGW Field Guide temp target](../../raw/papers/2026-05-20-fgw-field-guide-2nd-edition.md) | Target 55–68 °C — explicitly above the PFRP floor. | Strong |

**On paper the regimen satisfies the regulation.** 6 turns ≥ 5; 36-day window ≥ 15 days; target temp ≥ 55 °C.

## Evidence Against (instrumentation gap)

| Source | Evidence | Strength |
|---|---|---|
| TMECC (USCC, blocked agent fetch — inferred) | Method 03.05 mandates calibrated electronic probe at multiple depths/locations on a defined sampling grid. | Moderate — primary doc not retrieved; inferred from secondary sources |
| FGW Field Guide hand-feel test | "8 mm steel rod, hold for 5 seconds, infer < or > 68 °C" — not calibrated, not gridded, not logged. | Strong (primary source) |
| FGW Field Guide moisture squeeze test | "If moisture drips out, too wet" — not gravimetric (TMECC 04.11 = oven-dry to constant mass at 105 °C). | Strong |

**The instrumentation gap is real**: a chapter pile may *be* PFRP-compliant in the moments the rod test happens to catch the right temperature, but a regulator-defensible record requires a continuous probe log.

## Nuances & caveats

- **Hand-feel is a useful field heuristic.** The rod test catches obvious problems (cold pile, way-too-hot pile) and is appropriate for chapter-level use where the pile is consumed within the chapter. Class A density compliance only matters if compost is sold or distributed beyond chapter members.
- **The 36-day window has slack.** Even if turn-3 fails (pile didn't reheat), the day-19 / day-29 / day-39 turns can rebuild the high-temp window. The schedule is fault-tolerant.
- **Pile size matters.** Below `PILE_MIN_DIMENSIONS` (1.5 × 1.5 × 2 m) the heat-and-decomposition floor is not reached — the Field Guide is explicit. So a downsized pile may fail the temperature floor regardless of regimen.
- **Cold-climate effects.** A late-summer build in WV (Zone 6b) carries the cure into winter; cold ambient temp cools the pile faster between turns. This is unstudied in the FGW literature; instrumented logs from Powder Keg would be valuable data.

## Verdict

**Status: Partially Supported.**
**Confidence: Medium.**

**Summary**: The FGW regimen *prescribes* a regimen that satisfies PFRP windrow on paper. The 6-turn / 39-day schedule with 55–68 °C target meets the federal floor for pathogen reduction. However, FGW's hand-feel instrumentation is not TMECC-defensible — a chapter pile is **regimen-compliant** without being **measurement-compliant**. To claim PFRP for any compost distributed beyond the chapter (sold, donated, given to non-member neighbors), a chapter would need a calibrated probe and a continuous temperature log.

**Strongest supporting evidence**: 40 CFR §503 Appendix B (regulation primary source) + FGW Field Guide turn schedule (regimen primary source) — both verbatim quoted.

**Strongest opposing evidence**: FGW's documented temperature instrumentation (rod hand-feel) is qualitatively, not quantitatively, validated.

**Key caveats**: pile size below minimum; cold-climate cooling; gravimetric moisture not measured.

**What would change this verdict**:
- An instrumented Powder Keg build with a calibrated probe over a full FGW cycle, showing actual temperature curves vs the PFRP floor → upgrade to **Supported (High Confidence)** if the data confirms the regimen.
- A Powder Keg build that fails to sustain ≥ 55 °C for 15 days (cold WV winter, undersized pile, etc.) → downgrade to **Insufficient Evidence**.
- Lab tests of finished compost showing fecal coliform > 1000 MPN/g → escalate to **Contradicted** for Class A density.

**Suggested follow-up theses**:
- "An FGW pile in USDA Zone 6b sustains ≥ 55 °C for ≥ 15 cumulative days when built between Aug 1 and Sep 30."
- "FGW finished compost Solvita-tests at maturity index ≥ 7 by month 6 of cure."
- "FGW vegetable-bed ratios (TBD from [Vegetable Guide](../../raw/papers/2026-05-20-fgw-vegetable-guide-2nd-edition.md)) produce different C:N than maize-scale ratios."

## See also

- Reference: [FGW Field Guide compost spec — verbatim](../references/fgw-field-guide-compost-spec.md).
- Concept: [FGW pile turn schedule](../concepts/fgw-pile-turn-schedule.md).
- Topic: [FGW compost spec — academic standing](../topics/fgw-compost-academic-standing.md).
- Sources: [40 CFR §503 App B PFRP](../../raw/papers/2026-05-20-epa-40cfr-503-pfrp.md), [40 CFR §503.32 Class A](../../raw/papers/2026-05-20-epa-40cfr-503-32-class-a.md), [FGW Field Guide 2nd ed](../../raw/papers/2026-05-20-fgw-field-guide-2nd-edition.md).
