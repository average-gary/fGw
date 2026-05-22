---
title: "FGW God's Blanket / mulch spec — verbatim reference"
type: reference
confidence: high
status: stable
sources:
  - ../../raw/papers/2026-05-20-fgw-field-guide-mulch-passages.md
  - ../../raw/papers/2026-05-20-fgw-field-guide-2nd-edition.md
  - ../../raw/papers/2026-05-20-van-donk-2011-mulch-depth.md
created: 2026-05-20
updated: 2026-05-20
tags: [fgw, mulch, gods-blanket, primary-source, reference, no-burn]
---

# FGW God's Blanket / mulch spec — verbatim reference

The numbers used by the fGw app's mulch spec, traced to their primary source. Companion to [FGW Field Guide compost spec — verbatim](fgw-field-guide-compost-spec.md). Closes round-2 assess research gap #16.

## Provenance chain

`src/domain/fgw.ts` `MULCH = { thickness_cm: 2.5, coverage: 1.0 }` → `src/content/learn/gods-blanket.md` template substitution → published [Field Guide 2nd ed](../../raw/papers/2026-05-20-fgw-field-guide-2nd-edition.md), enumerated as **Technology Key 2 of the Six** (page 16+) and restated in Management Key 2 (page 39).

The mulch spec is **practitioner-codified, not peer-validated** — see [FGW compost spec: academic standing](../topics/fgw-compost-academic-standing.md) for the same epistemological framing applied to compost.

## The spec

| Constant (in code) | Value | Source quote (Field Guide) |
|---|---|---|
| `MULCH.thickness_cm` | 2.5 | "100% Cover with God's Blanket that is 2.5cm thick" — restated 5× across the manual |
| `MULCH.coverage` | 1.0 (100%) | "100% surface coverage with God's Blanket that is 2.5cm thick" — Management Key 2 |
| (implicit rule) | no burning | "do not burn or even plough in God's blanket into the soil as God created it to be on the top" |
| (implicit rule) | no incorporation | "Do not plough or burn God's Blanket or work it into the soil" |
| (implicit rule) | seedling gap for non-maize | "With maize cover the entire surface of the field with God's blanket and 2.5cm thick. **For all other crops leave a 5cm gap to allow for germination to take place.**" |

That last rule is **important and not surfaced in the fGw app today**: the Learn page treats 100% coverage as universal, but the Field Guide itself qualifies it for non-maize crops. This is a UI gap — see [opportunities](#opportunities).

## Acceptable materials

The Field Guide does not give a single bulleted "acceptable materials" list. Materials are named across passages:

- **Crop residues / maize stalks** — "Leave the toppings in the field as God's blanket"
- **Hoed-down weeds** — "If lands are full of weeds, simply hoe them down at ground level and leave as God's Blanket"
- **Cover-crop biomass** — cover crops "build up the percentage cover of God's Blanket"
- **Generic "God's blanket/mulch"** as a catch-all
- **Compost-section overlap** — thatch grass, leaves, weeds (also listed as compost "dry material")

The fGw app's `MATERIAL_KINDS` in `src/domain/materials.ts` covers all of these (`dry-leaves`, `dry-thatch`, `dry-straw`, `green-grass`, `green-weeds`, `woody-stalks`, `mulch`).

## Replenishment loop

The Field Guide assumes the blanket is **renewed by post-harvest stalk lodging**:

> "Stand on the base of stem pushing the stalk down between the rows at a 30 degree angle. Stalk lodging improves blanket cover, reduces weeds and breaks the life cycle of maize stalk borer."

This year's residue → next year's blanket. Implication for the chapter: a chapter that distributes finished mulch beyond chapter members has less material to lodge into next season's blanket — the [compost-distribution policy gap](../theses/fgw-pile-satisfies-pfrp.md) flagged in round-2 assess applies here too.

## Rationale (per Field Guide)

> "By not burning the blanket or ploughing the soil, we create an ideal environment, cool and moist, for an abundance of organic life to exist. A healthy soil is a living soil."

The mulch is positioned as soil-microbiology infrastructure — moisture conservation + temperature moderation + biotic habitat — alongside its weed-suppression role.

## Where the spec is contested

### Depth (2.5 cm)

[van Donk et al. 2011](../../raw/papers/2026-05-20-van-donk-2011-mulch-depth.md), the only peer-reviewed RCT directly testing 2.5 cm as a study factor:
- 2.5 cm conserves soil moisture as well as 5 or 10 cm — *defensible* for the moisture rationale.
- 2.5 cm is **statistically equivalent to bare soil for weed suppression** — only 5+ cm suppresses weeds significantly.

The Field Guide claims 2.5 cm = effective weed control via "smother mulching." That claim is *unsupported* by the closest peer-reviewed RCT.

### Coverage (100%)

The peer-reviewed literature consensus (see [academic standing topic](../topics/fgw-compost-academic-standing.md), Ranaivoson et al. 2017) places the erosion-control inflection point at **~60% cover**, with diminishing returns above. USDA-NRCS CPS 329 ("No-Till") prescribes ≥30% cover. FAO CA prescribes "at least 30%" permanent soil cover. **FGW's 100% is a doctrinal absolute, not an agronomic optimum** — it sits 3.3× above the FAO/NRCS floor.

That doesn't mean 100% is *wrong* — coverage above 60% adds diminishing but non-zero benefit (further erosion control, more weed suppression at higher depth, more habitat for soil organisms). It means 100% is the maximalist pole, chosen for theological completeness as much as agronomy.

### Climate mismatch

The Field Guide's Southern-Africa rainy-season anchor doesn't address the **spring soil-warming penalty** in humid-continental climates. See [mulch spring-warming penalty concept](../concepts/mulch-spring-warming-penalty.md). For Powder Keg WV (Zone 6b), the unmodified 2.5 cm / 100% prescription costs emergence days every spring on heat-loving crops.

## How the fGw app surfaces this

- `src/domain/fgw.ts` `MULCH` constant — single-source-of-truth.
- `src/content/learn/gods-blanket.md` — Learn page; renders the constants via template substitution but does **not** currently surface (a) the maize-vs-other-crops gap rule, (b) the spring-warming caveat, or (c) the academic-standing context.
- `src/lib/notifications.ts` — does not currently schedule mulch-application reminders. The Field Guide says "Start approximately 2 months prior to your planting season" to gather mulch — a reminder candidate.

## Opportunities (build candidates from this article)

1. **Add the 5 cm gap rule to the Learn page**: when a chapter member's pile is feeding *vegetable* beds rather than maize, the universal "100% coverage" message is wrong per the Field Guide itself.
2. **Climate-adaptation banner on `gods-blanket.md`**: link to [mulch spring-warming penalty](../concepts/mulch-spring-warming-penalty.md). Already in round-2 assess as opportunity #3.
3. **Mulch-gathering reminder**: `src/lib/notifications.ts` could schedule a "start gathering mulch" reminder at `plantingDate - 60d` per Field Guide land-prep guidance.
4. **Acceptable-materials surfacing**: the Field Guide doesn't list materials in one place; the wiki does. The Learn page could pull from that list with citations.

## Cross-references

- Source: [FGW Field Guide mulch passages (verbatim)](../../raw/papers/2026-05-20-fgw-field-guide-mulch-passages.md).
- Companion compost reference: [FGW Field Guide compost spec](fgw-field-guide-compost-spec.md).
- Academic standing: [FGW compost spec — academic standing](../topics/fgw-compost-academic-standing.md) (same epistemology applies to mulch).
- Climate-mismatch concept: [mulch spring-warming penalty](../concepts/mulch-spring-warming-penalty.md).
- Depth study: [van Donk et al. 2011](../../raw/papers/2026-05-20-van-donk-2011-mulch-depth.md).
- Project code: `src/domain/fgw.ts` `MULCH`; `src/content/learn/gods-blanket.md`; `src/content/learn/six-keys.md` (Six Keys list).
