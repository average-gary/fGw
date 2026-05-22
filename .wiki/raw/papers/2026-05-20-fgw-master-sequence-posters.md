---
title: "FGW Master Sequence Posters (Maize and Beans)"
type: source-paper
source_url: "https://www.farming-gods-way.org/Resources/FGW_Master_Sequence_Maize.pdf, https://www.farming-gods-way.org/Resources/FGW_Master_Sequence_Beans.pdf"
authors: ["Foundations for Farming"]
publisher: "Foundations for Farming Intl."
ingested: 2026-05-20
quality: 4
credibility: high
confidence: high
tags: [fgw, sequence, calendar, primary-source]
summary: "One-page bilingual (EN/FR) crop-sequence posters showing the seasonal timing of land prep, compost application, planting, weeding, top-dressing, harvest, and post-harvest. The closest official artefact to a 'compost calendar' — there is no standalone compost-sequence poster, so timing context lives inside these crop posters."
---

# FGW Master Sequence Posters

Two posters: Maize and Beans. Bilingual English / French. Together they map the FGW management calendar across the southern-Africa rainy season.

## Why ingested

- Authoritative timing reference for when in the season compost is *built* vs *applied*.
- Maps directly onto the project's notification scheduler (`src/lib/notifications.ts`): "compost build" should be triggered well before the planting window each crop demands.
- Useful for the eventual "compost calendar" learning page (`src/content/learn/compost-recipe.md` could link out to a "compost in the season" companion).

## Status

- Two PDFs identified; small enough to OCR locally.
- Not yet text-extracted.

## Climate-adaptation flag

These posters anchor on the southern-African summer-rainfall season (planting after first significant rains, typically Nov–Dec). For Powder Keg WV (USDA Zone 6b, snowy winter, hot summer) the *timing offsets* must be re-derived: WV last-frost is typically late April / early May; field corn planting window is May. The wiki should produce a `wiki/concepts/fgw-calendar-zone-6b-translation.md` article rather than copy these posters verbatim.

## Cross-references

- Parent: [FGW Field Guide 2nd ed](2026-05-20-fgw-field-guide-2nd-edition.md).
- Notification scheduler: `src/lib/notifications.ts` (already wires turn-day reminders; doesn't yet wire planting-window or harvest reminders — gap).
