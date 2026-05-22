---
title: "FGW Vegetable Guide (2nd edition)"
type: source-paper
source_url: "https://www.farming-gods-way.org/Resources/FGW_Vegetable_Guide_2nd_Edition.pdf"
authors: ["Foundations for Farming"]
publisher: "Foundations for Farming Intl."
edition: "2nd"
language_tag: "en-ZA"
page_count: 90
ingested: 2026-05-20
quality: 4
credibility: high
confidence: high
tags: [fgw, compost, vegetables, primary-source]
summary: "90-page Field-Guide companion specifically for vegetable beds. Source of the variant compost ratios that the project's SPEC.md references but never reproduces. Vegetable-bed compost typically calls for higher manure / finer materials than the maize-scale Field Guide recipe. The Field Guide explicitly defers to this manual: 'If making compost for vegetable plantings, please see the Vegetable Guide for guidelines on compost ingredient ratios.'"
---

# FGW Vegetable Guide (2nd edition)

90-page PDF; ~9.6 MB. The Field Guide's compost section explicitly punts to this manual for vegetable-bed ratios.

## Why ingested

The project's `src/domain/fgw.ts` only encodes the maize-scale ratios (10/45/22.5/22.5). The Vegetable Guide carries the *vegetable-bed* ratios — these will be needed when SPEC-021's pile wizard adds a "vegetable beds" preset (currently only Standard 2×2×2, Large 4×4×3, Commercial 6×6×6 ship).

## Status

- PDF identified, language tag `en-ZA`, 90 pages — confirms south-African origin; cold-temperate (Zone 6b WV) adaptations are not embedded.
- Not yet text-extracted.

## Cross-references

- Field Guide: [FGW Field Guide 2nd ed](2026-05-20-fgw-field-guide-2nd-edition.md).
- Trainer's edition: [FGW Trainer's Reference Guide 2nd ed](2026-05-20-fgw-trainers-reference-guide-2nd-edition.md).
- Project code that would gain a "vegetable" preset: `src/domain/fgw.ts` `PILE_PRESETS`.
