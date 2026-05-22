---
title: "FGW Field Guide — God's Blanket / mulch passages (verbatim)"
type: source-paper
source_url: "https://www.farming-gods-way.org/Resources/FGW_Field_Guide.pdf"
local_extraction: "/tmp/fgw-research/field-guide.txt"
authors: ["Foundations for Farming"]
publisher: "Foundations for Farming Intl."
edition: "2nd"
ingested: 2026-05-20
quality: 5
credibility: high
confidence: high
peer_reviewed: false
authority: practitioner-manual
tags: [fgw, mulch, gods-blanket, primary-source, no-burn]
summary: "Verbatim Field Guide passages on God's Blanket / mulch — pulled from the local pdftotext extraction at /tmp/fgw-research/field-guide.txt. Closes the round-2 assess research gap #16 (MULCH constants in code without dedicated wiki reference article). Source for `MULCH = { thickness_cm: 2.5, coverage: 1.0 }` in src/domain/fgw.ts."
---

# FGW Field Guide — God's Blanket / mulch passages (verbatim)

The mulch / "God's Blanket" passages from the Field Guide 2nd edition. The Field Guide treats mulch as **Technology Key 2 of the Six** — alongside no-ploughing, biodiversity, top-feeding, canopy cover, and permanence — making it a doctrinal foundation, not an optional practice.

Local extraction at `/tmp/fgw-research/field-guide.txt` (1796 lines, `pdftotext -layout`); page numbers below derive from page-marker artifacts in that extraction.

## 1. Six Technology Keys — Key 2 named (p. ~16)

> "The six technology keys of Farming God's Way are:
> 1) No Ploughing
> 2) **100% cover with God's blanket that is 2.5cm thick**
> 3) Practicing biodiversity through rotations, and cover cropping
> 4) Feeding plants from the top
> 5) Ensuring canopy cover
> 6) Permanence"

— Field Guide lines 699–706.

## 2. Key 2 expanded — "do not burn or plough in" (p. ~17)

> "**2) 100% Cover with God's Blanket that is 2.5cm thick**
> God's Blanket has the potential to reveal God's promised abundance in our fields. It provides the ideal environment for the healing of the land to take place. So **do not burn or even plough in God's blanket into the soil as God created it to be on the top.**"

— lines 718–722.

## 3. Land Preparation — gather before the season; no burn (p. 19)

> "**2) Land Preparation**
> Start approximately 2 months prior to your planting season. … Collect large amounts of God's blanket/mulch to add to your field. **Do not plough or burn God's Blanket or work it into the soil.** … If lands are full of weeds, simply hoe them down at ground level and leave as God's Blanket."

— lines 801–810.

## 4. Application order — AFTER planting; crop-specific seedling-gap rule (p. 23)

> "Cover with fine, loose soil from the soil heap, until it is level with the surrounding soil surface. … **With maize cover the entire surface of the field with God's blanket and 2.5cm thick. For all other crops leave a 5cm gap to allow for germination to take place.**"

— lines 956–961.

This is the only place in the manual where the 2.5 cm rule is qualified: maize gets full coverage; *other crops get a 5 cm gap around each planting station*. The fGw app's `src/content/learn/gods-blanket.md` Learn page does not currently surface this distinction.

## 5. Smother mulching for weeds — restates the spec (p. 24)

> "**9) Weed Control** … Weeding is best done by smother mulching with **supplementary blanket cover at 100% cover and 2,5cm thick**." (note: comma-decimal in this restatement)

— lines 964–968.

## 6. Post-harvest stalk lodging adds to the blanket (p. 26)

> "**15) Post Harvest Stalk Lodging** Stand on the base of stem pushing the stalk down between the rows at a 30 degree angle. Stalk lodging improves blanket cover, reduces weeds and breaks the life cycle of maize stalk borer."

— lines 1043–1046. Lodging is the source-replenishment loop: this season's residue becomes next season's blanket.

## 7. "20 Reasons" — soil microbiology rationale (p. 28)

> "**Farming God's Way: By not burning the blanket or ploughing the soil**, we create an ideal environment, cool and moist, for an abundance of organic life to exist. A healthy soil is a living soil."

— lines 1152–1154.

## 8. Management Key 2 ("To High Standards") restates the spec (p. 39)

> "100% surface coverage with God's Blanket that is 2.5cm thick"

— line 1541. Recurring restatement of the doctrine in the management-keys section.

## 9. Acceptable materials — implied list

The Field Guide does **not** give a single bulleted "acceptable materials" list for mulch. Materials are named across passages:

- **Crop residues / maize stalks (toppings)**: "Leave the toppings in the field as God's blanket" (line 1034)
- **Hoed-down weeds**: "If lands are full of weeds, simply hoe them down at ground level and leave as God's Blanket" (line 810)
- **Cover-crop biomass**: cover crops "build up the percentage cover of God's Blanket" (line 1432)
- **Generic "God's blanket/mulch"**: line 805
- **Adjacent compost-section mention**: thatch grass, leaves, weeds named as compost "dry material" (line 1251) — same source pool as mulch

The fGw app's `MATERIAL_KINDS` in `src/domain/materials.ts` covers all of these (under `dry-leaves`, `dry-thatch`, `dry-straw`, `green-grass`, `green-weeds`, `woody-stalks`, `mulch`).

## 10. "Slash and burn" condemned (p. 39)

Under Key 3 "With Minimal Wastage / Man's Wastage":

> "Slash and burn agriculture"

— line 1580. Listed as a wastage practice; reinforces the no-burn rule.

## What's NOT in the Field Guide

- A single "acceptable materials" list. Implicit only.
- Quantitative material substitution rules (e.g., "if no straw, use X tons of grass").
- A maintenance / re-application schedule — the blanket is presumed to be renewed by lodged stalks each season but the gap year (early-season, before the previous crop residue is available) isn't addressed.
- **Spring soil-warming caveat** — entirely absent. The southern-Africa rainy-season anchor of the Field Guide does not encounter cold-spring soil-warming penalties.
- **Slug / vole habitat caveats** — entirely absent. Tropical/sub-tropical southern Africa has different mollusc/rodent dynamics than humid-continental WV.

## Cross-references

- Related reference: [FGW Field Guide compost spec — verbatim](2026-05-20-fgw-field-guide-2nd-edition.md) (compost section).
- Companion practitioner critique (mulch-vs-livestock-feed): [Andersson & Giller 2012](2026-05-20-andersson-giller-2012-heretics.md).
- System-level critique (no-till in wet climates): [Giller et al. 2015](2026-05-20-giller-et-al-2015-beyond-ca.md).
- Project code: `src/domain/fgw.ts` `MULCH` constant; `src/content/learn/gods-blanket.md` Learn page.
