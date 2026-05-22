---
title: "FGW Field Guide (2nd edition)"
type: source-paper
source_url: "https://www.farming-gods-way.org/Resources/FGW_Field_Guide.pdf"
authors: ["Foundations for Farming"]
publisher: "Foundations for Farming Intl."
edition: "2nd"
ingested: 2026-05-20
quality: 5
credibility: high
confidence: high
tags: [fgw, compost, primary-source, field-guide, mulch, planting-station]
summary: "Canonical Farming God's Way Field Guide currently distributed by farming-gods-way.org. Image-heavy PDF (~2.4 MB, 2009-era Photoshop CS4 metadata). Source of every constant in src/domain/fgw.ts (pile 2×2×2 m, ratios 10/45/22.5/22.5, 6-turn schedule at +3/6/9/19/29/39 days, 50% moisture, 55–68 °C, 120-day cure, 60×75 cm planting station, 2.5 cm mulch). Page citations in code reference pp. 31–34 — should be re-verified against this 2nd edition."
---

# FGW Field Guide (2nd edition)

The official, currently-distributed Farming God's Way Field Guide. Free PDF download from `farming-gods-way.org/Resources`.

## What this is

- The canonical compost specification reference for the entire FGW practice.
- Companion to the [Trainer's Reference Guide](2026-05-20-fgw-trainers-reference-guide-2nd-edition.md) (which carries the teaching-version diagrams).
- Translations exist in 9+ languages under `/Resources/Translations/` on the same site.

## What it covers (per local extraction at `/tmp/fgw-research/field-guide.txt` — see project transcript)

- The Six Technology Keys (no ploughing; 100% blanket cover at 2.5 cm; biodiversity; feed plants from the top; canopy cover; permanence).
- The compost section (in our extraction at lines 1215–1380): pile dimensions, ingredient table, layer recipe, turning schedule, temperature management, moisture management, indicators of good compost.
- The Management Keys (lines 1483+): On Time, To High Standards, With Minimal Wastage, With the Fruit of the Spirit.
- Planting station spec: 60 cm in-row × 75 cm rows; 15 cm organic input depth.
- The "On Time" calendar: land prep in off-season, planting on time, supplementary blanket / weeding / thinning / top dressing / sowing cover crops / harvest / post-harvest stalk lodging.

## Edition note (important for code citations)

The current online edition is labeled **2nd**. The project's `src/domain/fgw.ts` cites "FGW Field Guide pp. 31–34"; those page numbers were extracted from a copy of this PDF (see the local extraction in the project transcript). If the project's print copy was 1st edition the page numbers may differ.

## Why ingested

- Primary source for every FGW invariant in code.
- Authoritative anchor for the wiki's `wiki/references/fgw-field-guide.md` article.

## Limitations

- Image-based PDF — text not directly extractable without OCR. Project transcript already includes a `pdftotext` extraction (used during MVP development) but that may have introduced minor whitespace artefacts.
- Not peer-reviewed. The numbers are practitioner-codified, not validated against an independent comparator (TMECC, PFRP, Berkeley method). See [Spaling & Vander Kooy 2019](2026-05-20-spaling-vander-kooy-2019-fgw-contested.md) for the academic-standing critique.

## Cross-references

- Trainer's edition: [FGW Trainer's Reference Guide 2nd ed](2026-05-20-fgw-trainers-reference-guide-2nd-edition.md).
- Companion vegetable-bed manual with variant ratios: [FGW Vegetable Guide 2nd ed](2026-05-20-fgw-vegetable-guide-2nd-edition.md).
- Sequence posters: [FGW Master Sequence Posters](2026-05-20-fgw-master-sequence-posters.md).
- Project code that encodes these constants: `/Users/garykrause/repos/fGw/src/domain/fgw.ts`.
