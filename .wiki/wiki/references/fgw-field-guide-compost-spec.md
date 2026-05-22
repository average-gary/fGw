---
title: "FGW Field Guide compost spec — verbatim reference"
type: reference
confidence: high
status: stable
sources:
  - ../../raw/papers/2026-05-20-fgw-field-guide-2nd-edition.md
  - ../../raw/notes/spec.md
created: 2026-05-20
updated: 2026-05-20
tags: [fgw, compost, primary-source, reference]
---

# FGW Field Guide compost spec — verbatim reference

The numbers used by the fGw app, traced to their primary source.

## Provenance chain

`src/domain/fgw.ts` constants → `src/content/learn/compost-recipe.md` template substitution → published [Field Guide 2nd ed](../../raw/papers/2026-05-20-fgw-field-guide-2nd-edition.md) (compost section, ~pp. 31–34 in the local extraction).

The Field Guide is **practitioner-codified, not peer-reviewed** — see [FGW compost spec: academic standing](../topics/fgw-compost-academic-standing.md). Treat the numbers as faithful to the manual but not independently validated.

## Pile dimensions

| Constant (in code) | Value | Source quote (Field Guide) |
|---|---|---|
| `PILE_REFERENCE_DIMENSIONS` | 2 m × 2 m × 2 m | "We suggest a compost pile size of 2m x 2m x 2m. When complete this will drop down to about 3.5m³, which is enough for 1 acre or 1/2 ha of maize inputs." |
| `PILE_MIN_DIMENSIONS` | 1.5 m × 1.5 m × 2 m | "It is not recommended that you reduce the starting size of the pile to below 1.5m long x 1.5m wide x 2m high, to ensure you get the necessary heat and decomposition." |

## Ingredients

| Constant (in code) | Value | Source quote |
|---|---|---|
| `PILE_INGREDIENT_RATIOS.manure` | 0.10 | "10% of your pile - 15 x 50kg bags of fresh manure. If there is no manure use 4m³ of legumes." |
| `PILE_INGREDIENT_RATIOS.green` | 0.45 | "45% of your pile – about 8m³. Anything that is green when cut. Preferably use within 3-4 days." |
| `PILE_INGREDIENT_RATIOS.woody` | 0.225 | "22.5% of your pile – about 4m³. Woody material encourages the fungal growth e.g. maize cobs, stalks, branches, cardboard and wood shavings." |
| `PILE_INGREDIENT_RATIOS.dry` | 0.225 | "22.5% of your pile – about 4m³. Dry material adds bulk e.g. thatch grass, leaves and weeds." |

The Field Guide is explicit: *"If making compost for vegetable plantings, please see the [Vegetable Guide](../../raw/papers/2026-05-20-fgw-vegetable-guide-2nd-edition.md) for guidelines on compost ingredient ratios."* — i.e. these are the **maize-scale** ratios. Vegetable-bed ratios are different and live in the Vegetable Guide.

## Layer recipe (per build layer; 8–9 layers per 2 m height)

| Constant | Value |
|---|---|
| `PILE_LAYER_RECIPE.woody_cm` | 10 |
| `PILE_LAYER_RECIPE.dry_cm` | 10 |
| `PILE_LAYER_RECIPE.green_cm` | 20 |
| `PILE_LAYER_RECIPE.manure_bags_50kg` | 2 |
| `PILE_LAYER_RECIPE.water_litres` | 50–60 L |
| `PILE_LAYER_RECIPE.layer_total_cm` | 40 |

Source quote: *"Build the pile layer by layer with the 4 main components - start with 10cm of woody, then 10cm of dry, then place 20cm of green, then 2 bags of fresh manure on top of that. Apply 50-60 liters of water using buckets onto this completed layer. This makes up one complete layer. Continue repeating complete layers and watering in until you get to the 2m height. There are usually 8-9 complete layers in a pile."*

## Turn schedule

`PILE_TURN_SCHEDULE_DAYS` = `[3, 6, 9, 19, 29, 39]` (days from build).

Source quote: *"1st turn after 3 days or when the temperature reaches 68°C... A simple guideline is to turn every 3 days for the first 3 turns and every 10 days for the next 2 or 3 turns. That is 5 or 6 turns. After 2 months the turning process is complete. Once complete, leave the compost to cure thoroughly for another 4 months."*

See: [pile turn schedule concept](../concepts/fgw-pile-turn-schedule.md), [satisfies PFRP windrow thesis](../theses/fgw-pile-satisfies-pfrp.md).

## Temperature

| Constant | Value | Source quote |
|---|---|---|
| `PILE_TEMP_RANGE_C.min` | 55 °C | "Ideal temperature range is between 55°C to 68°C" |
| `PILE_TEMP_RANGE_C.max` | 68 °C | (same) |

Field test: *"You can use a temperature probe for accurate readings. A cheap alternative is to use an 8mm steel rod instead. After inserting it into the pile for a few minutes, see if you can hold on it for 5 seconds. If you can the temperature is less than 68°C. If you cannot, it's ready for the pile to be turned."*

This hand-test is **not [TMECC](../theses/fgw-pile-satisfies-pfrp.md)-defensible**.

## Moisture

`PILE_MOISTURE_TARGET` = 0.50 (squeeze test).

Source quote: *"Try to keep the moisture content of your compost at 50%. ... If moisture drips out, it is too wet. If no water drips out, but on opening your hand the material does not hold its shape, then it is too dry. ... If squeezed, no extra moisture drips out and on opening your hand the material holds its form, then it is close to the desired 50% moisture content."*

## Cure

`PILE_CURE_DAYS` = 120.

Source quote: *"Once complete, leave the compost to cure thoroughly for another 4 months."*

## Indicators of good compost

Source quote (paraphrased table): "Dark brown colour. Sweet and rich smell. Crumbly structure. You should be able to see thick fungal strands."

## Other Field Guide constants used by the app

- **Planting station spacing**: 60 cm in-row × 75 cm rows. Organic input depth: 15 cm. Inorganic input depth: 8 cm.
- **Mulch ("God's Blanket")**: 2.5 cm thick, 100 % coverage.
- **Default turn hour (project convention, not in Field Guide)**: 9:00 local time. Choice documented in `src/domain/fgw.ts` as `PILE_DEFAULT_TURN_HOUR_LOCAL`.

## See also

- Concept: [FGW pile build process](../concepts/fgw-pile-build-process.md).
- Concept: [FGW pile turn schedule](../concepts/fgw-pile-turn-schedule.md).
- Topic: [FGW compost spec — academic standing & contested context](../topics/fgw-compost-academic-standing.md).
- Thesis: [FGW pile regimen satisfies PFRP windrow](../theses/fgw-pile-satisfies-pfrp.md).
- Companion manuals: [Trainer's Reference Guide](../../raw/papers/2026-05-20-fgw-trainers-reference-guide-2nd-edition.md), [Vegetable Guide](../../raw/papers/2026-05-20-fgw-vegetable-guide-2nd-edition.md), [Master Sequence Posters](../../raw/papers/2026-05-20-fgw-master-sequence-posters.md).
