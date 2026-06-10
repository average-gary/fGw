---
title: "Plan: include the entire FGW guide in the app and website"
type: plan
format: roadmap
project: fgw-full-guide
sources:
  - ../../wiki/references/fgw-field-guide-compost-spec.md
  - ../../wiki/references/fgw-gods-blanket-mulch.md
  - ../../wiki/topics/fgw-compost-academic-standing.md
  - ../../raw/papers/2026-05-20-fgw-field-guide-2nd-edition.md
  - ../../raw/papers/2026-05-20-fgw-field-guide-mulch-passages.md
  - ../../raw/papers/2026-05-20-fgw-trainers-reference-guide-2nd-edition.md
  - ../../raw/papers/2026-05-20-fgw-vegetable-guide-2nd-edition.md
  - ../../raw/papers/2026-05-20-fgw-master-sequence-posters.md
  - ../alpha-bundle/plan-alpha-bundle-2026-05-22.md
generated: 2026-06-09
articles_consulted: 12
decisions: 6
phases: 7
---

# Plan: include the entire FGW guide in the app and website

> Generated from the **compost-marketplace** wiki (12 articles consulted).
> Project rationale: [WHY.md](WHY.md).

## Executive Summary

Bundle the four primary Farming God's Way manuals (Field Guide 2nd ed,
Trainer's Reference Guide 2nd ed, Vegetable Guide 2nd ed, Master
Sequence Posters) into fGw as **long-form Learn content** with verbatim
text and extracted figure renders. Same SPA build serves
`fgw.virginiafreedom.tech` and the Tauri/Android bundles. Reuse the
existing `src/routes/Learn.tsx` pattern — markdown source under
`src/content/learn/<manual>/<section>.md`, `?raw` imports, variable
substitution into live `PILE_*` / `MULCH` / `PLANTING_STATION`
constants — so the in-app content stays cite-by-line traceable to the
manuals while the live numbers stay the single source of truth.

Two non-trivial pieces of work: (1) extending the in-house markdown
renderer to handle tables, images, and numbered lists; (2) extracting
PDF page renders to PNG and shipping them under `public/guides/`. The
licensing question is already resolved (user has permission).

## Architecture Decisions

### Decision 1: Reuse Learn.tsx + `?raw` markdown, do not introduce a CMS

**Context**:
[`src/routes/Learn.tsx`](../../../src/routes/Learn.tsx) already
markdown-renders `src/content/learn/*.md` via Vite's `?raw` import
suffix and substitutes `{{var}}` tokens against the live `PILE_*`,
`MULCH`, and `PLANTING_STATION` constants from `@/domain/fgw`. SPEC-024
codifies this. The five existing pages prove the pattern at a small
scale.

**Options considered**:
- A. Reuse the existing scaffold; expand `src/content/learn/` from a
  flat 5-file directory to a nested per-manual tree.
- B. Introduce a static-site-generator pipeline (Astro, Vitepress,
  MDX). Adds a build step; duplicates routing; breaks Tauri/offline
  guarantees.
- C. Move content to a runtime CMS (Strapi, Sanity). Requires network
  access, breaks offline, breaks the wiki's "constants are sacred"
  invariant (they'd live in two places).

**Decision**: **Option A.** The existing scaffold is exactly the right
shape for verbatim long-form content, and it preserves the live-constant
substitution path that the Compost / Planting Station / Mulch sections
depend on (per
[fgw-field-guide-compost-spec.md](../../wiki/references/fgw-field-guide-compost-spec.md)).
A CMS would force the manual numbers and the `src/domain/fgw.ts`
numbers to drift.

**Consequences**: No new dependencies. Markdown authoring time is the
schedule driver. The Learn route's nav must grow from a flat tab strip
into a TOC tree (Phase 2).

---

### Decision 2: Extend the in-house markdown renderer; do not pull in `marked`/`remark`

**Context**: The renderer in `Learn.tsx` is ~60 LOC and supports h1-h3,
paragraphs, bullets, bold, inline code, code fences, and hr. It does
not support **tables**, **images**, **numbered lists**, or **nested
lists** — all four of which the FGW manuals use heavily (especially the
Six Keys numbered list, the layer-recipe table, the timing tables, and
all figures).

**Options considered**:
- A. Extend the existing renderer with tables, images, ordered lists,
  and nested lists (~120 LOC additional).
- B. Replace with `marked` (~50 KB gz), `markdown-it`, or
  `react-markdown` + `remark-gfm`.

**Decision**: **Option A** — extend the in-house renderer. The
renderer is deliberately minimal and is currently a mechanically
auditable 60-LOC state machine; the SPEC comments call this out as a
deliberate choice (§ Learn.tsx top-of-file comment). Adding ~120 LOC
of hand-written GFM-table + image + ordered-list support is cheaper at
runtime and easier to test than vendoring a 50 KB markdown library plus
its plugins. It also keeps the renderer's behavior identical between
Tauri / web / Android.

**Consequences**: Phase 2 adds renderer features under tight test
coverage. Markdown authors must stick to the supported subset (a CI
lint can enforce this). If the manual sections ever need richer
typography (footnotes, math, callouts beyond a simple `> blockquote`)
this decision needs a revisit.

---

### Decision 3: Extract PDF pages to PNG; ship under `public/guides/figures/`

**Context**: The Field Guide is image-heavy and the Trainer's Reference
Guide is *mostly* diagrams (per
[trainers-reference-guide source-paper](../../raw/papers/2026-05-20-fgw-trainers-reference-guide-2nd-edition.md)).
Verbatim text without diagrams loses the practice's visual authority —
specifically the layer cross-section, the 60×75 cm planting station
grid, the turn-day cross-sections, and the seasonal sequence posters.
The user picked "extract page renders as PNG + bundle" over re-drawing
in SVG.

**Options considered**:
- A. `pdftoppm -png -r 150` per page → compress with `pngquant` /
  `oxipng` → ship under `public/guides/figures/<manual>/<page>.png`.
- B. Re-author every diagram in inline SVG. Higher fidelity, retina-
  crisp, themeable, but multi-week authoring.
- C. Skip diagrams (text-only). Loses the Trainer's Guide entirely.
- D. Vector-extract from the PDFs (pdf2svg). Mixed results on image-
  heavy PDFs; fonts would need to be embedded.

**Decision**: **Option A.** Renders preserve the manuals' authoritative
look-and-feel; compression keeps the bundle under control (target ≤ 5
MB total for figures across all manuals). SVG redesign is recorded as
a follow-up project, not a v1 blocker.

**Consequences**: A `scripts/extract-figures.sh` script lives in the
repo so re-extraction is reproducible (and updatable when FFI ships a
3rd-edition PDF). `public/guides/figures/` is the only new public
asset surface.

---

### Decision 4: Verbatim text + Powder Keg WV addenda boxes

**Context**: The user chose verbatim full text + light editorial
scaffolding. The wiki already documents three Zone-6b WV adaptations
the source manuals don't cover:
- [Spring soil-warming penalty](../../wiki/concepts/mulch-spring-warming-penalty.md)
  — pulling mulch back at planting for cold-spring soil warming.
- [Vegetable-bed ratios live in a different manual](../../raw/papers/2026-05-20-fgw-vegetable-guide-2nd-edition.md)
  — already noted in the Field Guide compost section but easy to miss.
- The Master Sequence Posters anchor on the southern-Africa rainy
  season; Powder Keg's planting windows are calendar-shifted (May
  field-corn vs Nov–Dec). Per the
  [academic-standing topic](../../wiki/topics/fgw-compost-academic-standing.md),
  the wiki's posture is to honor the framework while citing where it
  was developed.

**Decision**: Render manual text verbatim, but introduce a simple
**addendum block** convention (a markdown blockquote starting with a
known marker, e.g. `> **Powder Keg note:** …`) that the renderer
styles as a callout. Keep addenda short and citation-anchored to the
relevant wiki article.

**Consequences**: Readers see the manual as the manual, with chapter
context as visibly-distinct callouts — no doctrinal blurring. Renderer
gets a tiny extension (blockquote + callout style) which is part of
the Phase 2 work anyway.

---

### Decision 5: Same content for app and website (one SPA build)

**Context**: The user chose "same content, single SPA build." The
`alpha-bundle` plan
([plan-alpha-bundle-2026-05-22.md](../alpha-bundle/plan-alpha-bundle-2026-05-22.md))
already pins `fgw.virginiafreedom.tech` to one SPA build that's also
embedded into Tauri / Android. `vite.config.ts` `base` stays `/`; nginx
serves the same `dist/` that ships in the installers.

**Decision**: No web/app divergence. The Learn route is reachable on
all targets. SEO / public-static rendering is **not** in scope — that
would require pre-rendering, which fights the SPA's auth-gated
sections. If discoverability becomes a need, that's a follow-up project
(static prerender of just `/learn/*`).

**Consequences**: One source of truth, one build. Public visitors who
land on `/learn` see the guide identically to chapter members. Search
engines see a JS-rendered SPA — acceptable for v1.

---

### Decision 6: Tab-style topic switcher → nested TOC sidebar

**Context**: Today's Learn route uses a flat `flex-wrap` tab nav for
five topics. Bundling four manuals × N sections per manual blows past
that affordance.

**Decision**: Replace the flat tab nav with a collapsible TOC sidebar
on desktop / drawer on mobile. URL deep-linking via query param (e.g.
`/learn?manual=field-guide&section=compost`) so internal cross-links
work.

**Consequences**: `Learn.tsx` grows a TOC component + URL-state
plumbing. `initialTopic` test prop expands to `initialManual` +
`initialSection`. Existing five-topic tests need update.

---

## Implementation Phases

### Phase 1: Source acquisition + provenance manifest (1–2 hours)

**Goal**: Get the four primary PDFs into `.wiki/raw/papers/<file>.pdf`
verbatim and produce a deterministic manifest for downstream phases.

**Tasks**:
- [ ] Download:
  - `FGW_Field_Guide.pdf` (2nd ed; ~2.4 MB)
  - `FGW_Trainers_Reference_Guide.pdf` (2nd ed; >10 MB)
  - `FGW_Vegetable_Guide_2nd_Edition.pdf` (~9.6 MB, 90 pages)
  - `FGW_Master_Sequence_Maize.pdf`, `FGW_Master_Sequence_Beans.pdf`
  All from `https://www.farming-gods-way.org/Resources/`. Save under
  `.wiki/raw/papers/pdfs/` (do **not** ingest into the source tree;
  PDFs stay in the wiki for provenance, not bundled with the SPA).
- [ ] Compute and record SHA256 + byte-size + retrieval date in
  `.wiki/raw/papers/_pdfs-manifest.md` (frontmatter table).
- [ ] OCR-validate `pdftotext -layout` extractions (Field Guide already
  has one; do the same for the other three) and stash under
  `.wiki/raw/papers/extracts/`.

**Dependencies**: None.

**Validation**: Manifest hashes match. Five PDFs present.
`grep -c "Compost"` on Field Guide extract returns ≥ 30 (sanity).

**Wiki grounding**:
[fgw-field-guide-2nd-edition.md](../../raw/papers/2026-05-20-fgw-field-guide-2nd-edition.md)
already lists the canonical URLs and the existing `pdftotext`
extraction at `/tmp/fgw-research/field-guide.txt`. The extraction
should move into the wiki's `.wiki/raw/papers/extracts/` so it
persists outside `/tmp`.

---

### Phase 2: Markdown renderer extensions + tests (3–4 hours)

**Goal**: Extend `Learn.tsx`'s in-house renderer to handle the manuals'
markup needs without adding dependencies.

**Tasks**:
- [ ] Numbered lists (`1. `, `2. `, …) — collect like bullet lists,
  emit `<ol>`.
- [ ] Nested bullet/numbered lists (one level deep) — detect 2-space
  indented continuation that starts with `- ` or `1. `.
- [ ] GFM tables — detect `| … |` line followed by `| --- | --- |`
  separator; emit `<table>` with `<thead>`/`<tbody>` and Tailwind
  border styling.
- [ ] Images — `![alt](path)` → `<img src={path} alt={alt}
  className="…">`. Resolve relative paths against `/guides/figures/…`.
- [ ] Blockquotes (`> `) with optional callout marker
  (`> **Powder Keg note:** …`) → blockquote with chapter-callout
  styling (per Decision 4).
- [ ] Anchor IDs on headings (slug from heading text) for in-page
  jumps and TOC cross-links.
- [ ] Vitest cases for each new feature in `Learn.test.tsx` (one per
  feature). Don't break existing five-topic tests.

**Dependencies**: None.

**Validation**: `pnpm test` green. Snapshot of a sample manual section
that exercises tables + numbered lists + an image renders cleanly.

**Wiki grounding**: The Field Guide compost spec is presented as a
**numbered/tabular layer recipe** (per
[fgw-field-guide-compost-spec.md § Layer recipe](../../wiki/references/fgw-field-guide-compost-spec.md))
— rendering this verbatim demands tables and ordered lists. The Six
Keys section is a numbered 1–6 list (per
[mulch passages § Six Technology Keys](../../raw/papers/2026-05-20-fgw-field-guide-mulch-passages.md)).

---

### Phase 3: Figure extraction pipeline (2–3 hours)

**Goal**: Reproducible PNG extracts of the manuals' diagram pages,
under `public/guides/figures/<manual>/<page>.png`, compressed.

**Tasks**:
- [ ] `scripts/extract-figures.sh` — `pdftoppm -png -r 150 <pdf>` per
  manual into a temp dir; `pngquant --quality=70-85` then `oxipng -o
  4 --strip safe`.
- [ ] Curate the extract: keep only diagram pages (skip cover, TOC,
  pure-text pages). Target ≤ 5 MB across all manuals.
- [ ] Place under `public/guides/figures/`:
  - `field-guide/six-keys-overview.png`
  - `field-guide/pile-layer-cross-section.png`
  - `field-guide/turn-schedule.png`
  - `field-guide/planting-station-grid.png`
  - `trainers-guide/<diagrams>.png`
  - `vegetable-guide/<diagrams>.png`
  - `sequence-posters/maize.png`, `beans.png`
- [ ] Source-page-number caption metadata in
  `public/guides/figures/_captions.json` so authors can cite "Field
  Guide p. 23" alongside each image.

**Dependencies**: Phase 1 (PDFs in place).

**Validation**: `du -sh public/guides/figures/` ≤ 5 MB. Each PNG opens
in a browser. `_captions.json` validates against a small JSON schema.

**Wiki grounding**: The Trainer's Reference Guide's source-paper note
calls out that "diagrams haven't been ingested into the wiki yet;
they're the missing artefact in
`wiki/concepts/compost-pile-build.md`." This phase is the reusable
extraction.

---

### Phase 4: Authoring — Field Guide (4–6 hours)

**Goal**: Convert the Field Guide into long-form markdown under
`src/content/learn/field-guide/`.

**Tasks**:
- [ ] Create directory layout:
  ```
  src/content/learn/
  ├── _index.ts              ← TOC manifest (manuals → sections)
  ├── field-guide/
  │   ├── 00-introduction.md
  │   ├── 01-six-keys.md     ← supersedes top-level six-keys.md
  │   ├── 02-land-prep.md
  │   ├── 03-planting-station.md  ← supersedes planting-station.md
  │   ├── 04-on-time.md      ← supersedes on-time.md
  │   ├── 05-compost.md      ← supersedes compost-recipe.md
  │   ├── 06-gods-blanket.md ← supersedes gods-blanket.md
  │   ├── 07-management-keys.md
  │   ├── 08-twenty-reasons.md
  │   └── 99-sources.md
  ```
- [ ] Author each section verbatim from the Field Guide extract,
  preserving every numbered passage, table, and quote. Insert
  `{{var}}` tokens for every `PILE_*`, `MULCH`, and
  `PLANTING_STATION` value (per
  [fgw-field-guide-compost-spec.md § Provenance chain](../../wiki/references/fgw-field-guide-compost-spec.md)).
- [ ] Insert figure references via `![caption](/guides/figures/field-guide/...png)`.
- [ ] Insert Powder Keg WV addendum blockquotes where the wiki
  documents them (cold-spring soil warming, vegetable-bed ratio
  pointer, Zone-6b calendar offset note).
- [ ] Migrate the existing five short pages' content into the
  expanded sections, then delete the old top-level files.
- [ ] Update `Learn.tsx` to import the new tree (per Phase 6).

**Dependencies**: Phase 1 (extracts), Phase 2 (renderer features),
Phase 3 (figures).

**Validation**: Visual review against the Field Guide PDF. All `{{var}}`
tokens resolve (no `{{` remains in rendered output — Vitest assertion).
All figures load.

**Wiki grounding**: This phase is the verbatim-ingest of the Field
Guide. The compost section's provenance chain is already documented
section-by-section in
[fgw-field-guide-compost-spec.md](../../wiki/references/fgw-field-guide-compost-spec.md);
this phase puts that text into the app surface.

---

### Phase 5: Authoring — Trainer's Guide, Vegetable Guide, Sequence Posters (4–6 hours)

**Goal**: Same shape as Phase 4 for the remaining three manuals.

**Tasks**:
- [ ] `src/content/learn/trainers-guide/` — mostly diagrams + walk-
  throughs; each section is a small explainer + 1–3 figure references
  with Trainer's Guide page-number captions.
- [ ] `src/content/learn/vegetable-guide/` — full text. **Add the
  variant compost ratio table** (vegetable-bed) and link the Pile
  wizard's deferred "vegetable" preset (SPEC-053) to this section. Per
  [vegetable-guide source-paper](../../raw/papers/2026-05-20-fgw-vegetable-guide-2nd-edition.md),
  this manual is 90 pages — section it heavily (8–12 sections) so each
  page stays scrollable.
- [ ] `src/content/learn/sequence-posters/` — two pages (maize, beans)
  with the figure embedded full-width and a "Powder Keg WV calendar"
  addendum box that points at
  [`fgw-calendar-zone-6b-translation.md`](../../wiki/concepts/fgw-calendar-zone-6b-translation.md)
  if/when that wiki article exists, otherwise an open-question
  placeholder.
- [ ] Update the TOC manifest (`_index.ts`) to register the new
  manuals.

**Dependencies**: Phases 1–3.

**Validation**: Same as Phase 4: visual parity against PDFs, no
unresolved `{{vars}}`, figures load, TOC navigation reaches every page.

**Wiki grounding**:
- Trainer's Reference Guide: per
  [trainers-reference-guide source-paper](../../raw/papers/2026-05-20-fgw-trainers-reference-guide-2nd-edition.md),
  cite Trainer's Guide page numbers separately from Field Guide page
  numbers — same content but different pagination.
- Vegetable Guide: variant ratios are explicitly different from maize-
  scale and live in this manual per
  [fgw-field-guide-compost-spec.md § Ingredients](../../wiki/references/fgw-field-guide-compost-spec.md).
- Sequence Posters: the wiki flags climate-adaptation explicitly per
  [master-sequence-posters source-paper § Climate-adaptation flag](../../raw/papers/2026-05-20-fgw-master-sequence-posters.md).

---

### Phase 6: Learn route TOC nav + URL deep-linking (3–4 hours)

**Goal**: Replace the flat tab strip with a manual-grouped TOC; deep-
link sections via URL.

**Tasks**:
- [ ] `src/routes/Learn.tsx` — replace `TopicId` union with a
  `{manual, section}` pair sourced from `src/content/learn/_index.ts`.
- [ ] Sidebar component (desktop) / drawer component (mobile):
  collapsible per manual, current section highlighted, section
  numbers visible.
- [ ] URL state via `react-router-dom` `useSearchParams`:
  `?manual=field-guide&section=05-compost`. Default → `field-guide` /
  `00-introduction`.
- [ ] Internal markdown links across sections (`[see compost](/learn?manual=field-guide&section=05-compost)`)
  resolve via the renderer recognizing `/learn?…` hrefs.
- [ ] **Sources & licensing page** — a top-level non-manual entry in
  the TOC linking to the FFI permission record + each manual's source
  URL + the wiki's
  [academic-standing topic](../../wiki/topics/fgw-compost-academic-standing.md)
  for honest scope.
- [ ] Update `Learn.test.tsx` for the new shape; keep `initialTopic`
  semantics by remapping it to `{manual:'field-guide',section:topic}`.

**Dependencies**: Phases 4 + 5 (content needs to exist before nav can
exercise it).

**Validation**: Manual QA across web + Tauri + Android. Deep-link
URL → correct section. Browser back/forward navigates section history.
Mobile drawer opens / closes.

**Wiki grounding**: The existing Learn route's design is documented in
[SPEC.md § SPEC-024](../../../SPEC.md). This phase keeps SPEC-024's
contract while expanding the topic surface.

---

### Phase 7: SPEC update + alpha-bundle re-cut + chapter announcement (1–2 hours)

**Goal**: Land the SPEC update, ship a re-cut alpha that includes the
guide, announce to Powder Keg.

**Tasks**:
- [ ] **SPEC-024 update**: extend the Learn contract from "five
  markdown-rendered FGW pages" to "the four primary FGW manuals as
  long-form Learn content with figure renders + TOC nav + URL deep
  links." Cite this plan.
- [ ] Open a follow-up SPEC-XXX (placeholder name: SPEC-057
  "vegetable-bed pile preset") wiring SPEC-053's deferred vegetable
  ratios into the Pile wizard now that the manual content exists.
- [ ] Bump version → `v0.1.0-alpha.2` (or `v0.2.0` if user prefers
  signaling the content milestone). Re-cut the alpha-bundle deploy
  per
  [plan-alpha-bundle-2026-05-22.md § Phase 2 + 6](../alpha-bundle/plan-alpha-bundle-2026-05-22.md).
- [ ] INSTALL.md update: mention the in-app Learn library so testers
  know it's there.
- [ ] DM the Powder Keg testers via the existing crash-report /
  member-DM path.

**Dependencies**: Phases 1–6 complete.

**Validation**: `fgw.virginiafreedom.tech/learn` shows the full
library; Android APK + desktop installers do too; chapter members can
reach all sections offline.

**Wiki grounding**: alpha-bundle's
[Phase 6 distribution runbook](../alpha-bundle/plan-alpha-bundle-2026-05-22.md)
already covers the redeploy mechanics; this phase just exercises it.

---

## Risks & Mitigations

| Risk | Source | Mitigation |
|------|--------|------------|
| Bundle size balloons past mobile-friendly limits | Trainer's + Vegetable Guide PDFs are 10+ MB and 9.6 MB respectively; raw page renders at 150 dpi can hit 1–2 MB each | Curate aggressively in Phase 3; `pngquant` + `oxipng`; hard ≤ 5 MB total figure budget; if exceeded, drop dpi to 120 or omit non-essential figures |
| Live-constant substitution drifts from the manuals | The `PILE_*` constants in code are the single source of truth, but verbatim manual text says "2.5 cm thick" / "55–68 °C" / "60 cm × 75 cm" in literal prose | Author Phase 4/5 markdown to use `{{var}}` tokens **everywhere** the manual states a number that has a code equivalent; CI lint that scans `src/content/learn/**/*.md` for hard-coded numeric+unit patterns ("2.5 cm", "55", etc.) and flags them |
| Manual numbers are not peer-reviewed | [fgw-compost-academic-standing.md](../../wiki/topics/fgw-compost-academic-standing.md) — the spec is practitioner-codified, not validated against TMECC/PFRP/Berkeley | Phase 6 ships a "Sources & licensing" page that cites the academic-standing topic; do not over-promise yield in any chapter prose |
| Source-manual pagination changes if FFI publishes a 3rd edition | Editions matter — the current online edition is 2nd, but `src/domain/fgw.ts` cites pages from a 1st-edition print copy in places | Manifest in Phase 1 records exact retrieval date + SHA256; re-extraction is a single `scripts/extract-figures.sh` invocation; cite "Field Guide 2nd ed." everywhere |
| Renderer extensions ship a regression in the existing five pages | Phase 2 modifies a state machine that all current Learn pages depend on | Add a Vitest snapshot per existing topic before any Phase 2 work; no Phase 2 PR merges if a snapshot changes unexpectedly |
| Mobile drawer affordance buried | Today's tab strip is one tap; the drawer is at least two | Side-mount drawer toggle in the Learn header next to the back button (per existing `<Button variant="ghost">` placement); show current-section breadcrumb in the header so the next section is one tap; keep "previous / next section" links at the bottom of every page |
| Climate-mismatch confuses chapter members | The four manuals are southern-Africa-rainy-season-anchored; Powder Keg is humid-continental Zone 6b | Phase 4/5 inserts Powder Keg WV addendum blockquotes (per Decision 4) at the three locations the wiki documents adaptations; don't silently rewrite the source text |
| Public exposure of guide draws a takedown despite permission | Permission was given verbally; if it's not written, FFI could revoke | Phase 7 — capture the permission in writing (email or signed doc) before re-cutting the public alpha; if not yet captured, gate `/learn` behind chapter-member auth as a temporary fallback |

## Open Questions

- **Which sections of the Trainer's Reference Guide are the diagrams?**
  Phase 1's extraction will tell us; Phase 5's authoring estimates may
  shift after that survey.
- **Vegetable Guide section count.** 90 pages is a lot. The plan
  estimates 8–12 sections; the actual breakdown depends on the
  manual's chapter boundaries (not yet known to the wiki — Phase 1
  surfaces them).
- **Calendar translation article.** Phase 5 references
  `fgw-calendar-zone-6b-translation.md` which doesn't exist yet. Open
  follow-up: spawn `/wiki:research "Zone 6b WV translation of FGW
  southern-African crop calendar"` and produce that article so the
  Sequence Posters page has a concrete chapter-side companion.
- **Search.** The plan does not include in-app search across the Learn
  library. If chapter members start asking for it, a follow-up project
  would add a client-side index (lunr / FlexSearch — under 50 KB).
- **Print / save-PDF affordance.** Should the Learn library expose a
  "save section as PDF" or "print this manual" path? Not in v1; record
  as inventory if requested.

## Sources Consulted

- [Wiki: FGW Field Guide compost spec — verbatim reference](../../wiki/references/fgw-field-guide-compost-spec.md) — provenance chain `src/domain/fgw.ts` → Field Guide quotes; the canonical map between code and source.
- [Wiki: God's Blanket / mulch verbatim passages](../../wiki/references/fgw-gods-blanket-mulch.md) — verbatim Six Keys + Land Prep + Application + Smother + Lodging + Mgmt Key 2 + slash-and-burn quotes.
- [Wiki: FGW compost spec — academic standing & contested context](../../wiki/topics/fgw-compost-academic-standing.md) — honest framing the Sources & licensing page must preserve.
- [Wiki: Pyramid in fGw](../../wiki/topics/pyramid-in-fgw.md) — incidental: chapter-membership gating mentioned as a fallback in Phase 7's risk row.
- [Source: FGW Field Guide 2nd ed (source-paper notes)](../../raw/papers/2026-05-20-fgw-field-guide-2nd-edition.md) — manual identity, edition, URL.
- [Source: FGW Field Guide mulch passages (verbatim)](../../raw/papers/2026-05-20-fgw-field-guide-mulch-passages.md) — verbatim mulch quotes for Phase 4.
- [Source: FGW Trainer's Reference Guide 2nd ed (source-paper notes)](../../raw/papers/2026-05-20-fgw-trainers-reference-guide-2nd-edition.md) — diagrams source; Phase 5 input.
- [Source: FGW Vegetable Guide 2nd ed (source-paper notes)](../../raw/papers/2026-05-20-fgw-vegetable-guide-2nd-edition.md) — variant ratios; Phase 5 input.
- [Source: FGW Master Sequence Posters (source-paper notes)](../../raw/papers/2026-05-20-fgw-master-sequence-posters.md) — calendar context; Phase 5 input + climate-adaptation risk.
- [Output: alpha-bundle plan](../alpha-bundle/plan-alpha-bundle-2026-05-22.md) — distribution runbook reused in Phase 7.
- [Output: fgw-refinements plan (SPEC-053 vegetable preset)](../fgw-refinements/plan-fgw-refinements-2026-05-21.md) — context for Phase 5's vegetable-ratio table being the unblock for SPEC-053.
- [Code: src/routes/Learn.tsx](../../../src/routes/Learn.tsx), [src/content/learn/](../../../src/content/learn/), [src/domain/fgw.ts](../../../src/domain/fgw.ts), [SPEC.md § SPEC-024](../../../SPEC.md) — the surface this plan extends.
