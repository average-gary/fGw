---
title: "fGw master plan (home-dir, SPECs 001–035)"
type: source-note
source: "~/.claude/plans/i-want-to-create-declarative-duckling.md"
ingested: 2026-05-20
provenance: |
  Live master copy of the planning document maintained across all
  swarm waves. Includes §9 (post-MVP TODO sweep, SPECs 030–035) and
  the SPEC-003 acceptance correction. This is the authoritative spec
  for the project.
---

# Compost Marketplace on Nostr — Spec-Driven Plan for Agent-Swarm Execution

## How to read this document

This plan is structured for parallel execution by an agent swarm. Each `SPEC-XXX` is a self-contained unit: it states **what** must exist, the **public contract** (types, files, behaviors), **dependencies** on other specs, and **acceptance criteria** that prove it's done. An agent should be able to pick a spec, read only its dependencies, and produce code that passes the acceptance test without consulting the rest of the document.

Sections:
1. **Charter** — why we're building this, what success looks like.
2. **Domain Model** — the single source of truth for entities and FGW invariants. Every spec references this.
3. **Architecture** — non-negotiable platform decisions.
4. **Specs** — the work units (SPEC-001 through SPEC-029).
5. **Swarm Execution Graph** — wave-by-wave parallelism map.
6. **Verification Suite** — end-to-end smoke tests independent of any single spec.

---

## 1. Charter

### Problem
Powder Keg Farms (High View, WV — USDA Zone 6b) is the local Farming God's Way (FGW) chapter. FGW practice requires labor- and material-intensive work in narrow seasonal windows. A single 2 m × 2 m × 2 m compost pile needs ~15 × 50 kg bags of fresh manure, ~8 m³ of green material, ~4 m³ each of woody and dry inputs, water, and 5–6 turns over 2 months before a 4-month cure (FGW Field Guide, p. 31–34). No single household sources that alone — coordination across the community is required. Powder Keg has no current channel for this beyond email + Facebook.

### Outcome
A relay-based Nostr application that lets a compost builder list a **need**, a holder list an **offer**, and neighbors **volunteer** to fulfill or transport. It schedules **community labor events** — pile builds, FGW-spec turn days, mulch drives, planting days — with RSVPs. Photos via Blossom. Reputation via NIP-32 reviews. Decentralized: the chapter's relay is the chapter's identity.

### Success criteria
- Powder Keg's circle uses the app to coordinate at least one full pile lifecycle (build → 5–6 turns → cure → consumption) within the first season after launch.
- A second FGW chapter can deploy by spinning up its own relay and signing its own NIP-72 community event — no fork of the app required.
- Non-technical users (farmers, CSA members) can onboard, post a listing, and respond to one without help.

---

## 2. Domain Model

### 2.1 Chapter ↔ Relay identity
A **chapter is a relay**. There is exactly one canonical relay URL per chapter; the chapter's identity, moderation, membership norms, and data sovereignty live with that relay. Powder Keg WV's relay is `wss://chat.virginiafreedom.tech`.

A chapter is also represented as a NIP-72 community event (kind 34550, `d` = chapter slug) signed by the chapter steward, published to that chapter's relay. The community event's `relay` tag self-declares the canonical relay URL.

The user is on **exactly one chapter at a time**. Switching chapters is the same gesture as switching relays. The app exposes no chapter directory and no relay list. To join another chapter, the user types its relay URL freehand (presumably learned from another human).

### 2.2 FGW compost invariants
Extracted verbatim from `farming-gods-way.org/Resources/FGW_Field_Guide.pdf`. Encoded as `src/domain/fgw.ts` constants — no magic numbers elsewhere in code.

```ts
export const PILE_REFERENCE_DIMENSIONS = { length: 2, width: 2, height: 2 } as const;  // metres
export const PILE_MIN_DIMENSIONS       = { length: 1.5, width: 1.5, height: 2 } as const;
export const PILE_PRESETS = [
  { id: 'standard',   label: 'Standard',   dimensions: { length: 2, width: 2, height: 2 } },
  { id: 'large',      label: 'Large',      dimensions: { length: 4, width: 4, height: 3 } },
  { id: 'commercial', label: 'Commercial', dimensions: { length: 6, width: 6, height: 6 } },
] as const;
export type PilePresetId = typeof PILE_PRESETS[number]['id'] | 'custom';

export const PILE_INGREDIENT_RATIOS = {
  manure: 0.10,
  green:  0.45,
  woody:  0.225,
  dry:    0.225,
} as const;

// One complete layer for the 2×2×2 reference pile. Larger piles scale ingredient
// totals and layer counts; per-layer thicknesses and water-per-layer remain constant.
export const PILE_LAYER_RECIPE = {
  woody_cm: 10,
  dry_cm:   10,
  green_cm: 20,
  manure_bags_50kg: 2,
  water_litres: { min: 50, max: 60 },
  layer_total_cm: 40,
} as const;
export const PILE_REFERENCE_LAYER_COUNT = { min: 8, max: 9 } as const;     // for 2 m height
export const PILE_TURN_SCHEDULE_DAYS = [3, 6, 9, 19, 29, 39] as const;     // from build day, all sizes
export const PILE_DEFAULT_TURN_HOUR_LOCAL = 9;                              // 9 AM in builder's TZ
export const PILE_CURE_DAYS = 120 as const;
export const PILE_TEMP_RANGE_C = { min: 55, max: 68 } as const;
export const PILE_MOISTURE_TARGET = 0.50 as const;                          // squeeze test

export const PLANTING_STATION = {
  in_row_cm: 60,
  row_cm:    75,
  organic_input_depth_cm:   15,
  inorganic_input_depth_cm: 8,
} as const;
export const MULCH = { thickness_cm: 2.5, coverage: 1.0 } as const;         // God's Blanket
```

**Pile scaling helpers** (`src/domain/pileMath.ts`, sourced from these constants):
- `layersForHeight(height_m: number): { min: number; max: number }` — `floor(height_m / 0.40)` to `ceil(height_m / 0.40)`, never less than `PILE_REFERENCE_LAYER_COUNT`.
- `volumeM3(d: Dimensions): number` — `length × width × height`.
- `scaledIngredients(d: Dimensions): { manure_50kg_bags, green_m3, woody_m3, dry_m3, water_litres }` — scales the reference 2×2×2 → 8 m³ totals (15 manure bags / 8 m³ green / 4 m³ woody / 4 m³ dry / ~400 L water across 8 layers) by `volumeM3(d) / volumeM3(PILE_REFERENCE_DIMENSIONS)`.
- `staffingEstimate(d: Dimensions, task: 'build' | 'turn'): { min_volunteers: number; est_hours: number }` — heuristic: `build` ≈ 1 person per 2 m³, ≥ 2 hr; `turn` ≈ 1 person per 4 m³, ≥ 1.5 hr.

Constants are sacred — validators refuse pile records that violate them; UI pre-fills defaults; education content cites them.

### 2.3 Entities

| Entity | Description | Identity | Lifecycle |
|---|---|---|---|
| **Chapter** | A community + its relay | relay URL + chapter `d`-tag | Long-lived; created once per chapter |
| **User** | A Nostr pubkey | npub | Per-device key or external signer |
| **Listing** | A `Need` or `Offer` | `kind:30402:pubkey:d-tag` | Posted → claimed → fulfilled → reviewed |
| **Pile** | An FGW compost pile | `kind:30078:pubkey:d-tag` | DRAFT → COLLECTING → BUILDING → ACTIVE_TURNS → CURING → READY → CONSUMED |
| **Labor Event** | Scheduled work (build, turn, mulch drive, planting) | `kind:31923:pubkey:d-tag` | Scheduled → RSVPs collected → occurs → optional review |
| **RSVP** | Response to labor event | `kind:31925` | accepted / tentative / declined |
| **Claim** | Volunteer responding to listing or event | `kind:1` reply with `e`-tag | Pending → accepted → fulfilled |
| **DM** | Private negotiation | `kind:14` gift-wrapped (NIP-17) | Per-thread |
| **Review** | Post-fulfillment reputation signal | `kind:1985` (NIP-32) | One per (reviewer, target, listing/event) |
| **Photo** | Media attached to listings/piles/events | Blossom URL + SHA-256 in `imeta` | Uploaded once, referenced by hash |

### 2.4 Material taxonomy
Single source: `src/domain/materials.ts`.

```ts
export const MATERIAL_KINDS = [
  // Compost inputs
  'manure-fresh', 'manure-aged', 'manure-poultry', 'manure-rabbit',
  'green-grass', 'green-weeds', 'green-veg-scraps', 'green-legumes',
  'woody-stalks', 'woody-branches', 'woody-cardboard', 'woody-shavings',
  'dry-leaves', 'dry-thatch', 'dry-straw',
  // Outputs / soil
  'compost-finished', 'compost-curing', 'mulch', 'biochar', 'wood-ash', 'lime',
  // Other
  'seeds', 'tools', 'labor',
] as const;
export type MaterialKind = typeof MATERIAL_KINDS[number];
```

These map 1:1 to `t` tags on listings (`material:manure-fresh`).

### 2.5 Quantity units
Listings carry a structured quantity. Single source: `src/domain/quantity.ts`.

```ts
export const QUANTITY_UNITS = [
  'bag-50kg', 'bag-25lb', 'bucket-5gal', 'wheelbarrow', 'pickup-load',
  'cubic-yard', 'cubic-meter', 'kilogram', 'pound', 'ton',
  'hour',     // for `labor` material
  'count',    // generic for tools/seeds
] as const;
export type QuantityUnit = typeof QUANTITY_UNITS[number];
export type Quantity = { value: number; unit: QuantityUnit };
// canonicalToM3(q): number  — for compost inputs, normalises to m³ where possible; null for incompatible units.
```

Quantity emits a tag `quantity:<value>:<unit>` on the listing event. UI displays the unit per its locale-friendly label (`bag-50kg → "50 kg bag"`).

---

## 3. Architecture

### 3.1 Stack (locked)
- **Tauri 2** — single Rust shell targeting iOS, Android, macOS, Windows, Linux, plus standalone web build.
- **Frontend**: Vite + React 18 + TypeScript 5 + Tailwind CSS. Mobile-first responsive.
- **Nostr**: `@nostr-dev-kit/ndk`.
- **Media**: `blossom-client-sdk` (BUD-01/02/06 over NIP-98 auth).
- **Geohash**: `ngeohash`.
- **Cache**: NDK Dexie cache (web) / `tauri-plugin-sql` SQLite (native).
- **Map**: Leaflet via `react-leaflet`.
- **State**: TanStack Query for relay subscriptions; `zustand` for UI state.
- **Test**: Vitest (unit), Playwright (e2e against a local relay).

### 3.2 Default services (locked, single, switchable only by explicit user action)
- **Relay**: `wss://chat.virginiafreedom.tech`. See Domain Model § 2.1.
- **Blossom server**: `https://chat.virginiafreedom.tech` — same FQDN as the relay (Pyramid bundles a Blossom server). No fallback; if uploads fail the user sees an error.

The "Change chapter" Settings flow is the only exit from the default. No curated lists, no recents, no suggestions. Switching chapter swaps both the relay and the Blossom endpoint together.

### 3.4 Privacy & geo precision
Geohash precision is a per-listing/per-pile/per-event choice on creation, with sensible defaults. The form exposes a slider with these labels:

| Precision | Geohash chars | Approx accuracy | Default for |
|---|---|---|---|
| Region | 4 | ±20 km | (option) |
| Town | 5 | ±2.4 km | Listings, piles |
| Neighborhood | 6 | ±610 m | (option) |
| Street | 7 | ±76 m | Labor events |
| Address | 8 | ±19 m | (option, opt-in only) |

Free-text `location` field is independent of geohash and visible to all readers of the event. Users are responsible for what they put there.

### 3.5 Privacy on photos
All photos uploaded via `src/lib/blossom.ts` are passed through `src/lib/image.ts` first:
- **EXIF stripped** — every metadata block, including GPS, removed.
- **Resized** — longest edge ≤ 2048 px, re-encoded JPEG quality 0.85, target ≤ 2 MB.
- **Hash recomputed** *after* transformation — `imeta` SHA-256 is of the bytes actually uploaded.

### 3.6 Local notifications
`tauri-plugin-notification` schedules local notifications for:
- Pile turn days (`PILE_TURN_SCHEDULE_DAYS` × pile count) — defaulted to `PILE_DEFAULT_TURN_HOUR_LOCAL` (9 AM local).
- Listings the current user posted that are about to expire (24 h prior).
- Labor events the current user RSVPed to (24 h and 1 h prior).
No remote push; no server. If Tauri permissions denied, fall back to in-app banner only.

### 3.7 Schema versioning
Every event whose `content` is structured JSON includes a `version: 1` field at top level. Decoders refuse unknown major versions and surface a "this listing was made by a newer version of the app" placeholder. Applies to: kind 30078 (Pile), any custom-shaped content.

### 3.3 Auth (all three supported, ranked by onboarding preference)
1. **NIP-07** browser extension (Alby, nos2x) — preferred when present.
2. **NIP-46** remote signer (Amber on Android, nsec.app) — for users with bunker URLs.
3. **Generated nsec** — encrypted via WebCrypto + passphrase, stored in Tauri secure store on native, IndexedDB on web. Onboarding nudges backup with a forced reveal-and-confirm step.

---

## 4. Specs

Each spec has: `Goal`, `Inputs` (deps), `Contract` (public surface — types, file paths, exported names), `Behavior`, `Acceptance` (test that proves it works). Agents may add private helpers but may not extend the public contract without coordination.

### Layer A — Foundation (no Nostr coupling)

#### SPEC-001 — Project scaffold
- **Goal**: Bootstrap the repo. Empty fGw becomes a runnable Tauri 2 + Vite + React + TS project.
- **Inputs**: none.
- **Contract**:
  - `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`.
  - `src-tauri/{Cargo.toml, tauri.conf.json, src/main.rs}` with mobile + desktop + web targets enabled.
  - `src/{main.tsx, App.tsx, styles/tailwind.css}`.
  - Scripts: `dev`, `build`, `tauri dev`, `tauri build`, `test`, `lint`, `typecheck`, `e2e`.
- **Acceptance**: `pnpm install && pnpm dev` opens a "Hello" page in browser; `pnpm tauri dev` opens a native shell with the same page.

#### SPEC-002 — Domain constants module
- **Goal**: Encode FGW invariants, material taxonomy, quantity units, and pile-scaling math as TS constants/utilities.
- **Inputs**: SPEC-001.
- **Contract**:
  - `src/domain/fgw.ts` — exports all constants from § 2.2 verbatim, including `PILE_PRESETS`, `PILE_REFERENCE_DIMENSIONS`, `PILE_MIN_DIMENSIONS`, `PILE_DEFAULT_TURN_HOUR_LOCAL`.
  - `src/domain/pileMath.ts` — exports `layersForHeight`, `volumeM3`, `scaledIngredients`, `staffingEstimate` per § 2.2.
  - `src/domain/materials.ts` — exports `MATERIAL_KINDS`, `MaterialKind`, `materialLabel(kind)`, `materialCategory(kind)` (`'compost-input' | 'output' | 'other'`).
  - `src/domain/quantity.ts` — exports `QUANTITY_UNITS`, `QuantityUnit`, `Quantity`, `quantityLabel(unit, value)`, `canonicalToM3(q): number | null`.
  - `src/domain/geoPrecision.ts` — exports `GEO_PRECISION_LABELS` (table from § 3.4) and `truncateGeohash(hash, chars)`.
- **Acceptance**: `vitest src/domain/*.test.ts` — tests assert each constant matches Field Guide quote (test cites page number in comment); `scaledIngredients` for 6×6×6 returns ~27× the 2×2×2 totals; `canonicalToM3({ value: 1, unit: 'cubic-yard' })` ≈ 0.7646.

#### SPEC-003 — Geohash utilities
- **Goal**: Encode/decode geohashes, prefix-match for radius filtering, distance estimate.
- **Inputs**: SPEC-001.
- **Contract**: `src/lib/geohash.ts` exports:
  - `encode(lat: number, lon: number, precision?: number): string`
  - `decode(hash: string): { lat: number; lon: number }`
  - `prefixesForRadiusMiles(lat: number, lon: number, miles: number): string[]` — returns geohash prefixes covering the circle.
  - `distanceMiles(a: string, b: string): number`
- **Acceptance**: Unit tests: High View WV (`39.118, -78.660`) at precision 5 → `dnv*` family; `prefixesForRadiusMiles(..., 15)` includes the encoded value of a point 10 mi away and excludes a point 50 mi away.

#### SPEC-004 — UI primitives & theme
- **Goal**: Shared Tailwind components with an earthy, agrarian-but-modern aesthetic appropriate to the project. Avoid the generic AI-app look.
- **Inputs**: SPEC-001. Use the `frontend-design:frontend-design` skill.
- **Contract**: `src/components/ui/{Button, Input, Textarea, Select, Card, Badge, Sheet, Toast, Spinner}.tsx`. Tailwind theme extension in `tailwind.config.ts` for palette + typography.
- **Acceptance**: A `Storybook`-style `src/routes/_dev/Components.tsx` route renders every primitive; visual review by user.

### Layer B — Nostr core

#### SPEC-005 — NDK singleton bound to one relay
- **Goal**: Configure NDK with exactly the user's current chapter relay. No additional relays, no failover.
- **Inputs**: SPEC-001, SPEC-006 (relay preference store).
- **Contract**: `src/lib/ndk.ts` exports:
  - `getNdk(): NDK` — lazy singleton; rebuilds on relay change.
  - `currentRelay(): string`
  - On unhandled relay error, surface via toast; do not silently retry on a different relay.
- **Acceptance**: Boot app, inspect NDK pool — only one relay connected. Change relay via SPEC-019 → pool drains old, connects new.

#### SPEC-006 — Relay/chapter preference store
- **Goal**: Persist the user's current chapter (relay URL) across sessions; default to `wss://chat.virginiafreedom.tech`.
- **Inputs**: SPEC-001.
- **Contract**: `src/lib/chapter.ts` exports:
  - `DEFAULT_RELAY = 'wss://chat.virginiafreedom.tech'`
  - `useCurrentRelay(): string` (zustand)
  - `setCurrentRelay(url: string): void`
  - `resetToDefault(): void`
- **Acceptance**: Set custom relay → reload → custom relay persists. `resetToDefault()` returns to `chat.virginiafreedom.tech`.

#### SPEC-007 — Auth: NIP-07
- **Goal**: Detect and use a browser-extension signer when present.
- **Inputs**: SPEC-005.
- **Contract**: `src/lib/auth/nip07.ts`:
  - `detectNip07(): boolean`
  - `loginWithNip07(): Promise<NDKSigner>`
- **Acceptance**: With Alby installed, `detectNip07()` is true and `loginWithNip07()` returns a signer that signs a kind-1 test event accepted by the relay.

#### SPEC-008 — Auth: NIP-46 (bunker)
- **Goal**: Connect to a remote signer via `bunker://` URI or QR.
- **Inputs**: SPEC-005.
- **Contract**: `src/lib/auth/nip46.ts`:
  - `connectBunker(uri: string): Promise<NDKSigner>`
  - `connectViaQR(): Promise<NDKSigner>` (web-only; native uses camera plugin in SPEC-024).
- **Acceptance**: Pasting a working `bunker://` URI authenticates and signs a test event.

#### SPEC-009 — Auth: local nsec with encryption
- **Goal**: Generate, encrypt, store, and load a private key locally for users with no external signer.
- **Inputs**: SPEC-005.
- **Contract**: `src/lib/auth/nsecLocal.ts`:
  - `generateAndStore(passphrase: string): Promise<{ npub: string }>`
  - `unlock(passphrase: string): Promise<NDKSigner>`
  - `revealNsecOnce(passphrase: string): Promise<string>` — returns nsec; logs reveal event; once-per-session UX warning.
  - Storage: `tauri-plugin-stronghold` on native, IndexedDB + WebCrypto AES-GCM on web.
- **Acceptance**: Generate → reload → unlock with correct passphrase → sign test event. Wrong passphrase rejected. Revealed nsec round-trips into another Nostr client successfully.

#### SPEC-010 — Auth orchestrator + onboarding
- **Goal**: Single `useAuth()` hook + onboarding route that picks NIP-07 → NIP-46 → local nsec in that order.
- **Inputs**: SPEC-007, SPEC-008, SPEC-009.
- **Contract**: `src/lib/auth/index.ts` exports `useAuth()`; `src/routes/Onboarding.tsx` walks the user through method selection, chapter join (defaults to Powder Keg, no prompt to change), and optional location consent.
- **Acceptance**: Fresh install → onboarding completes in ≤ 4 taps for default path (no extension, generated key).

### Layer C — Event encoders/decoders

Each of the following exports `encode(input): NDKEvent` and `parse(event: NDKEvent): T | null`. All include the chapter `a`-tag and (where relevant) `g` geohash + `t` material tags.

#### SPEC-011 — NIP-99 listings (Need / Offer)
- **Inputs**: SPEC-002, SPEC-003, SPEC-005.
- **Contract**: `src/lib/listings/{types.ts, encode.ts, parse.ts}`.
  - `Listing = { kind: 'need' | 'offer', material: MaterialKind, title, description, quantity?: Quantity, geohash?: string, geoPrecision?: number, locationText?: string, expiresAt?: number, photos: PhotoRef[], pileRef?: AddressableRef, version: 1 }`
  - Encoded as kind 30402 with required tags: `d`, `title`, `summary`, `t:material:<kind>`, `t:compost-need|compost-offer`, `a:34550:<chapter-pubkey>:<chapter-d>`, optional `g:<truncated-hash>`, optional `quantity:<value>:<unit>`, optional `location` (free-text), optional `imeta` per photo, optional `a:30078:...:<pile-d>`, `client:compost-marketplace`, `version:1`.
  - On encode, `geohash` is truncated to `geoPrecision` chars (default 5) before tagging.
- **Acceptance**: Round-trip encode → relay → fetch → parse equals input. A listing with `geoPrecision: 5` produces a `g`-tag of length 5 even if `geohash` is longer.

#### SPEC-012 — NIP-52 labor events + RSVPs
- **Inputs**: SPEC-002, SPEC-003, SPEC-005.
- **Contract**: `src/lib/events/{calendar.ts, rsvp.ts}`.
  - `LaborEvent = { kind: 'pile-build' | 'pile-turn' | 'mulch-drive' | 'planting-day' | 'harvest-day' | 'other', title, description, start: number, end?: number, locationText?: string, geohash?: string, geoPrecision?: number, pileRef?: AddressableRef, turnIndex?: number, minVolunteers?: number, estHours?: number, version: 1 }`
  - Encoded as kind 31923 with tags: `d`, `title`, `summary`, `start:<unix>`, optional `end`, optional `g:<truncated>`, optional `location`, `t:labor:<kind>`, `a:34550:...`, optional `a:30078:...:<pile-d>`, optional `min_volunteers:<n>`, optional `est_hours:<n>`, `client:compost-marketplace`, `version:1`.
  - Default `geoPrecision: 7` (street-level) for events; the form may downgrade to 5.
  - RSVPs as kind 31925 with `status:accepted|tentative|declined`, `a` ref to the event, `p` ref to the event author.
- **Acceptance**: Create a `pile-turn` event with `minVolunteers: 4`, `estHours: 2`. RSVP from a second key. Fetch RSVPs by `a`-tag → count is 1; staffing fields preserved on round-trip.

#### SPEC-013 — Pile state + events (kind 30078)
- **Inputs**: SPEC-002, SPEC-005, SPEC-012.
- **Contract**: `src/lib/pile/{types.ts, schedule.ts, events.ts, state.ts}`.
  - `Pile = { d, name, builder, locationText?, geohash?, geoPrecision?, dimensions, presetId: PilePresetId, plannedBuildDate, timezone: string, layers: LayerRecord[], turnRecords: TurnRecord[], state: PileState, cureUntil?, photos: PhotoRef[], version: 1 }`
  - `PileState = 'DRAFT' | 'COLLECTING' | 'BUILDING' | 'ACTIVE_TURNS' | 'CURING' | 'READY' | 'CONSUMED' | 'ABANDONED'`
  - Encoded as kind 30078 with `d:<slug>`, content = JSON of the Pile object, tags: `t:pile`, `a:34550:...`, optional `g:<truncated>`, `version:1`.
  - `generateTurnEvents(pile): LaborEvent[]` — applies `PILE_TURN_SCHEDULE_DAYS` to `plannedBuildDate`, with each event's `start` set to `PILE_DEFAULT_TURN_HOUR_LOCAL` in `pile.timezone`. Each event references the pile via `a`-tag and includes `staffingEstimate(pile.dimensions, 'turn')`.
  - `validatePile(pile): ValidationResult` — enforces `PILE_MIN_DIMENSIONS` floor, layer counts via `layersForHeight(height)`, and that ingredient totals (when present) approximate `scaledIngredients(dimensions)` within ±10%.
  - State machine reducer with explicit transitions (DRAFT → COLLECTING → BUILDING → ACTIVE_TURNS → CURING → READY → CONSUMED, plus any state → ABANDONED). No skipping forward.
  - Multi-pile UX: `Pile.name` is human-readable, `d` is auto-slug. `listMyPiles(builder): Pile[]` and `archivePile(d)` (sets state to `ABANDONED`).
- **Acceptance**:
  - 2×2×2 pile dated today → `generateTurnEvents` returns 6 events at +3/+6/+9/+19/+29/+39 days, each at 9 AM local with `min_volunteers: 1, est_hours: 1.5`.
  - 6×6×6 pile → same 6 events, each with `min_volunteers: ~14, est_hours: ≥1.5`.
  - `validatePile` rejects dimensions `{ length: 1, ... }`.
  - State machine refuses `DRAFT → CURING`.

#### SPEC-014 — NIP-17 gift-wrapped DMs
- **Inputs**: SPEC-005, SPEC-010.
- **Contract**: `src/lib/dm.ts`:
  - `sendDm(to: string, content: string, threadRoot?: string): Promise<void>`
  - `subscribeDms(): Observable<DecryptedDm>`
- **Acceptance**: Two pubkeys exchange messages; only intended recipient can decrypt; relay sees only kind 14 + 1059 wrappers.

#### SPEC-015 — Claims (kind 1 reply with semantic tag)
- **Inputs**: SPEC-005, SPEC-011, SPEC-012.
- **Contract**: `src/lib/listings/claim.ts`:
  - `claim(target: NDKEvent, message?: string): Promise<NDKEvent>` — posts kind 1 with `e:<target>` and `t:claim`.
  - `subscribeClaimsFor(target: AddressableRef): Observable<Claim[]>`
- **Acceptance**: Post listing, claim from second key, listing owner sees claim in inbox subscription.

#### SPEC-016 — Blossom media uploads
- **Goal**: Upload photos with NIP-98 auth, render gallery with hash verification.
- **Inputs**: SPEC-005, SPEC-010, SPEC-027.
- **Contract**: `src/lib/blossom.ts`:
  - Default Blossom server URL is derived from the current relay URL via `relayHttpsBase(currentRelay)` — i.e. `https://chat.virginiafreedom.tech` for the default chapter. (Pyramid bundles a Blossom server on the same host.)
  - `uploadPhoto(file: File): Promise<PhotoRef>` — first runs `transformImage(file)` from SPEC-027 (EXIF strip + resize), then uploads transformed bytes. `PhotoRef = { url, sha256, dim: { w, h }, mime, sizeBytes }`.
  - `imetaTag(p: PhotoRef): string[]` — produces NIP-92 `imeta` tag values: `url`, `m`, `x` (sha256), `dim`, `size`.
  - `verifyDownload(url: string, expected: string): Promise<Blob>` — refuses if hash mismatches.
- **Acceptance**: Upload a 4 MB JPG with GPS EXIF → resulting `PhotoRef.sizeBytes` ≤ 2 MB, `imeta` tag well-formed, download verifies hash, no GPS in EXIF.

#### SPEC-017 — Reputation reviews (NIP-32)
- **Goal**: Post and aggregate reputation labels per pubkey.
- **Inputs**: SPEC-005, SPEC-011, SPEC-012.
- **Contract**: `src/lib/reputation.ts`:
  - `postReview({ target: pubkey, listingOrEvent: AddressableRef, score: '+1' | '-1' | 'no-show', text?: string }): Promise<void>` — kind 1985 with `L:compost-marketplace.review`, `l:<score>;compost-marketplace.review`, `p:<target>`, `e:<reference-event-id>`.
  - `useReputation(pubkey): { score: number; positive: number; negative: number; noShows: number; reviews: Review[] }` — subscription hook.
  - Self-reviews are filtered out at query time. One review per (reviewer, target, listing/event) tuple — later reviews replace earlier (use `d`-tag to make addressable: `d:review:<target>:<reference-event-id>`).
- **Acceptance**: Three keys post reviews on a target; aggregate score is computed correctly. Self-review is dropped.

### Layer C* — Cross-cutting infrastructure

#### SPEC-027 — Image transform (EXIF strip + resize)
- **Goal**: Strip metadata and resize images before upload so we never publish GPS-tagged or oversized photos.
- **Inputs**: SPEC-001.
- **Contract**: `src/lib/image.ts`:
  - `transformImage(file: File): Promise<{ blob: Blob; sha256: string; dim: { w: number; h: number }; mime: 'image/jpeg' | 'image/png'; sizeBytes: number }>` — re-encodes via canvas, strips all EXIF, longest edge ≤ 2048 px, JPEG quality 0.85, target ≤ 2 MB. PNG inputs with transparency stay PNG; otherwise re-encoded as JPEG.
  - `extractExif(file: File): Promise<Record<string, unknown>>` — for *test only*; verifies stripping.
- **Acceptance**: Test fixture `/fixtures/gps-tagged.jpg` (with `GPSLatitude` EXIF) → after `transformImage` → `extractExif` returns no GPS tags; output `sizeBytes` ≤ 2 MB.

#### SPEC-028 — Profile (kind 0) editor + inbox unread badges
- **Goal**: Minimal profile editing and unread tracking for new claims and DMs.
- **Inputs**: SPEC-005, SPEC-010, SPEC-014, SPEC-015, SPEC-016.
- **Contract**:
  - `src/lib/profile.ts`:
    - `useProfile(pubkey: string): { displayName?, picture?, about?, nip05?, lud16? }` — subscribes to kind 0.
    - `updateProfile(patch: Partial<Profile>): Promise<void>` — publishes a new kind 0 with merged content.
  - `src/lib/inbox.ts`:
    - `useUnreadCounts(): { claims: number; dms: number; total: number }` — counts events newer than `lastSeenAt[kind]` stored in IndexedDB / Tauri SQLite.
    - `markRead(scope: 'claims' | 'dms'): void`
  - `src/routes/Profile.tsx` — view + edit own profile (display name, picture via SPEC-016, about); view-only for other pubkeys.
  - `src/routes/Inbox.tsx` — combined claims + DMs feed; tapping a row marks read.
- **Acceptance**: Edit display name + upload picture → kind 0 updates → next render shows new name. Two unread DMs + one unread claim → badge shows `3`; visiting Inbox marks all read; reload → badge `0`.

#### SPEC-029 — Local notifications (turn days, RSVPs, expiring listings)
- **Goal**: Time-sensitive reminders without server push, honouring FGW's "on time" principle.
- **Inputs**: SPEC-001, SPEC-013, SPEC-012, SPEC-011.
- **Contract**: `src/lib/notifications.ts`:
  - `requestPermission(): Promise<'granted' | 'denied'>` — wraps `tauri-plugin-notification`; on web, uses `Notification.requestPermission()`.
  - `scheduleNotificationsForPile(pile: Pile): Promise<void>` — schedules a notification for each upcoming turn at `PILE_DEFAULT_TURN_HOUR_LOCAL` in the pile's timezone.
  - `scheduleNotificationsForRsvp(event: LaborEvent): Promise<void>` — 24 h and 1 h before `start`.
  - `scheduleNotificationsForListing(listing: Listing): Promise<void>` — 24 h before `expiresAt`.
  - `cancelNotificationsFor(refId: string): Promise<void>` — by addressable ref.
  - On permission denial, all schedule calls become no-ops; UI shows an in-app banner badge instead.
- **Acceptance**: With permission granted, create a pile → 6 system notifications appear in OS scheduling (verifiable via `tauri-plugin-notification`'s `getPending()` shim). Cancel turn 3 → 5 remain. Permission denied → calls return without throwing.

### Layer C+ — Pyramid invite-only relay integration

`chat.virginiafreedom.tech` runs **fiatjaf/pyramid**, an invite-tree allowlist relay. Pyramid stores membership as an in-memory tree keyed by pubkey, persisted to a JSONL action log. Membership actions (`invite`, `drop`, `leave`) flow over **HTTP**, not custom Nostr event kinds, but are gated behind a NIP-42 AUTH session against the relay (so the inviter's pubkey is authenticated by the relay before its admin endpoints accept the action). Removal cascades — dropping a member also drops everyone they transitively invited. Per-level invite quotas are enforced via `MaxInvitesAtEachLevel`. There is **no NIP-11 advertisement** of invite-only mode; the failure mode for an unauthorized publish is `AUTH_REQUIRED` / `restricted` `OK` response.

The relay endpoints we depend on (from `pyramid/handler.go`):

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/allowed` | List active members (HTML; we parse) | Public read |
| GET | `/banned` | List removed members | Public read |
| GET | `/u/{pubkey}` | Member profile + inviter chain + invitees | Public read |
| POST | `/allow` | Invite (`type=invite&target=<hex-pubkey>`) | Authed member, within quota |
| POST | `/ban` | Drop (`type=drop&target=<hex-pubkey>`) | Authed root or inviter |

Pyramid's session is established by the same NIP-42 AUTH the relay already requires for Nostr publishes; the HTTP endpoints read `khatru.GetAuthed()` from the request context. We piggyback on a single AUTH'd connection by sending an authenticated NIP-98 HTTP-Auth header on these calls.

#### SPEC-025 — Pyramid invite client + state hooks
- **Goal**: Surface chapter membership status, expose a member→invite-neighbor flow, fail gracefully when an unauthorized user tries to publish.
- **Inputs**: SPEC-005, SPEC-010.
- **Contract**: `src/lib/pyramid.ts`:
  - `type MembershipStatus = 'unknown' | 'allowed' | 'banned' | 'not-listed'`
  - `useMembershipStatus(pubkey: string): MembershipStatus` — caches `/allowed` + `/banned` parses; refetched on relay change and on receipt of a kind-22242 (membership-change) event.
  - `inviteByNpub(npub: string): Promise<Result<void, InviteError>>` — POSTs to `${relayHttpsBase}/allow?type=invite&target=<hex>` with a NIP-98 auth header signed by the current user.
  - `dropMember(pubkey: string): Promise<Result<void, DropError>>` — same shape against `/ban`.
  - `parseMemberPage(html: string): MemberInfo` — extracts inviters/invitees from `/u/{pubkey}` HTML using a stable selector contract; falls back to empty arrays if structure changes.
  - `listMembers(): Promise<Member[]>` and `listBanned(): Promise<Member[]>`.
  - `relayHttpsBase(wssUrl: string): string` — derives `https://` from `wss://`.
  - `InviteError = 'not-authed' | 'over-quota' | 'cycle' | 'already-member' | 'forbidden' | 'network'`.
  - Hook `usePublishGuard()`: wraps any publish with a pre-check; on `restricted`/`auth-required` OK response from the relay, surfaces a `<NotAMemberSheet>` sentinel so callers can render the "ask for an invite" UI.
- **Behavior**:
  - On boot, fetch current user's membership status. Cache in zustand; bust on chapter switch.
  - When the user is `not-listed`, all "create" routes (NewListing, NewPile, NewEvent) render in read-only mode with a banner pointing to SPEC-026's request-invite flow.
  - When a member taps "Invite a neighbor" on a profile or feed item, run `inviteByNpub`; on success, show toast + optimistic add to local member cache.
- **Acceptance**:
  - Two profiles: A is a member, B is not. B opens app → membership status `not-listed` → publish UI is locked → SPEC-026 request flow available. A invites B's npub → B reloads → membership flips to `allowed` → publishing works.
  - Drop B from A → cascade verified by `listMembers()` not returning B nor anyone B invited.

#### SPEC-026 — Admin: member roster, invite tree, request-invite flow
- **Goal**: Give admins (and to a lesser extent regular members) a UI to see the chapter membership graph, invite, drop, and let prospective users request an invite.
- **Inputs**: SPEC-025, SPEC-004, SPEC-014 (DM, used for request-invite delivery).
- **Contract**: `src/routes/admin/`:
  - `Members.tsx` — full member roster from `listMembers()` with search, profile pic (NIP-05 / kind-0 metadata), and per-row actions (visible only when current user has authority over that row, i.e. `IsRoot(currentUser)` or `currentUser ∈ row.parents`).
  - `InviteTree.tsx` — graph view of the invite tree starting at root, expandable nodes. Reuses `parseMemberPage` for per-node inviter/invitee lists; lazy-loads.
  - `Banned.tsx` — list of banned members; root-only restore button (POSTs `/allow` again).
  - `RequestInvite.tsx` — for `not-listed` users: enter your npub (auto-filled from current key), pick one or more existing members to ask, optionally write a short note (e.g. "I'm a Powder Keg CSA member"); on submit, sends a NIP-17 DM to each chosen member with a deep link `compostmkt://invite-request?npub=<...>`. Accepting the DM in the app pre-fills the invite confirmation modal.
- **Behavior**:
  - Authority enforcement is **client-side only**; the relay is the source of truth and will reject unauthorized POSTs. UI hides actions the current user can't perform to reduce confusion.
  - Tree view marks the user's own node and the path from root to them.
  - "Invite from neighbor's profile" deep-link from SPEC-025 lands in `Members.tsx` with a pre-populated invite modal.
- **Acceptance**:
  - With root key: see entire roster, drop arbitrary members, invite by npub paste, restore banned.
  - With regular member key: see roster (read-only metadata), invite by npub (subject to quota), drop only their own invitees.
  - With non-member key: `RequestInvite.tsx` is the only admin-area route accessible; submitting sends DMs that, when opened by the receiving member, present an "Approve and send invite" prompt that calls `inviteByNpub` for them.

### Layer D — UI routes

Every route reads from Layer C subscriptions; no route imports another route. Cross-route navigation via React Router only.

#### SPEC-018 — Feed (mixed listings + upcoming events)
- **Inputs**: SPEC-011, SPEC-012, SPEC-015.
- **Contract**: `src/routes/Feed.tsx`. Filters: kind (need/offer/event/all), material taxonomy, geohash radius. Cards show poster pubkey + reputation badge.
- **Acceptance**: With seeded test data, filter to `material:manure-fresh` shows only matching items.

#### SPEC-019 — New listing
- **Inputs**: SPEC-011, SPEC-016 (photos), SPEC-013 (optional pile reference).
- **Contract**: `src/routes/NewListing.tsx`. Form validates required fields; supports photo attachment; lets user link to a pile they own.
- **Acceptance**: Submit minimal need → event published → appears in feed.

#### SPEC-020 — Listing detail + claim flow
- **Inputs**: SPEC-011, SPEC-015, SPEC-014, SPEC-017.
- **Contract**: `src/routes/ListingDetail.tsx`. Shows listing, claim button, claim list, inline DM thread launcher, post-fulfillment review form.
- **Acceptance**: From two browser sessions: post → claim → DM → mark fulfilled → review → reputation badge updates.

#### SPEC-021 — Pile wizard + detail + my-piles list
- **Inputs**: SPEC-013, SPEC-012, SPEC-016, SPEC-002, SPEC-029 (notifications scheduling).
- **Contract**:
  - `src/routes/NewPile.tsx` — wizard: pick preset (Standard/Large/Commercial/Custom from `PILE_PRESETS`); for Custom, enter L×W×H; auto-display `scaledIngredients(dim)` totals and `staffingEstimate(dim, 'build')`; pick name, location text + optional geohash with precision slider, planned build date + timezone (default to device TZ); preview the 6 turn events → "Create pile + publish turn schedule" submits the pile event then the 6 turn events; on partial failure, shows a "publish remaining" retry.
  - `src/routes/PileDetail.tsx` — layer checklist sized to `layersForHeight(dim.height)`, FGW recipe defaults, turn timeline component highlighting next turn, temp/moisture log, photo gallery, state-machine controls (advance/abandon).
  - `src/routes/MyPiles.tsx` — list of current user's piles (active + archived) with name, state, days until next turn. Tap → PileDetail. Archive button → ABANDONED.
  - On pile creation, schedule local notifications via `scheduleNotificationsForPile(pile)` (SPEC-029).
- **Acceptance**: Create a Commercial 6×6×6 pile → ingredient totals scale to ~27× the standard recipe → 6 turn events appear in calendar with `min_volunteers ≈ 14, est_hours ≥ 1.5` → check off layer 1 → state advances `BUILDING`. Local notification fires (in test mode) for the day-3 turn.

#### SPEC-022 — Calendar route
- **Inputs**: SPEC-012.
- **Contract**: `src/routes/Calendar.tsx`. Lists chapter events for the next 30 days; RSVP buttons; filter by event kind.
- **Acceptance**: A pile created in SPEC-021 surfaces 6 turn events in this view.

#### SPEC-023 — Map route
- **Inputs**: SPEC-003, SPEC-011, SPEC-012.
- **Contract**: `src/routes/Map.tsx`. Leaflet map; pins for listings + events with geohash. Click pin → opens detail.
- **Acceptance**: Three seeded listings at three different geohashes appear on the map.

#### SPEC-024 — Settings + chapter switch + Learn
- **Inputs**: SPEC-006.
- **Contract**:
  - `src/routes/settings/Settings.tsx` — surfaces current chapter (with relay URL underneath), auth method, default Blossom server, and a "Reset to default chapter" button.
  - `src/routes/settings/ChapterSwitch.tsx` — explicit, warning-gated free-form relay URL input. Confirmation copy: *"You're about to leave Powder Keg WV. Listings, events, piles, and people from this chapter will no longer appear. Switch to a relay you trust — usually one a friend or chapter leader has shared with you."* Type-to-confirm chapter name.
  - `src/routes/Learn.tsx` — markdown-rendered FGW education: Six Keys, Compost Recipe (cites `PILE_*` constants), On Time, Planting Station, God's Blanket. Source MD in `src/content/learn/`.
- **Acceptance**: Switch chapter → app reconnects to new relay → feed updates → reset → Powder Keg restored.

---

## 5. Swarm Execution Graph

Specs are grouped into waves. Within a wave, all specs may execute in parallel by separate agents. A wave starts only when the previous wave is complete.

### Wave 0 — Bootstrap (1 agent, sequential)
- SPEC-001

### Wave 1 — Foundation (3 agents in parallel)
- SPEC-002 (domain constants)
- SPEC-003 (geohash)
- SPEC-004 (UI primitives — uses `frontend-design:frontend-design` skill)

### Wave 2 — Auth + Relay (4 agents in parallel)
- SPEC-006 (relay preference store)
- SPEC-007 (NIP-07)
- SPEC-008 (NIP-46)
- SPEC-009 (local nsec)

### Wave 3 — NDK + Auth orchestration (2 agents in parallel)
- SPEC-005 (NDK singleton — needs SPEC-006)
- SPEC-010 (auth orchestrator + onboarding — needs 007/008/009)

### Wave 4a — Image transform (1 agent, must finish before SPEC-016)
- SPEC-027 (image transform)

### Wave 4 — Event encoders + Blossom (5 agents in parallel)
- SPEC-011 (listings)
- SPEC-012 (calendar + RSVP)
- SPEC-013 (pile)
- SPEC-014 (DMs)
- SPEC-016 (Blossom — depends on SPEC-027)

### Wave 5 — Cross-cutting features (5 agents in parallel)
- SPEC-015 (claims)
- SPEC-017 (reputation)
- SPEC-025 (Pyramid invite client + state hooks)
- SPEC-028 (profile + inbox)
- SPEC-029 (local notifications)

### Wave 6 — Routes (9 agents in parallel)
- SPEC-018 Feed
- SPEC-019 NewListing (uses SPEC-027 implicitly via SPEC-016)
- SPEC-020 ListingDetail
- SPEC-021 Pile (NewPile + PileDetail + MyPiles)
- SPEC-022 Calendar
- SPEC-023 Map
- SPEC-024 Settings + Learn
- SPEC-026 Admin: members, invite tree, request-invite
- SPEC-028's `Profile.tsx` and `Inbox.tsx` (separate route surfaces)

### Wave 7 — Verification (1 agent)
- Run § 6 verification suite end-to-end. Open issues for any failure as a follow-up SPEC-025+.

### Spawning convention for the swarm controller
For each wave, spawn one Agent per spec with subagent_type=`general-purpose` (or `Plan` for design-heavy specs), passing as the prompt:
1. The spec block itself (verbatim).
2. The Domain Model section (§ 2).
3. The Architecture section (§ 3).
4. The contracts of every spec listed in `Inputs:` (verbatim, no more).

Agents must not read other specs or other code beyond their dependencies. This keeps context per-agent small and prevents cross-talk that would cause merge conflicts.

A spec is complete when its acceptance test passes and a follow-up reviewer agent (subagent_type=`Explore`) confirms the contract is met without exceeding it (no extra exports, no behaviors beyond the spec).

---

## 6. Verification Suite (independent of any single spec)

Run after Wave 7. Two browser profiles `A` and `B`, each with its own generated nsec, both pointing at the default relay `wss://chat.virginiafreedom.tech` (or a local `nostr-rs-relay` with the chapter community event seeded).

### V1 — Onboarding
- A and B install fresh, complete onboarding via generated nsec, land on Powder Keg feed (empty).

### V2 — Listings
- A posts a need: "5 bags fresh manure by 2026-06-01, High View WV". Verify event hits relay; appears in B's feed within 5s.
- B posts an offer for matching material with a photo; verify Blossom upload + `imeta` tag.

### V3 — Claim + DM + Fulfillment + Review
- B claims A's need. A sees claim in inbox. Open DM thread; A and B exchange one message each; verify only their pubkeys decrypt. A marks listing fulfilled; both post +1 reviews. Reputation badge increments next to each pubkey across feed/listings.

### V4 — Pile lifecycle
- A creates a pile dated today via the wizard. Verify 6 kind-31923 turn events at +3/+6/+9/+19/+29/+39 days appear in calendar. B RSVPs to the day-3 turn event. A logs layer 1 → state transitions BUILDING; logs temperature 60°C.

### V5 — Map + radius
- Post listings at three geohashes (within 5mi, 20mi, 100mi of High View). Verify map clusters correctly; geohash radius filter at 15mi shows only the first.

### V6 — Chapter switch
- A switches chapter to a fresh test relay (deliberately empty). Feed clears. Reset to default. Powder Keg feed restored.

### V6.5 — Pyramid invite flow
- Fresh key C boots app → membership status `not-listed` → publish actions locked → C requests invite via `RequestInvite.tsx` selecting member A → A receives NIP-17 DM with deep link → A approves → A's app POSTs `/allow?type=invite&target=<C-hex>` with NIP-98 auth → relay returns 200 → C's `useMembershipStatus` flips to `allowed` (within one polling cycle or kind-22242 push) → C posts a listing successfully.
- A drops C → `listMembers()` no longer includes C → C's publishes start failing with `restricted` → C's UI auto-flips back to `not-listed`.

### V7 — Cross-platform build
- `pnpm tauri build` produces .app/.AppImage/.msi/.dmg. `pnpm tauri ios build` and `pnpm tauri android build` succeed. Web SPA static build deploys.

### V8 — Acceptance
- Gini LaMaster (or a Powder Keg representative) creates a real pile, posts the turn schedule, and at least one community member RSVPs after finding the app via direct link.

---

## 7. Open items deferred past MVP
- Zaps (NIP-57) UI — lib helpers wired but no UI on first ship.
- Multi-chapter UI — switch flow present, no UI for discovering multiple chapters.
- Server push notifications (Tauri 2 mobile push still maturing) — local notifications only via SPEC-029.
- Soil-test / finished-compost matching.
- Lightning payments / NIP-99 priced listings — MVP listings are free/barter (price field left empty).
- Recurring events (weekly mulch drive) — single-occurrence events only; users repeat manually.
- NIP-50 server-side search — client-side filtering only.
- i18n — English only.

## 9. Post-MVP TODO sweep — addressing the known limitations

Six in-code TODOs remain after Wave 6. Tackle them in two waves of follow-up work. Constants and patterns we already have are reused; nothing here needs new domain modeling.

### Context
The MVP works end-to-end for the default Powder Keg path: a local-nsec user can post listings, claim them, build piles, and switch chapters. But four of the deferred limitations directly affect the cross-device and cross-signer experience, so the chapter can't really run without them. The remaining two are correctness/follow-on niceties.

### Wave 8 — Cross-signer + cross-device coherence (ship together)

#### SPEC-030 — DM signer abstraction
**Goal**: Make NIP-17 DMs work for NIP-07 (browser extension) and NIP-46 (bunker) users, not just `nsec-local`.

**Critical files**:
- `src/lib/dm.ts` (current, 229 LOC) — rewrite `requireSecretKey()` and the wrap/unwrap path. The TODO is at `dm.ts:61`.
- `src/lib/dm.test.ts` — extend to cover the three signer paths.

**Approach**: Replace the direct `nostr-tools/nip59.wrapEvent`/`unwrapEvent` calls (which need a raw 32-byte sk) with a hand-rolled pipeline that uses `NDKSigner.encrypt(user, plaintext, 'nip44')` and `decrypt(...)`. The kind-13 seal is signed by the actual signer (NIP-07 popup or NIP-46 bunker); the kind-1059 wrap is signed by a *locally-generated ephemeral keypair* (still our code, no signer round-trip). This keeps the bunker UX to one prompt per outgoing DM.

Implementation outline:
1. New helper `signSeal(rumor, signer, recipientPubkey): Promise<NostrEvent>` — calls `signer.encrypt(NDKUser, JSON.stringify(rumor), 'nip44')` and signs a kind-13 event via `NDKEvent.sign(signer)`.
2. New helper `wrapForRecipient(seal, recipientPubkey): NostrEvent` — generates a fresh ephemeral keypair via `nostr-tools/pure.generateSecretKey`, NIP-44 encrypts the seal to recipient using `nostr-tools/nip44.v2.encrypt(JSON.stringify(seal), conversationKey(ephSk, recipientPub))`, signs as kind 1059 with the ephemeral key.
3. Mirror for `unwrap`: `signer.decrypt(NDKUser.fromPubkey(wrap.pubkey), wrap.content, 'nip44')` to peel the wrap, then again for the seal, yielding the kind-14 rumor.
4. Remove `requireSecretKey()` and the `unsupported-signer` error kind.

Reuse: `nostr-tools/nip44.v2` (already a transitive dep via `nostr-tools`), the existing `getNdk()` transport, the in-memory mock-relay test pattern in `dm.test.ts`.

**Acceptance**:
- Existing 5 tests still pass; add 2 new tests using a mocked `NDKNip07Signer`-shaped object that stubs `encrypt`/`decrypt`/`user`/`sign` to verify the bunker path produces and unwraps DMs correctly.
- The `unsupported-signer` error is removed; remove the surfacing toast in `src/components/listing/DmThreadSheet.tsx`.

#### SPEC-031 — Pile mutations re-publish kind-30078
**Goal**: Layer toggles, turn records, and photo additions in `PileDetail.tsx` round-trip back to the relay so the pile state is shareable across devices and visible to the chapter.

**Critical files**:
- `src/routes/PileDetail.tsx` (current 439 LOC) — tied to local React state today. The TODO is at line 11–13.
- `src/lib/pile/events.ts` — already exports `encodePile(pile, chapter?)`. Reuse as-is.
- `src/lib/pile/state.ts` — `nextState()` for transition validation; no change.
- `src/components/pile/wizardUtils.ts` — already has `signAndPublish(rawEvent, signer, ndk)` (used by NewPile). Promote to a small `src/lib/pile/publish.ts` helper so PileDetail can reuse without importing across the wizard tree.

**Approach**:
1. Move `signAndPublish` from `src/components/pile/wizardUtils.ts` into a new `src/lib/pile/publish.ts` with signature `republishPile(pile: Pile): Promise<void>` that: validates transitions via `nextState`, calls `encodePile(merged)`, signs via current signer, publishes via `getNdk()`. Keep the wizard's existing import working with a thin re-export.
2. In `PileDetail.tsx`:
   - On every layer-toggle / turn-record save / photo-add / state-advance, build a `Pile` snapshot via the existing local state, call `republishPile(pile)`. Show a small "Saving…" indicator (Spinner inline) and a toast on failure.
   - Replace local-only state with a `useState` that initializes from the subscribed pile but re-syncs on every incoming kind-30078 — so two devices each editing converge on whichever event was published more recently (`created_at`-wins). Document the simple last-writer-wins rule.
3. Wire `usePublishGuard()` so non-members get the same not-a-member sheet pile updates already get for new posts.

Reuse: `encodePile` (exists), `nextState` (exists), `usePublishGuard` (SPEC-025), the wizard's existing publish helper.

**Acceptance**: Extend `src/routes/PileDetail.test.tsx` with two cases: (a) tapping "Advance" calls `republishPile` once with `state: 'COLLECTING'`, and (b) toggling a layer calls `republishPile` with `layers[i].completed === true`.

#### SPEC-032 — Fulfillment marker event
**Goal**: When the listing author taps "Mark fulfilled," publish a structured marker so the claimer's device sees the review gate open without each side independently tapping the same button.

**Critical files**:
- `src/routes/ListingDetail.tsx` (current 388 LOC) — TODO at lines 12–17. Currently uses a local `useState(false)` for `fulfilled`.
- `src/lib/listings/claim.ts` — already exports `claim()` (kind-1 with `t:claim`). Add a sibling `fulfill()`.

**Approach**:
1. Add `fulfill(listingRef: AddressableRef, claimEventId?: string): Promise<NDKEvent>` to `src/lib/listings/claim.ts`. Posts a kind-1 with tags `['e', claimEventId, '', 'mention']` (if known), `['a', `30402:${ref.pubkey}:${ref.d}`]`, `['t', 'fulfilled']`, content `''`. Same auth-gate + publish pattern as `claim()`.
2. Add `subscribeFulfillmentFor(ref: AddressableRef): { subscribe(handler) => unsubscribe }` — filter `{ kinds: [1], '#a': [aTag], '#t': ['fulfilled'] }`. Only honor events where `event.pubkey === ref.pubkey` (the listing author) — this prevents claimers spoofing fulfillment on someone else's listing.
3. In `ListingDetail.tsx`:
   - Replace `useState(false)` for fulfilled with a value derived from a live `subscribeFulfillmentFor` subscription; falls back to the local optimistic flag while the publish is in flight.
   - "Mark fulfilled" button calls `fulfill(listingRef, latestClaimByMe?.id)` then optimistically flips local state.

Reuse: NDK subscribe pattern from existing `subscribeClaimsFor`, the in-memory mock-relay test pattern, `usePublishGuard()`.

**Acceptance**: Extend `src/routes/ListingDetail.test.tsx` with one case: as the author, click "Mark fulfilled" → mock NDK records a kind-1 publish with `t:fulfilled` and the right `a`-tag; the review form appears. Then in a separate render mounted as the *claimer* (different signer), inject the same fulfillment event into the mock relay → the review form appears for them too without any local action.

#### SPEC-033 — Pyramid hook tests
**Goal**: Cover `useMembershipStatus` and `usePublishGuard` directly so behavior changes don't slip through.

**Critical files**:
- `src/lib/pyramid.test.ts` — append. The hooks are at `src/lib/pyramid.ts:236+` (`useMembershipStatus`) and `:425+` (`usePublishGuard`). `parseMemberPage`, `inviteByNpub`, `dropMember` are already covered (8 tests).

**Approach**: `@testing-library/react` (already installed) handles hook testing via `renderHook` since v13+. We have v16 — confirmed in `package.json:42`. Patterns we already use (`vi.hoisted` localStorage shim, mock NDK, mock fetch) extend cleanly:
1. `useMembershipStatus(pubkey)`: render in a fresh test, assert it starts at `'unknown'`. Mock `listMembers` to include the pubkey → status flips to `'allowed'`. Mock chapter store to flip relay → status resets to `'unknown'` and re-fetches. Inject a synthetic kind-22242 event into the mock NDK → status refreshes. (3 tests)
2. `usePublishGuard()`: render. Call `guard(() => Promise.resolve(42))` → returns 42, `blocked === false`. Call `guard(() => Promise.reject(new Error('restricted: invite-only')))` → returns `null`, `blocked === true`. (2 tests)

Reuse: `_resetPyramidForTests`, the existing test fixtures.

**Acceptance**: 5 new tests; full suite still 245+ passing; no production-code change.

### Wave 9 — Hardening (lower priority)

#### SPEC-034 — Tauri Stronghold path for nsec storage
**Goal**: Activate the `tauri-plugin-stronghold` path in `src/lib/auth/nsecLocal.ts` so native users get OS-keychain-backed key storage instead of IndexedDB+passphrase only. The stub TODO is at `nsecLocal.ts:162`.

**Critical files**: `src/lib/auth/nsecLocal.ts` (current 246 LOC), no test changes needed beyond an integration smoke (Stronghold's behavior is too platform-specific to unit-test in happy-dom).

**Approach**: Implement `loadFromStronghold` / `saveToStronghold` via `@tauri-apps/plugin-stronghold`:
```ts
const stronghold = await Stronghold.load(`${appDataDir}/compost.stronghold`, passphrase);
const client = await stronghold.loadClient('compost') ?? await stronghold.createClient('compost');
const store = client.getStore();
await store.insert('nsec', encryptedBytes);  // already encrypted; Stronghold provides at-rest defense in depth.
```
The Stronghold passphrase doubles as the user's app passphrase (same we already collect in onboarding). Detect Tauri via `isTauri()`; web path stays IndexedDB+WebCrypto. No API surface change.

**Acceptance**: Manual smoke on a native Tauri build — generate key, force-quit, relaunch, unlock. The existing 5 unit tests still pass on web.

#### SPEC-035 — Mobile camera plugin for NIP-46 QR
**Goal**: Replace the web `getUserMedia` + `BarcodeDetector` polyfill in `src/lib/auth/nip46.ts:136` with a native scanner on iOS/Android.

**Critical files**: `src/lib/auth/nip46.ts` (`connectViaQR()`).

**Approach**: Add `@tauri-apps/plugin-barcode-scanner` (Tauri 2's first-party scanner). Detect Tauri; on native call `scan()`; on web keep the existing polyfill. Preserve the typed `Nip46Error('qr-not-supported')` for Safari fallback.

**Acceptance**: Manual smoke on iOS + Android dev builds. Tests already cover the no-BarcodeDetector path; add one mocked-isTauri test that asserts the plugin path is taken.

### Verification

After each SPEC, the standard pipeline:
- `node_modules/.bin/tsc --noEmit` clean.
- `node_modules/.bin/vitest run` — full suite stays at 245+ passing.
- `node_modules/.bin/vite build` clean.

Manual integration tests (the parts the unit suite cannot cover — these are post-Wave-9 only since they require a running Tauri build):
1. SPEC-030: send a DM as a NIP-46 (Amber on Android) user → recipient sees plaintext on a different device using a NIP-07 (Alby) signer.
2. SPEC-031: build a pile on device A → toggle layer 1 → verify on device B (different signer) that the layer flag updates within ~5 seconds.
3. SPEC-032: post listing as A, claim as B; A taps Mark fulfilled; B sees review form open on B's device without B tapping anything.
4. SPEC-034 / 035: native installs and key/QR scanner flows.

### Sequencing rationale

Wave 8 ships the four chapter-blocking items together so Powder Keg can run the app with the full set of signer types and across devices. Wave 9 is hardening that pays off once the chapter actually has multi-platform users. Inside Wave 8, SPEC-030/031/032 are independent (separate files, separate event-kind concerns) and can run in three parallel agents; SPEC-033 has no production-code dependency and can run in parallel as a fourth agent.

## 8. Decision log (for swarm agents — do not relitigate)
- **Stack**: Tauri 2 + Vite + React + TS + NDK. Locked.
- **Default relay**: `wss://chat.virginiafreedom.tech` (Pyramid). Locked.
- **Default Blossom**: same FQDN, derived `https://chat.virginiafreedom.tech`. Locked.
- **Single relay at a time**: no outbox model, no failover. Locked.
- **Chapter ↔ relay**: same identity. Switching chapters = switching relays. Locked.
- **No curated relay/chapter list**: free-form URL only on switch. Locked.
- **Pile presets**: Standard 2×2×2, Large 4×4×3, Commercial 6×6×6, Custom. Locked.
- **Geo precision**: per-listing slider, defaults: 5 (listings/piles), 7 (events). Locked.
- **Notifications**: local only (Tauri plugin). No server push for MVP. Locked.
- **Photos**: EXIF stripped + resized to ≤ 2 MB before upload. SHA-256 of transformed bytes. Locked.
- **Schema versioning**: `version: 1` on all structured-content events. Locked.
- **Auth**: NIP-07 → NIP-46 → generated nsec, in that preference order. Locked.
- **Listings price**: free/barter only for MVP; NIP-99 `price` field left empty. Locked.
- **Reputation**: NIP-32 kind 1985 with `compost-marketplace.review` namespace. Locked.
