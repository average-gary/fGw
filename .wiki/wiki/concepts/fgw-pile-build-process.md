---
title: "FGW pile build process"
type: concept
confidence: high
status: stable
sources:
  - ../../raw/papers/2026-05-20-fgw-field-guide-2nd-edition.md
created: 2026-05-20
updated: 2026-05-20
tags: [fgw, compost, build, layering]
---

# FGW pile build process

How to construct a Farming God's Way compost pile from the ground up, per the Field Guide. The fGw app's `src/routes/NewPile.tsx` wizard mirrors this process step-for-step.

## When to build

> *"Start collecting compost materials at crop canopy closure, or when there is plenty of green material around."*

For Powder Keg WV (Zone 6b), this points roughly to mid-summer (canopy closure of corn / cover-crop biomass), with the build typically falling in **August–September**. The pile then turns through fall and cures over winter, ready by spring planting. See [FGW seasonal calendar — Zone 6b translation](fgw-calendar-zone-6b.md) (TODO — gap; not yet authored).

## Site & dimensions

- Reference pile: **2 m × 2 m × 2 m** (drops to ~3.5 m³ finished, enough for 1 acre / 0.5 ha of maize).
- Minimum: **1.5 m × 1.5 m × 2 m** below this and the heat-and-decomposition floor is not reached.
- For larger fields, *"simply join compost piles together in long lines."*

The fGw app's pile presets — Standard 2×2×2, Large 4×4×3, Commercial 6×6×6 — derive directly from this guidance.

## Material gathering order

> *"Collect the dry, woody and manure ingredients first and pile them separately before collecting the green materials."*

This rule matters because greens degrade in days while browns are shelf-stable; gathering greens last keeps them fresh. The app's listings layer ([SPEC-011](../../../SPEC.md)) doesn't currently surface this ordering hint to listers — minor UX opportunity.

## Layer recipe (one complete layer)

In order, bottom up:

1. **10 cm woody** (maize cobs, stalks, branches, cardboard, wood shavings)
2. **10 cm dry** (thatch grass, leaves, weeds)
3. **20 cm green** (anything green when cut; use within 3–4 days)
4. **2 × 50 kg bags fresh manure** on top of the green
5. **50–60 L water** poured over the layer

That's 40 cm finished thickness per layer. Repeat 8–9 times to reach 2 m height.

## Why the order matters

- Woody at the base resists compaction and allows airflow up through the pile.
- Dry above woody acts as a wicking transition.
- Green provides the C-rich fuel that the bacterial mass converts.
- Manure on top introduces microbial inoculum *and* trickles N down with watering.
- Water binds the layer; drying out breaks fermentation, drowning kills aerobes.

## Material substitutions

The Field Guide is explicit:
> *"If there is no manure use 4 m³ of legumes."*

Other green-substitutions are practitioner-tradition rather than spec — see the [contested-agronomy topic](../topics/fgw-compost-academic-standing.md) for what gets argued about.

The app's `src/domain/materials.ts` taxonomy distinguishes manure (fresh/aged/poultry/rabbit), greens (grass/weeds/scraps/legumes), woody (stalks/branches/cardboard/shavings), and dry (leaves/thatch/straw). All four substitutability classes are honored.

## What good looks like

- **Color**: dark brown.
- **Smell**: sweet and rich. Anaerobic = bad smell, signals turning was missed or the pile got too wet.
- **Structure**: crumbly.
- **Microbiology**: thick fungal strands visible by eye.

## What goes wrong

- **No turn → anaerobic.** *"If the pile is not turned it will become anaerobic, have a bad smell and result in poor quality compost."*
- **Too much water cools the pile.** *"If you get excessively high rainfall, leave a gentle slope on the top of the pile and place thatch grass or grain bags on top to keep excess rain water off the pile, which can cool the pile too much."*
- **Above 68 °C.** *"If you allow the temperature to get above 68°C, desirable microbes get killed and carbon gets burned up and wasted."*

## See also

- Reference: [FGW Field Guide compost spec — verbatim](../references/fgw-field-guide-compost-spec.md).
- Concept: [FGW pile turn schedule](fgw-pile-turn-schedule.md).
- Topic: [FGW compost spec — academic standing](../topics/fgw-compost-academic-standing.md).
- Project code: `src/routes/NewPile.tsx` (the wizard); `src/domain/fgw.ts` (the constants); `src/domain/pileMath.ts` (`scaledIngredients`, `staffingEstimate`).
