---
title: "Repo Comparison: fGw vs compost-marketplace Wiki vs Market"
type: comparison
sources:
  - .wiki/raw/notes/spec.md
  - .wiki/raw/notes/home-dir-plan.md
  - .wiki/raw/data/commit-history.md
  - external web research (Competitors, Best Practices, Emerging, Adjacent, Failures)
generated: 2026-05-20
mode: --retardmax
---

# fGw vs compost-marketplace Knowledge Base vs Market

## Executive Summary

The wiki was just initialized today and seeded only with the project's own SPECs and commit history; this assessment reads more as a **repo-vs-market** comparison than a wiki-research-vs-implementation gap analysis. That's a feature, not a bug — fGw is a niche-vertical greenfield (Nostr + Farming God's Way chapter coordination) with no upstream wiki to fall behind. Where competitors and adjacent fields *do* show up is in confirming fGw is unique on its job-to-be-done axis (no other product combines invite-only Nostr relay + chapter-vertical compost coordination + FGW-doctrine constants), while exposing six categories of borrowable patterns.

The repo ships its full charter: 35 SPECs (001–035) across 7 waves, 267/267 tests, tsc + Vite + native builds clean for iOS and Android. Locked architecture (single relay, no curated lists, chapter == relay, FGW invariants as immutable constants) is doctrinally consistent. Where the project has gaps, they fall into three buckets: **(a) defenses against known marketplace failure modes** (Strava-style geo-leak, OpenBazaar empty-store cold-start, Buy Nothing legitimacy revolt), **(b) emerging Nostr standards** worth tracking now (Marmot for encrypted groups, NIP-99 reservations/escrow PR cluster, Tauri push plugin maturity), and **(c) UX patterns from adjacent fields** (iNaturalist tiered geoprivacy, Crisis Cleanup cooperative claim windows, Briar in-person QR bootstrap, Planning Center blockout dates).

Recommended next moves are research-then-build: research items that fill *wiki* knowledge (compost data integrity standards, NIP-99 reservation extensions, Marmot timeline), implementation items that close *repo* gaps (chapter seeding plan, geo k-anonymity floor, named maintainer doc, bundle splitting, biometric/deep-link plugin adoption, fulfilment of stale TODOs).

---

## Repo Overview

- **What it is**: Single-relay Nostr-based coordination app for a Farming God's Way chapter — listings, labor events, compost piles, DMs, reputation, photos, and admin (Pyramid invite-tree) — that ships as Tauri 2 native (iOS, Android, macOS, Windows, Linux) plus web.
- **Tech stack**: Tauri 2.1 + Rust shell · Vite 5 + React 18 + TypeScript 5 · Tailwind 3 (custom soil/moss/harvest/bloom/dusk palette + Fraunces serif/IBM Plex sans) · NDK 2.10 + nostr-tools 2.10 · blossom-client-sdk · ngeohash · Leaflet + react-leaflet · zustand 5 · TanStack Query 5 · Dexie 4 · tauri-plugin-{notification, sql, stronghold, barcode-scanner}.
- **Key features**:
  1. Listings (NIP-99 needs/offers, kind 30402) with quantity, geohash, photos, optional pile reference.
  2. Labor events (NIP-52, kind 31923) with RSVPs (kind 31925), staffing estimates, geohash defaulting to street-level (precision 7).
  3. Compost piles (kind 30078) with state machine, FGW-spec turn schedule, ingredient-scaling math, multi-device republish (last-writer-wins).
  4. NIP-17 gift-wrapped DMs working across NIP-07, NIP-46, and local-nsec signers.
  5. Reputation reviews (NIP-32, kind 1985) with self-review filtering and per-(reviewer, target, ref) dedup.
  6. Blossom photo uploads with EXIF strip + resize (≤ 2 MB) + post-transform SHA-256.
  7. Pyramid invite-tree relay integration: membership status, invite/drop, member tree, request-invite flow.
  8. Local-only notifications (Tauri plugin) for turn days, RSVP windows, listing expiry.
  9. Native key storage (Tauri Stronghold) on iOS/Android, IndexedDB+WebCrypto on web.
  10. Mobile QR scanning for NIP-46 bunker via Tauri barcode-scanner plugin.
  11. Geohash-tiered privacy (4–8 chars, defaults: 5 town for listings/piles, 7 street for events).
  12. FGW education content (Six Keys, Compost Recipe with live constant substitution, On Time, Planting Station, God's Blanket).

---

## Alignment (Repo + Wiki agree)

The wiki currently contains only this project's own SPECs/plan/commits, so "alignment" reduces to "what the repo claims, the repo also implements." The Docs agent verified each claim against shipping code — abbreviated:

| Feature | Repo Implementation | Wiki/SPEC says | Verdict |
|---|---|---|---|
| Single chapter relay, no failover | `src/lib/ndk.ts` lazy singleton bound to `useChapterStore.currentRelay`; rebuilds on swap | SPEC § 3.2 | Match |
| Chapter ↔ relay identity | Chapter constants from `src/lib/listings/types.ts CHAPTER_A_TAG_DEFAULTS`; everything `a`-tags this | SPEC § 2.1 | Match |
| FGW pile invariants as immutable constants | `src/domain/fgw.ts` (PILE_REFERENCE_DIMENSIONS, ratios, layer recipe, turn schedule, cure days, planting station, mulch) | SPEC § 2.2 | Match — sourced to Field Guide p. 31–34 / 38 |
| NIP-99 listings, NIP-52 events, NIP-17 DMs, NIP-32 reviews | `src/lib/{listings,events,dm,reputation}` | SPEC § 4 (Specs 011/012/014/017) | Match |
| Photos: EXIF strip + resize + ≤ 2 MB + post-transform hash | `src/lib/image.ts` + `src/lib/blossom.ts` | SPEC § 3.5, SPEC-027 | Match |
| Auth precedence NIP-07 → NIP-46 → nsec-local | `src/lib/auth/index.ts` orchestrator | SPEC § 3.3 | Match — all three end-to-end after SPEC-030 |
| Local notifications (no remote push) | `src/lib/notifications.ts` Tauri plugin + in-app fallback | SPEC § 3.6, SPEC-029 | Match |
| Schema versioning `version: 1` | All structured-content events emit it; decoders refuse unknown | SPEC § 3.7 | Match |
| Geohash precision tiers | `src/domain/geoPrecision.ts` GEO_PRECISION_LABELS + truncateGeohash | SPEC § 3.4 | Match |
| Pyramid invite tree | `src/lib/pyramid.ts` HTTP `/allow` `/ban` `/allowed` `/banned` `/u/{pubkey}` + NIP-98 auth | SPEC-025 + § Layer C+ | Match |
| iOS Info.plist NSCameraUsageDescription via merge file | `src-tauri/Info.ios.plist` + `lib.rs` comment | commit cd90988 | Match |

No reverse drift detected: every locked decision in SPEC § 8 is enforced by the live code path or test.

---

## Research Gaps (Repo does it, Wiki silent on it)

Because the wiki is freshly seeded only from this project's own SPECs, *every external reference* the codebase relies on is a research gap until the wiki has its own articles. Prioritized:

| Repo Feature | What's missing from wiki | Suggested research |
|---|---|---|
| FGW pile invariants (SPEC § 2.2) | No standalone reference page for the FGW Field Guide; constants are duplicated in code + SPEC | `/wiki:research "Farming God's Way Field Guide compost spec" --sources 5` then `/wiki:compile` into `wiki/references/fgw-field-guide.md` |
| Pyramid invite-tree integration | No reference page for fiatjaf/pyramid endpoints, semantics, kind-22242 emit status | `/wiki:research "fiatjaf pyramid relay invite tree HTTP API" --sources 8` |
| NIP-99 / NIP-52 / NIP-17 / NIP-32 / NIP-72 / NIP-46 / NIP-07 / NIP-92 / NIP-98 / BUD-01 | Each used; none documented as wiki references | `/wiki:research --mode references "NIP-99 NIP-52 NIP-17 NIP-32 NIP-72 NIP-46 NIP-07 NIP-92 NIP-98 BUD-01"` |
| Tauri 2 mobile production status | Code uses notification, sql, stronghold, barcode-scanner plugins; no wiki article on what Tauri 2 mobile is/isn't ready for as of mid-2026 | `/wiki:research "Tauri 2 mobile maturity 2026 production-ready plugins gaps"` |
| FGW chapter governance norms (Powder Keg-specific) | No article on Gini's stewardship, CSA pickups, in-person rhythms; assess relies on app design alone | `/wiki:ingest https://www.powderkegfarms.com` (already done in earlier research transcript; surface that into a wiki article) |
| Blossom v Imeta v NIP-96 history & status | Code uses Blossom; no decision-trail article | `/wiki:research "Blossom BUD-01 NIP-96 deprecation status 2026"` |
| Compost data integrity standards (TMECC, USDA-NRCS Code 317 PFRP) | Pile event content shape evolved without consulting these | `/wiki:research --mode thesis "kind:30078 pile content matches USCC TMECC and NRCS-317 PFRP requirements"` |

---

## Opportunities (Wiki / market knows it, Repo doesn't yet)

Sourced from the Best Practices, Adjacent, and Emerging agents. Ranked by impact × feasibility for the next 1–3 waves.

| Opportunity | Source | Impact | Complexity | Notes |
|---|---|---|---|---|
| **K-anonymity floor on any aggregate geo render** | Best Practices E2 (Strava lessons) | High | Low | Suppress any heatmap/cluster bucket with `count < k` (k = 3 minimum). Today only point markers exist (`src/routes/Map.tsx`); pre-empt before a "compost density" heatmap ships. |
| **Per-pile/per-listing "obscured" geo flag** | Adjacent #1 (iNaturalist) | High | Low-Med | Augment SPEC-011/013 forms with a `geo_visibility: 'precise' \| 'obscured' \| 'private'` field; obscured renders the geohash-5 cell centroid only. UI marker variant tells the viewer which. |
| **Cooperative claim windows on labor events** | Adjacent #2 (Crisis Cleanup) | High | Med | Extend SPEC-015 claims with auto-expire (N hours) + multi-claim slots ("2/4 going"). Cleaner than RSVP-only for turn days. |
| **In-person QR bootstrap for new chapter members** | Adjacent #5 (Briar) | High | Med | At a Sunday gathering, member shows QR → invitee scans → `inviteByNpub` runs in one step. Chapter-elder-mediated invites at scale. |
| **Blockout dates for volunteers** | Adjacent #7 (Planning Center) | Med | Med | Members pre-mark unavailability (NIP-52 calendar, kind 31922 = date-based); turn-day matchmaking respects them. Inverts the chase model. |
| **Land-relationship field on piles** | Adjacent #8 (Restor) | Med | Low | Add `land_relationship: owned/leased/borrowed/church-stewarded` to `Pile` type; surfaces on PileDetail. Pastorally + legally hygienic. |
| **NIP-65 outbox respect for cross-community profile/zap reads** | Best Practices A1 | Med | Med | Single chapter relay is right for *chapter content*, but profile metadata of npubs from outside the chapter often lives elsewhere. Add a *read-only outbox-aware* fallback for kind-0 fetches when the chapter relay returns nothing. |
| **NIP-06 mnemonic + NIP-49 ncryptsec backup in onboarding** | Best Practices A4 | Med | Med | Today nsec-local is encrypted but not exportable as a recovery phrase. Adding NIP-06 derivation + NIP-49 export makes account portability real for non-technical users. |
| **NIP-46 bunker pairing UX (nsec.app + Amber intent)** | Best Practices A3 | Med | Med | SPEC-008 + SPEC-035 ship the protocol; the *paired-app discovery* UX (nostrconnect QR, Amber intent) is the polish layer. |
| **Bundle code-splitting** | Best Practices B3 | Low-Med | Low | 832 KB main chunk → split nostr-tools / NDK / Dexie via Vite `manualChunks`; defer Blossom-only deps. Target main < 300 KB gz. |
| **Tauri biometric-unlock plugin for nsec** | Emerging B1 | Med | Med | `@tauri-apps/plugin-biometric` is shipping. Wraps SPEC-009/034 unlock so the user doesn't re-type passphrase per session. |
| **Tauri deep-link plugin for `nostr:` and `compostmkt:` URIs** | Emerging B1 | Med | Low | Shipping. Lets `compostmkt://invite-request?npub=...` from SPEC-026 actually open the right route on click. |
| **NIP-99 reservations / escrow extensions** | Emerging A2 | Med | Med | PRs #2335/#2334 (Q3-Q4 2026). Reservation events fit "I'll bring 3 bales of straw to the workday" cleanly. Add to `src/lib/listings/` once landed. |
| **Marmot encrypted groups (when stable)** | Emerging A1 | High when ready | High | NIP-EE retired; Marmot MDK is "do not use in production" today. Track for Q4 2026 / 2027 to add chapter group chat. |
| **BLE-mesh Nostr (BitChat-style)** | Emerging F | High for rural | High | Hollers and rural FGW chapters with patchy LTE. iOS-only today; Tauri-compatible Rust BLE-mesh layer is the gap. Track. |

---

## Market Gaps (Neither covers, but competitors / market addresses)

Capabilities competitors ship that fGw deliberately does *not* — listed because each one is a UX-floor expectation users will arrive with.

| Capability | Who has it | Relevance to fGw | Notes |
|---|---|---|---|
| Lightning / fiat / Cashu payments on listings | Shopstr, Plebeian Market (archived), MakeSoil donations | Low | SPEC § 7 + § 8 explicitly defer; FGW barter-economy ethos disfavors. Revisit only if a chapter requests. |
| Algorithmic feed | Nextdoor, FB, Olio | **Negative** | fGw's chronological feed is a *feature*. Front Porch Forum (Adjacent) validates this choice (80% rate respectful). |
| Address-verification onboarding | Front Porch Forum, Nextdoor | Med | Pyramid invite-tree is fGw's equivalent — known-human-in-the-chapter is stronger than address verification. Document this in the Learn page so users know why no address. |
| Threaded comments on a listing | All centralized competitors | Med | NIP-22 supports kind-1111-style replies; not yet wired into ListingDetail's claims list. Worth adding. |
| Push notifications when backgrounded | Olio, Buy Nothing app, Nextdoor | High | Currently local-only (Tauri plugin); blocked on Emerging B1 (Tauri push plugin). |
| Search across listings + events | All centralized; Coracle (NIP-50 if relay supports) | Med | Pyramid relay's NIP-50 status TBD; client-side filter exists but doesn't scale past ~500 events. |
| Multi-photo attachments | All competitors | Low | Already supported; verify via SPEC-019 NewListing form. |
| Chapter directory | None of the Nostr clients; Nextdoor "neighborhoods", FB groups | Low | SPEC § 7 explicitly defers. The "you must be told the URL" model is a deliberate trust filter. |
| Email/SMS digest for non-app users | Front Porch Forum (daily digest), Buy Nothing | Med | A web-relay-bridge that emails a digest of new listings to chapter elders not on the app would solve the "Gini doesn't open the app daily" problem. |
| Web-readable read-only mode | Coracle | High | SSB lesson (Failures A): invite-only with no read-mode = empty-timeline death. Spawn a public page (chapter.example.com) showing the chapter's *public* events so prospective members can see the chapter is alive. |

---

## Competitive Landscape

| Competitor / Tool | Overlap with fGw | Unique features | Weaknesses |
|---|---|---|---|
| **Coracle** | Closed-relay/AUTH support, NIPs 99/52/17/32/72; could be configured as a chapter client | Most NIP coverage in the ecosystem, communities + lists primitive | Generic kitchen-sink; no compost-pile vertical, no FGW invariants, no Tauri desktop |
| **Shopstr** | NIP-99 listings + NIP-17 DMs + Blossom media | Lightning + Cashu payments wired | No NIP-52 events, no NIP-32 reputation, no geo-scoping, no invite-only relay UX |
| **Plebeian Market** | NIP-99 + auctions + Lightning | None — repo archived March 2025 | Stale; do not adopt patterns blindly |
| **Amethyst** | NIP-99/52/17/72 on Android | Most-featured mobile Nostr client | Android only, generic feed UX |
| **MakeSoil** | Pile-build coordination workflow | Geo discovery for soil sites | Centralized SaaS; no chapter sovereignty; no labor-event RSVPs |
| **ShareWaste** | Was the canonical compost-neighbor matcher | None — site abandoned (HTTP 403) | Effectively dead; users migrated to MakeSoil |
| **Buy Nothing app** | Hyperlocal gift economy, Asks/Gives/Gratitude post types | Massive scale (14M+) | Facebook-dependent, 2025 trademark fights, hyperlocal-boundary redlining |
| **Olio** | "Food Waste Heroes" volunteer pickup (≈ turn-day claim) | iOS+Android, retailer pickups, 7M+ users | Centralized, ad/retailer-funded, fails in low-density rural areas |
| **Freecycle** | 12M members, town-scoped, web-community | Volunteer-moderated, free, town groups | Thin mobile, weak photo/DM UX, governance disputes (Freegle split) |
| **Nextdoor** | "For Sale & Free" marketplace + events + DMs + photos + geo | 88M users, address-verified | Ad-funded, algorithmic feed, profiling problems |
| **Front Porch Forum** | Town-scoped community, no algorithm, no infinite scroll, daily digest | 80% respectful interactions, Vermont public-benefit | VT/NY/MA-only, no native marketplace primitive |
| **Mobilizon** | Federated events with manual RSVP approval | Multiple identities per account | Activity-Pub federation overhead; no compost vertical |
| **Briar** | In-person QR contact bootstrap, member-to-member invites | Bluetooth handshake, locally-assigned petnames | Mobile-only, niche audience |
| **Crisis Cleanup** | Cooperative claim model with time-boxed windows | Multi-org workpool sharing | Disaster-response specific |
| **Sahana** | Modular volunteer/resource/identity framework | Separable modules per chapter need | Ops-heavy, Drupal-era stack |
| **Planning Center Services** | Volunteer blockout dates + auto-fill scheduling | Self-service signup sheets | Centralized SaaS, churchgoing-context only |
| **iNaturalist** | Tiered geo-privacy (open/obscured/private) | Per-record privacy + trust grants | Citizen-science verticalo, not coordination |
| **hOurworld** | 0.25h time-banking with offer/request/many-to-one | Category-based human-initiated matching | Web-1 era UX, low geographic density |

**Direct overlap risk**: Coracle (could host a chapter) and MakeSoil (workflow-similar, centralized). fGw wins on sovereignty vs MakeSoil and on FGW-vertical fit vs Coracle.

**No competitor combines**: invite-only Nostr relay + chapter-vertical compost coordination + FGW-doctrine constants + native mobile + reputation + photos + DMs. fGw is unique on its job-to-be-done.

---

## Emerging Trends

What's coming in the next 3–12 months that fGw should prepare for. Tracked items, with relevance:

| Trend | Timeline | Relevance | Notes |
|---|---|---|---|
| **Marmot Protocol (replacement for NIP-EE encrypted groups)** | Q4 2026 / 2027 | **High** | Marmot MDK + whitenoise messenger crate exist but explicitly "do not use in production." fGw has only 1:1 DMs; chapter coordination needs encrypted groups. Track. |
| **NIP-99 reservations + escrow + accommodations PRs** | Q3-Q4 2026 (PRs #2335/#2334/#2333) | **High** | Reservation events map 1:1 to "I'll bring N bales to the workday." Escrow could underpin barter trust without ever introducing money. |
| **Tauri push-notifications plugin** | Q4 2026+ | **High** | Without it, fGw cannot wake users for new compost-pickup requests when app is backgrounded. Today: local-only via tauri-plugin-notification. |
| **Tauri fs/biometric/deep-link plugins maturing** | Q3-Q4 2026 | **High** | deep-link is shipped — adopt now for `compostmkt://invite-request` and `nostr:` URIs. biometric is shipped — adopt for nsec unlock UX. |
| **NIP-29 subgroups + role permissions** | Q3 2026 (PRs #2319, #2316) | Medium | Chapter > workday > crew hierarchy is a natural subgroup fit if fGw adopts NIP-29 alongside NIP-72. |
| **NIP-AB device pairing + NIP-340 FROST quorum** | Q4 2026 / 2027 | Medium | Multi-steward signing for chapter accounts and pairing steward's phone+laptop. |
| **Cashu / NIP-60 nutshell wallets** | Q3 2026 broader adoption | Medium | Offline-friendly micro-value receipts ("thanks for the compost") without custodial Lightning. |
| **BLE-mesh Nostr (BitChat-style)** | Q4 2026 / 2027 (Android port pending) | High for rural | Patchy-LTE FGW chapters benefit; iOS app exists, Tauri-compatible Rust BLE-mesh is the gap. |
| **Apple Foundation Models / Gemini Nano on-device** | Already shipped | Low-Medium | "Summarize this chapter feed" / "draft a listing" — useful but Tauri bridge required; battery cost on Android mid-tier. |
| **No native-Nostr push draft emerging** | — | — | Vendor push (FCM/APNs) remains the path. |

---

## Failure Modes fGw Is At Risk Of Repeating

Five anti-patterns surfaced by the Failures agent, ranked by current exposure:

1. **OpenBazaar's empty-marketplace death** (cold start). Nostr + invite-tree + a small chapter with no seeded listings = "log in, see nothing, leave." **Mitigation**: write a "chapter seeding plan" before invites open — pre-populate with 5–10 real listings (chapter members' compost surplus, mulch availability, planned turn days for the season). Track as inventory candidate.

2. **Strava heatmap geo-leak**. fGw's geohash precision tiers exist (good) but no enforcement against "single rural pile at precision-7 = doxxing the host." **Mitigation**: ship the iNaturalist-style obscured-by-default flag (Opportunities table) before any aggregate map visualization is added. Audit every pile creation form for "address" precision being opt-in.

3. **Buy Nothing's legitimacy revolt**. App built *for* an existing community without mirroring its human hierarchy → elders revolt. **Mitigation**: explicit chapter-elder roles in Pyramid (already supported), document the "elder approves invite" path in `Learn.tsx`, never centralize control under app maintainers.

4. **Diaspora's "the community will run it"**. Federation rhetoric covering for an absent maintainer. **Mitigation**: name a project BDFL in README + SPEC; commit a "we will never" list (no ads, no data sale, no LE data sharing without warrant) into SPEC § 8.

5. **Couchsurfing's growth-dilution collapse**. Doubling membership beyond capacity destroys the trust system. **Mitigation**: codify a *product-level* hard cap on chapter size (e.g., Pyramid's `MaxInvitesAtEachLevel` × tree depth); refuse invites past the cap with a "this chapter is full, ask the steward to spawn a satellite" UX.

**Less critical but worth noting**: Olio's rural-density failure mode (push, not pull, for FGW chapters); SSB's empty-on-arrival problem (web-readable mode for prospective members); iOS Web Push history (don't rely on PWA for notifications — Tauri native is the right call).

---

## Recommended Actions

**Research** (fill wiki gaps, no code change):
- `/wiki:research "Farming God's Way Field Guide compost spec" --sources 5` → wiki/references/fgw-field-guide.md
- `/wiki:research "fiatjaf pyramid relay invite tree HTTP API" --sources 8` → wiki/references/pyramid-relay.md
- `/wiki:research --mode references "NIP-99 NIP-52 NIP-17 NIP-32 NIP-72 NIP-46 NIP-07 NIP-92 NIP-98 BUD-01"` → wiki/references/nips-and-buds.md
- `/wiki:research "Tauri 2 mobile maturity 2026 plugins gaps"` → wiki/references/tauri-2-mobile.md
- `/wiki:research --mode thesis "kind:30078 pile content matches USCC TMECC and NRCS-317 PFRP requirements"` → wiki/theses/pile-shape-vs-tmecc.md
- `/wiki:ingest https://www.powderkegfarms.com` → raw/articles/, then compile into wiki/topics/powder-keg-chapter.md

**Build (next wave candidates)** — ranked by impact:

| # | Action | SPEC# (suggested) | Wave |
|---|---|---|---|
| 1 | Geo k-anonymity + obscured-by-default flag | SPEC-036 | Wave 10 |
| 2 | Cooperative claim windows + multi-claim slots | SPEC-037 | Wave 10 |
| 3 | Chapter-seeding plan + onboarding-day kit (Briar-style in-person QR) | SPEC-038 (process + a Wave-10 mini-feature) | Wave 10 |
| 4 | Land-relationship field on piles | SPEC-039 | Wave 10 |
| 5 | NIP-65 outbox-aware kind-0 fallback | SPEC-040 | Wave 11 |
| 6 | NIP-06 mnemonic + NIP-49 ncryptsec backup in onboarding | SPEC-041 | Wave 11 |
| 7 | Tauri biometric-unlock plugin | SPEC-042 | Wave 11 |
| 8 | Tauri deep-link plugin + `compostmkt://` handler | SPEC-043 | Wave 11 |
| 9 | Bundle code-splitting (Vite manualChunks; nostr-tools, NDK, Dexie) | SPEC-044 | Wave 11 (small) |
| 10 | NIP-22 threaded comments on listings | SPEC-045 | Wave 12 |
| 11 | Public web-readable chapter index (read-only mode) | SPEC-046 | Wave 12 |
| 12 | Email-digest bridge for non-app chapter members | SPEC-047 | Wave 12 |
| 13 | Hard chapter-size cap enforced in product | SPEC-048 | Wave 12 |
| 14 | "We will never" public commitment + named maintainer in README | docs only | Wave 10 |

**Monitor** (no action this wave):
- NIP-99 reservations/escrow PRs (#2335/#2334).
- Marmot encrypted-groups stability (Q4 2026 / 2027).
- Tauri push-notifications plugin maturation.
- BLE-mesh Nostr Android port + Tauri Rust integration.

---

## Confidence Notes

**High confidence**:
- All "Repo + Wiki agree" claims (verified against shipping code by Docs and Features agents).
- Locked architectural decisions (SPEC § 8 cited verbatim).
- Test count (267/267 across 37 files; verified against commit cd90988).
- Direct competitor analysis (Coracle, Shopstr, Amethyst — all sourced).

**Medium confidence**:
- Best-Practices recommendations (some "fGw alignment: not yet evaluated" — needs spot checks before acting).
- Emerging-trends timelines (research-grade; Marmot stability date is the ecosystem's best guess, not committed).
- Failures agent's diagnoses (some patterns inferred from press, not first-party post-mortems — Crisis Cleanup model documented from NVOAD literature, FarmLogs from agtech press).

**Low confidence**:
- Gemini Nano / Apple Foundation Models impact for rural FGW demographic (low reach assumption).
- Cashu / NIP-60 adoption curve (depends on chapter steward attitudes toward value receipts).
- BLE-mesh Nostr Android port timeline (project-pace dependent).

The wiki is brand new today (3 raw sources, 0 articles). After running the recommended `/wiki:research` commands, re-running `/wiki:assess` in 30 days should expose true repo↔research gaps. Today's report is a market-and-failures analysis with the project's own SPEC as the wiki's only knowledge.
