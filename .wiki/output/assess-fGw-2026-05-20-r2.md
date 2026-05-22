---
title: "Repo Comparison r2: fGw vs compost-marketplace Wiki vs Market"
type: comparison
round: 2
sources:
  - .wiki/wiki/references/fgw-field-guide-compost-spec.md
  - .wiki/wiki/concepts/fgw-pile-build-process.md
  - .wiki/wiki/concepts/fgw-pile-turn-schedule.md
  - .wiki/wiki/topics/fgw-compost-academic-standing.md
  - .wiki/wiki/theses/fgw-pile-satisfies-pfrp.md
  - .wiki/output/assess-fGw-2026-05-20.md (round 1 baseline)
generated: 2026-05-20
mode: standard (3 repo + 3 market agents)
---

# fGw vs compost-marketplace Wiki vs Market — Round 2

## Executive Summary

Round 2 runs against a wiki that has actual compiled knowledge — 5 articles + 13 raw sources from the morning's research round. So this is the first **real** repo↔wiki gap analysis the project has been able to produce; round 1 was effectively a market-only analysis with the SPEC standing in as the wiki.

The wiki↔code map is now navigable: every constant in `src/domain/fgw.ts` and every Field-Guide-derived behavior in `src/lib/pile/` and `src/content/learn/` traces to either the verbatim reference article (`fgw-field-guide-compost-spec.md`) or one of the two concept articles (`fgw-pile-build-process.md`, `fgw-pile-turn-schedule.md`). The novel finding is **what the wiki has compiled but the code does not yet act on**: the academic-standing topic identifies a missing climate-disclaimer (`fgw-compost-academic-standing.md` warns Powder Keg WV is humid-continental, on the wrong side of Giller 2015 for the no-till core); the PFRP thesis identifies that FGW's hand-feel rod test is regimen-compliant but not measurement-compliant, and the app's `TurnRecord.temperatureC` accepts a single scalar with no probe-method tag.

Three high-leverage moves close most of the gap: (1) PFRP-compliance badge on `PileDetail.tsx`, (2) climate-disclaimer banner on the Compost Recipe Learn page, (3) extend `TurnRecord` with a probe-method discriminator. SPEC § 2.2's "constants are sacred" framing also needs a one-sentence honesty patch citing the wiki article, and the missing top-level `README.md` finally needs to land.

The competitive moat **strengthened** since round 1: independent verification confirms Powder Keg is the only US FGW model demonstration farm, AgriStewards (Indiana) ships no digital coordination layer, Coracle/Shopstr/MakeSoil shipped no relevant features in the last six weeks, and Eukarya Christian Academy (Powder Keg's CSA partner) has no LMS — meaning a Eukarya-parent onboarding flow is a genuine SPEC-grade opportunity.

---

## Repo Overview

Unchanged from [round 1](assess-fGw-2026-05-20.md). Quick recap:
- **What it is**: Single-relay Nostr-based coordination app for a Farming God's Way chapter (Powder Keg WV).
- **Tech stack**: Tauri 2 + Vite + React 18 + TS 5 + Tailwind 3; NDK 2.10 + nostr-tools 2.10; Pyramid invite-only relay; Blossom media.
- **Key features**: NIP-99 listings, NIP-52 events, NIP-17 DMs, NIP-32 reputation, kind-30078 piles, Pyramid invite tree, Blossom photos with EXIF strip, geohash-tiered privacy, local notifications.
- **Tests**: 267/267 across 37 files; tsc + Vite build clean.
- **Mobile init**: complete — Xcode project at `src-tauri/gen/apple/`, Android Gradle at `src-tauri/gen/android/`, NSCameraUsageDescription via `src-tauri/Info.ios.plist` merge file.

The Structure agent confirmed zero structural delta vs round 1.

---

## Alignment (Repo + Wiki agree)

The wiki's compiled articles validate every Field-Guide-derived constant in code:

| Feature | Repo Implementation | Wiki Article | Notes |
|---|---|---|---|
| Pile reference dimensions 2×2×2 m | `src/domain/fgw.ts` `PILE_REFERENCE_DIMENSIONS` | [fgw-field-guide-compost-spec.md](../wiki/references/fgw-field-guide-compost-spec.md) | Verbatim source quote: "We suggest a compost pile size of 2m x 2m x 2m" |
| Pile minimum 1.5×1.5×2 m | `PILE_MIN_DIMENSIONS` | same | Quote: "It is not recommended that you reduce the starting size of the pile to below 1.5m long x 1.5m wide x 2m high" |
| Ingredient ratios 10/45/22.5/22.5 | `PILE_INGREDIENT_RATIOS` | same | Quote captured per ingredient |
| Layer recipe 10/10/20 cm + 2 bags + 50–60 L | `PILE_LAYER_RECIPE` | [fgw-pile-build-process.md](../wiki/concepts/fgw-pile-build-process.md) | Wizard at `src/routes/NewPile.tsx` mirrors step-for-step |
| Turn schedule [3,6,9,19,29,39] | `PILE_TURN_SCHEDULE_DAYS` + `src/lib/pile/schedule.ts` | [fgw-pile-turn-schedule.md](../wiki/concepts/fgw-pile-turn-schedule.md) | Concept article cites the schedule generator file |
| 55–68 °C temperature target | `PILE_TEMP_RANGE_C` | reference article | Quote: "Ideal temperature range is between 55°C to 68°C" |
| 50 % moisture squeeze test | `PILE_MOISTURE_TARGET` | reference article | Quote captured |
| 120-day cure | `PILE_CURE_DAYS` | reference article | Quote captured |
| Vegetable-bed compost is different | `src/domain/fgw.ts` `PILE_PRESETS` only ships maize-scale | [fgw-vegetable-guide raw note](../raw/papers/2026-05-20-fgw-vegetable-guide-2nd-edition.md) | Wiki acknowledges the gap — vegetable ratios live in the Vegetable Guide which has not been ingested verbatim yet |
| FGW regimen satisfies PFRP windrow | `src/lib/pile/schedule.ts` produces 6 turn events over 39 days at 9 AM local | [fgw-pile-satisfies-pfrp.md](../wiki/theses/fgw-pile-satisfies-pfrp.md) | Verdict: **partially-supported, medium confidence** — regimen meets ≥5 turns / ≥15 days at ≥55 °C; instrumentation does not |

Eleven exact alignments. No drift detected: every constant in code traces to a Field Guide quote.

---

## Research Gaps (Repo does it, Wiki silent)

The Features agent surfaced **14 app capabilities with zero corresponding wiki article**. Each is a `/wiki:research` candidate:

| # | Repo Feature | What's missing from wiki | Suggested research |
|---|---|---|---|
| 1 | Pyramid invite-tree integration (`src/lib/pyramid.ts`) | No reference page on Pyramid endpoints, kind-22242 emit semantics, invite-cascade rules | `/wiki:research --local "fiatjaf pyramid invite-only relay HTTP API kind-22242"` |
| 2 | NIP-99 listings + reservation cluster | No reference for NIP-99 30402 + open PRs #2334/#2335/#2333/#2346 | `/wiki:research --local "NIP-99 marketplace reservations escrow extensions 2026"` |
| 3 | NIP-52 calendar events + RSVP | No reference for NIP-52 31923/31925 + staffing-tag conventions | `/wiki:research --local "NIP-52 calendar events RSVP staffing chapter"` |
| 4 | NIP-17 gift-wrapped DMs (signer-agnostic) | No reference for NIP-44 v2 + NIP-59 wrap pipeline | `/wiki:research --local "NIP-17 gift-wrap NIP-44 v2 signer-agnostic implementation"` |
| 5 | NIP-32 reputation labels | No reference for NIP-32 namespacing + dedup conventions | `/wiki:research --local "NIP-32 reputation labels self-review filter dedup"` |
| 6 | Blossom photo uploads (BUD-01/02/06 over NIP-98) | No reference for BUD specs and NIP-98 | `/wiki:research --local "Blossom BUD-01 NIP-98 HTTP-Auth media spec 2026"` |
| 7 | Image transform (EXIF strip + resize) | Wiki has no privacy-photo-pipeline article | `/wiki:research --local "EXIF GPS leak photo upload privacy mitigations"` |
| 8 | Geohash precision tiers (`src/domain/geoPrecision.ts`) | Strava-heatmap lessons referenced in round 1 but not yet a reference article | `/wiki:research --local "geohash precision privacy k-anonymity Strava heatmap lessons"` |
| 9 | Tauri 2 mobile production status | No reference for Tauri 2 mobile plugin maturity (notification, sql, stronghold, barcode-scanner) | `/wiki:research --local "Tauri 2 mobile plugin maturity 2026 production-ready gaps"` |
| 10 | Tauri Stronghold key storage | No reference for libsodium-backed keystore patterns | `/wiki:research --local "Tauri Stronghold key vault iOS Android key storage best practice"` |
| 11 | Mobile QR-scanner via Tauri barcode plugin | No reference for nostrconnect:// vs bunker:// pairing UX | `/wiki:research --local "NIP-46 nostrconnect bunker QR pairing UX 2026"` |
| 12 | Compost-monitoring sensor stack (BLE/LoRa probe → Tauri → kind-30078) | No reference for compost IoT, no Tauri-Nostr probe bridge documented | `/wiki:research --local "compost monitoring BLE LoRa probe ESP32 PFRP datalogger"` |
| 13 | Climate-adaptation for FGW in humid-continental Zone 6b | Wiki notes the mismatch in `fgw-compost-academic-standing.md` but no concrete adaptation playbook | `/wiki:research --local --mode thesis "An FGW pile in USDA Zone 6b sustains ≥55 °C for ≥15 cumulative days when built between Aug 1 and Sep 30"` |
| 14 | NRAES-54 staffing benchmarks (`staffingEstimate` heuristic) | Wiki has no published-benchmark anchor for the 1 person / 4 m³ rule | `/wiki:research --local "NRAES-54 On-Farm Composting Handbook hand-turn person-hours per cubic yard"` |

Plus **3 implicit-constant gaps** the Structure agent caught — code has constants without a wiki article:

| 15 | `PLANTING_STATION` (60×75 cm spacing, 15/8 cm input depths) — Field Guide p. 33 | Reference article missing | `/wiki:research --local "FGW Field Guide planting station 60 75 cm spacing"` |
| 16 | `MULCH` ("God's Blanket", 2.5 cm thick, 100 % cover) — Field Guide p. 30 | Reference article missing | `/wiki:research --local "FGW God's Blanket mulch 2.5 cm coverage no-burn"` |
| 17 | Reference totals for ingredient scaling (15 bags / 8 m³ / 4 m³ / 4 m³ / ~400 L) — used by `pileMath.ts scaledIngredients` | Reference article exists but doesn't enumerate the *reference totals* the code scales from | Append to existing `fgw-field-guide-compost-spec.md` rather than new research |

---

## Opportunities (Wiki knows it, Repo doesn't act on it)

The 5 wiki articles compiled today contain knowledge the app does not yet surface. Each is a feature candidate:

| # | Wiki Knowledge | Potential Feature | Priority | Complexity | Wiki source |
|---|---|---|---|---|---|
| 1 | FGW regimen satisfies PFRP windrow on paper but rod hand-feel is not TMECC-defensible | **PFRP-compliance badge** on `PileDetail.tsx` — green when cumulative ≥55 °C days ≥ 15 AND ≥5 turns logged; yellow if measurement was hand-feel | High | Medium | [thesis](../wiki/theses/fgw-pile-satisfies-pfrp.md) |
| 2 | TMECC method 03.05 mandates calibrated electronic probe at multiple depths/locations | Extend `TurnRecord` with `temperatureMethod: 'rod-hand-feel' \| 'electronic-probe-calibrated'` discriminator + multi-probe array | High | Med-Low | [thesis](../wiki/theses/fgw-pile-satisfies-pfrp.md) |
| 3 | Powder Keg WV is humid-continental; Giller 2015 shows no-till underperforms in wetter regions | **Climate-adaptation banner** on Learn page (Compost Recipe + Six Keys) linking to academic-standing topic — sets honest expectations without ironizing | High | Low | [topic](../wiki/topics/fgw-compost-academic-standing.md) |
| 4 | Compost-distribution gating: PFRP/Class A only matters if compost leaves chapter | `Pile.distributionScope: 'chapter-only' \| 'external'` + Class A lab-test attestation field when external | Medium | Medium | [thesis](../wiki/theses/fgw-pile-satisfies-pfrp.md), [Class A reg](../raw/papers/2026-05-20-epa-40cfr-503-32-class-a.md) |
| 5 | Vegetable Guide ships different compost ratios than maize-scale | **Vegetable-bed pile preset** in `PILE_PRESETS` once Vegetable Guide is text-extracted | Medium | Low (after research) | [Veg Guide raw](../raw/papers/2026-05-20-fgw-vegetable-guide-2nd-edition.md) |
| 6 | 120-day cure constant exists but app doesn't visualize "ready by date X" | Cure-end visualization on PileDetail when state=CURING — countdown + calendar marker | Low-Med | Low | [reference](../wiki/references/fgw-field-guide-compost-spec.md) |
| 7 | First-turn cadence is also temperature-driven ("turn after 3 days OR when temp reaches 68 °C") | `PileDetail.tsx` could show a "turn now" alert when probe sample crosses 68 °C, regardless of day count | Low-Med | Medium | [concept](../wiki/concepts/fgw-pile-turn-schedule.md) |
| 8 | Material substitution rule: "no manure, use 4 m³ legumes" | Tooltip on the manure field in NewPile wizard | Low | Low | [concept](../wiki/concepts/fgw-pile-build-process.md) |
| 9 | Material gathering order: dry/woody/manure first, greens last | Hint surfaced when listing greens (NIP-99 listing) — "use within 3–4 days" | Low | Low | [concept](../wiki/concepts/fgw-pile-build-process.md) |
| 10 | Indicators of finished compost (dark brown, sweet smell, crumbly, fungal strands) | Checklist on PileDetail when state=READY | Low | Low | [reference](../wiki/references/fgw-field-guide-compost-spec.md) |

The Features agent's **top-3 leverage** picks: items 1, 3, 2 in that order (ranked by impact-of-applying-wiki-knowledge × ease).

---

## Market Gaps (Neither covers, but market addresses)

| # | Capability | Who has it | Relevance | Notes |
|---|---|---|---|---|
| 1 | Calibrated multi-probe thermistor arrays + datalogger ingest | Reotemp FG36P/FG48P/FG60P (~$140–220), Onset HOBO MX2304 (~$250 + probes), DIY ESP32 + DS18B20 (~$25 BOM); USCC/USDA-NRCS reference instruments | High — closes the round-2 PFRP measurement gap | Open-source: github.com/iotaledger/compost-sensor-prototype, github.com/OpenCompostMonitor (both reference designs, neither widely adopted). Active project: github.com/Iiskndrr/Smart-Bokashi-Monitoring-System (last push Mar 2025). |
| 2 | NIP-46 `nostrconnect://` reverse-direction pairing | nsec.app, Amber, Keychat, Nostrudel, Coracle | High — current `connectViaQR` actively rejects `nostrconnect://` (`nip46.ts` line filters `bunker://` only) | NIP-46 PR #1525 deprecates `bunker://` in favor of `nostrconnect://` |
| 3 | Eukarya-parent onboarding flow at school pickup | Nobody — Eukarya Christian Academy has no LMS or app | High — 200+ captive families | School-pickup QR-distributes invites; chapter steward approves |
| 4 | NRAES-54 hand-turn benchmark (~1 person-hr/m³, vs fGw's implicit ~0.375 person-hr/m³) | Cornell Waste Management Institute, USCC COTC | Medium — `staffingEstimate` heuristic should cite NRAES-54 and let `est_hours` scale with volume rather than floor at 1.5 hr | `src/domain/pileMath.ts:87` |
| 5 | TMECC 04.11 gravimetric moisture (oven-dry to constant mass at 70 °C / 105 °C) | USCC TMECC; field proxy is capacitive sensor (METER EC-5 / TEROS 10) ±3 % VWC | Medium — current `TurnRecord.moisture` is 0..1 with no method tag | Companion to opportunity #2 above |
| 6 | On-device LLM to draft listings / summarize feeds for non-technical farmers | llama.cpp ships iOS/visionOS XCFrameworks; LLMFarm is a working iOS shell; Apple Intelligence Foundation Models (iOS 18+, Apple Silicon required) | Medium-Low for now (battery/RAM cost on rural-Android) | No farmer-vertical app shipped yet |
| 7 | Real chapter governance content (curriculum, assessment, prayer-walking) | AgriStewards (Brian Smith, Indiana — agristewards.org); Foundations for Farming Trainer's Reference Guide | Medium | Powder Keg's Learn pages currently teach FGW abstractly; AgriStewards' assessment + prayer-walk pedagogy could embed in `src/routes/Learn.tsx` |

---

## Competitive Landscape (delta from round 1)

The morning's catalogue of 18 tools stands. Round 2 added one nuance and three confirmations:

| Tool | Round-1 status | Round-2 update |
|---|---|---|
| Coracle | Most NIP coverage; Tauri-incompatible | **No new features in last 6 weeks**. Master branch limited to maintenance commits (welshman bumps, image-preview placeholder). Window still open. |
| Shopstr | NIP-99 + Lightning + Cashu | **Apr–May 2026 commits are security hardening only** (MCP session pinning, link sanitization, x-forwarded-for parsing). No NIP-52/32/72 expansion. |
| MakeSoil | Centralized SaaS, workflow-similar | **Site is now a thin landing page.** /about and /news 404. Either dormant or marketing-shell-only. |
| AgriStewards | Indiana-based US peer | **Brochure-ware: no app, no Discord, no LMS, no member directory.** Their /board-members page 404s. They are a *content upstream*, not a competitor. Outreach to brian@agristewards.org for cold-climate curriculum is still high-value. |
| Eukarya Christian Academy | Powder Keg's CSA partner | Stephens City, VA 22655. ~200 students. **No LMS, no parent portal disclosed**; communication is phone, email, FB, RSS. The CSA relationship lives in email + paper-pickup. **A Eukarya-parent onboarding flow is a SPEC-grade opportunity.** |
| Foundations for Farming | Doctrinal upstream | US presence is donation-only via Crown.org. /partners and /where-we-work 404. **Zero US ground-game tooling.** |
| ECHO Community | Tropical-ag knowledge utility | Login-walled (HTTP 403 to anonymous). Adjacent, not overlapping. |

**Moat verification**: Powder Keg's claim — "the first and only model demonstration farm in the country for Farming God's Way" — is independently verified across foundationsforfarming.org, farminggodsway.org, agristewards.org, and general web search. **The claim holds as of 2026-05-20.** No other US site advertises an FGW demonstration-farm designation; no FGW-branded US chapter network has a digital footprint.

---

## Emerging Trends (delta from round 1)

| # | Development | Timeline | Citation | Wiki ready? |
|---|---|---|---|---|
| 1 | **Compost-monitoring sensor stack thinning out**: only ~4 active GitHub repos, freshest is `Iiskndrr/Smart-Bokashi-Monitoring-System` (last push Mar 2025). No Tauri-Nostr-aware probe project exists. | already-shipped (one project), ecosystem thin | `github.com/search?q=compost+monitor+temperature+esp32` | **missing** — no probe-hardware article |
| 2 | **Climate-adaptation tools for humid-continental** — eOrganic / Penn State Extension surfaced no new (2025–26) cold-climate compost or FGW-translation publications. Penn State `/composting` 404. | n/a (signal absent) | `eorganic.org`, `extension.psu.edu/composting` (404) | **missing** — open research gap, not a near-term fire |
| 3 | **Marmot encrypted group chat unchanged** — README still flags "experimental software… do not use for production." whitenoise-rs latest is v0.1.0-alpha.4 (Apr 2024). | unchanged from round 1: Q4 2026 / 2027 | `github.com/parres-hq/marmot`, `github.com/parres-hq/whitenoise/releases` | **partial** — round 1 already noted |
| 4 | **NIP-99 marketplace extension PRs** — #2334 (escrow), #2335 (reservations), #2333 (accommodation) all updated 2026-05-13, all still **Draft**. New: **#2346** opened 2026-05-13. **#1784 e-commerce extension was merged July 2025**. | next-quarter (Q3 2026 likely for #2335; #2334 lags) | `github.com/nostr-protocol/nips/pulls` | **partial** — round 1 noted the cluster but missed #2346 and #1784 merge |
| 5 | **AI-assisted onboarding via on-device LLMs** — llama.cpp ships iOS/visionOS XCFrameworks; LLMFarm (MIT) is a working iOS shell. **No farmer-vertical app shipped.** Tauri 2 → llama.cpp via FFI is feasible but unproven on iOS. | infrastructure shipped; vertical apps next-quarter+ | `github.com/ggerganov/llama.cpp`, `github.com/guinmoon/LLMFarm` | **missing** — no Tauri-LLM bridge article, no battery/RAM budget research |
| 6 | **FGW org silence** — `farming-gods-way.org`, `foundationsforfarming.org`, `agristewards.org` all returned static landing pages with no dated 2026 content. /blog and /news 404. | n/a — absence is itself signal | three URLs above | **partial** — round 1 captured the academic-standing context; chapter-life and US-adoption articles still missing |

**Top three to track**: items 4 (NIP-99 reservations PR cluster), 1 (BLE compost probe — only one with shipping infrastructure), 5 (on-device LLM iOS).

---

## Documentation Drift (Docs agent findings)

The Docs agent reconciled SPEC ↔ wiki ↔ Learn-pages and found:

| Question | Finding | Recommendation |
|---|---|---|
| **SPEC § 2.2 "constants are sacred" vs academic-standing topic** | The constants themselves are not disputed by peer review; the *epistemology* (treating them as untouchable) is what Spaling & Vander Kooy 2019 contests. | **Update SPEC § 2.2** with one sentence acknowledging constants are practitioner-codified from Brian Oldreive's Hinton Estate experience (link the wiki article). Preserves practice, adds intellectual honesty. |
| **Learn pages overpromise yield in WV?** | **No.** Audited `six-keys.md`, `compost-recipe.md`, `gods-blanket.md` — none claim FGW *outperforms* alternatives in WV or anywhere. They make regimen claims (will hit thermophilic temps within a week) not yield claims. | **No action required.** Learn pages are defensible. |
| **PFRP / Class A surfacing on compost distribution** | SPEC silent on whether Powder Keg plans to share finished compost beyond the chapter. The wiki thesis identifies regimen-vs-measurement gap that only matters if compost leaves the chapter. | **Add to SPEC § 7 (deferred items)**: "Compost distribution policy — explicitly document whether chapter will distribute beyond members (requires lab testing / PFRP compliance documentation) or consume internally only." |
| **README at repo root** | **Confirmed missing.** | Add a 100–200 word README pointing to SPEC.md and `.wiki/` as the two on-ramps. Draft below. |

### Proposed README

```markdown
# fGw — Compost Marketplace for Farming God's Way Chapters

A Nostr-native app for Farming God's Way chapters to coordinate compost
building, labor events, and resource sharing. Built on a single chapter
relay for sovereignty and privacy. First chapter: Powder Keg Farms,
High View WV.

## Features
- Listings & offers for compost inputs, finished compost, seeds, labor
- Community labor events (pile builds, turn days, mulch drives) with RSVPs
- Compost pile lifecycle with FGW-spec turn schedule & local notifications
- Reputation reviews via NIP-32
- Invite-only chapter relay (Pyramid)
- Native iOS / Android / desktop (Tauri 2) + web
- Blossom photo uploads with EXIF strip + resize

## On-ramps
- **Project spec**: [SPEC.md](./SPEC.md) — every architectural decision
  and SPEC-001..035 work units
- **Knowledge base**: [.wiki/](./.wiki/) — FGW Field Guide reference,
  pile build/turn concepts, academic-standing topic, PFRP thesis,
  Pyramid integration
- **Quickstart**: `pnpm install && pnpm dev` for web; `pnpm tauri:dev`
  for native

Maintained by [TBD]. See SPEC § 8 for locked decisions.
```

---

## Recommended Actions

### Research (fill wiki gaps; no code change)

Highest-leverage `/wiki:research` runs, ranked:

1. `/wiki:research --local "fiatjaf pyramid invite-only relay HTTP API kind-22242" --sources 5` — closes gap #1, the chapter's identity layer
2. `/wiki:research --local --mode thesis "An FGW pile in USDA Zone 6b sustains ≥55 °C for ≥15 cumulative days when built between Aug 1 and Sep 30"` — addresses gap #13 + opportunity #1 simultaneously
3. `/wiki:research --local "NRAES-54 On-Farm Composting Handbook hand-turn person-hours" --sources 4` — closes gap #14 (the made-up labor heuristic)
4. `/wiki:research --local "FGW Field Guide planting station 60 75 cm spacing" --sources 3` — closes gap #15 (PLANTING_STATION constants without article)
5. `/wiki:research --local "FGW God's Blanket mulch 2.5 cm coverage no-burn" --sources 3` — closes gap #16
6. `/wiki:research --local "Blossom BUD-01 NIP-98 HTTP-Auth media spec 2026" --sources 5` — closes gap #6
7. `/wiki:research --local "compost monitoring BLE LoRa probe ESP32 PFRP datalogger" --sources 5` — net-new infrastructure article

### Build (feature candidates ranked by impact × feasibility)

| # | Feature | SPEC# (suggested) | Wave |
|---|---|---|---|
| 1 | PFRP-compliance badge on PileDetail (green/yellow status from cumulative ≥55 °C days) | SPEC-049 | Wave 10 |
| 2 | `TurnRecord.temperatureMethod` discriminator (`'rod-hand-feel' \| 'electronic-probe-calibrated'`) + multi-probe array | SPEC-050 | Wave 10 |
| 3 | Climate-adaptation banner on Learn page Compost Recipe + Six Keys | SPEC-051 | Wave 10 (small) |
| 4 | SPEC § 2.2 honesty patch (cite wiki academic-standing article) + README.md at repo root | docs only | Wave 10 |
| 5 | `nostrconnect://` generator path in `src/lib/auth/nip46.ts` (deprecate `bunker://`-only flow) | SPEC-052 | Wave 11 |
| 6 | Vegetable-bed pile preset (after Vegetable Guide ratios are researched & ingested) | SPEC-053 | Wave 11 |
| 7 | Cure-end visualization on PileDetail (countdown to `cureUntil`) | SPEC-054 | Wave 11 (small) |
| 8 | `Pile.distributionScope` + Class A attestation field | SPEC-055 | Wave 12 |
| 9 | Eukarya-parent onboarding flow (school-pickup QR distribution) | SPEC-056 | Wave 12 (process + tiny code) |
| 10 | BLE compost-probe → Tauri → kind-30078 republish | SPEC-057 | Wave 13 |

### Monitor (no action this round)

- Marmot encrypted-groups stability — no acceleration since round 1
- NIP-99 PRs #2334/2335/2333/2346 — track quarterly, all still Draft
- On-device LLM Tauri bridge — infrastructure shipped, no vertical app yet
- Tauri 2 push-notifications plugin — no new news

---

## Confidence Notes

**High confidence**:
- Every alignment in the matrix above (Field Guide quote → constant → article).
- Gap inventory (verified by Features agent against the live codebase).
- SPEC drift conclusions (Q1, Q2, Q3, Q4 — all anchored in primary sources).
- Competitive moat verification (multiple independent sources confirm Powder Keg is the only US FGW model demonstration farm).

**Medium confidence**:
- PFRP compliance interpretation — the regulation text is solid (40 CFR §503 App B verbatim), but TMECC primary methods remain blocked behind USCC paywall, so the "instrumentation gap" side is inferred.
- NRAES-54 staffing benchmark — cited from Cornell publishing but not yet ingested into wiki; the 1 person-hr/m³ figure could shift on closer reading.
- Marmot/whitenoise timeline — github activity is the best signal we have; could move faster or slower than projected.

**Low confidence**:
- ECHO Community internals (login-walled).
- Foundations for Farming US activity (most pages 404).
- Whether the Eukarya-onboarding opportunity is actually feasible — depends on Gini LaMaster and Eukarya leadership relationships, which we don't have visibility into.

---

The wiki is now navigable (5 articles + 13 raw sources + 2 assess reports). After running the top-3 research recommendations, a third assess in ~30–60 days should expose deeper repo↔wiki gaps as the wiki gains coverage of the non-FGW-compost features (Pyramid, NIP-99, NIP-17, Blossom, etc.).
