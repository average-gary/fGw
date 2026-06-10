---
title: "fgw-full-guide — WHY"
type: project-rationale
created: 2026-06-09
status: active
---

# WHY: fgw-full-guide

Bundle the four primary Farming God's Way manuals (Field Guide 2nd ed,
Trainer's Reference Guide 2nd ed, Vegetable Guide 2nd ed, Master
Sequence Posters) inside the fGw application and the public website
(fgw.virginiafreedom.tech) as long-form, in-app Learn content with
extracted figures.

## Goal

Today the Learn route ships **five short summary pages** (Six Keys,
Compost Recipe, On Time, Planting Station, God's Blanket — SPEC-024).
After this project, Learn ships the **entire FGW practice library** as
verbatim text + extracted figures, navigable from a TOC, reachable
offline, served from one SPA build that hits both web and the Tauri /
Android bundles.

## Why now

- Distribution is in place. `alpha-bundle` ships the SPA to
  `fgw.virginiafreedom.tech` plus desktop installers and an Android
  APK. Adding content costs no new infra.
- Redistribution rights are confirmed (user has permission). The
  blocker that stopped a "full bundle" approach in earlier rounds is
  resolved.
- The Learn route already exists (`src/routes/Learn.tsx` + `?raw` MD
  imports + variable substitution into live constants). The content
  scaffold is the only missing piece — no architecture change.
- The chapter relies on these manuals for compost, planting, mulch,
  and seasonal timing. Today they need to download four PDFs from a
  third-party site; the app should be the canonical surface.

## What this is not

- Not a new doctrine layer. Verbatim text from the source manuals,
  with light editorial scaffolding (TOC, cross-links to live constants,
  Powder Keg WV addenda where the wiki has documented adaptations).
- Not a re-derivation. We're not rewriting FGW content; we're hosting
  it.
- Not a CMS. Markdown files in `src/content/learn/`, rendered by the
  existing Learn route. Same pattern as the current five pages.

## Constraints carried in

- App-existing markdown renderer is ~60 LOC and only supports h1-h3,
  paragraphs, bullets, bold, inline code, code fences, hr. No tables,
  no images, no numbered lists, no nested lists. Has to be extended or
  replaced (decision in the plan).
- Bundle size is a concern on mobile. Image extracts must be
  compressed; PDFs are not bundled.
- Source numbers (`PILE_*`, `MULCH`, `PLANTING_STATION`) must remain
  the source of truth — the Compost / Planting Station / Mulch chapter
  text must continue to substitute live constants, not hard-code 2.5
  cm / 60 cm / 55–68 °C in literal prose.
