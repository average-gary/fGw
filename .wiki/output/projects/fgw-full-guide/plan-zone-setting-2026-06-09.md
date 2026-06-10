---
title: "Plan: Settings menu to configure the user's USDA hardiness zone"
type: plan
format: roadmap
project: fgw-full-guide
sources:
  - ../../../wiki/concepts/fgw-calendar-zone-6b-translation.md
  - ../../../wiki/concepts/mulch-spring-warming-penalty.md
  - ../../../wiki/concepts/fgw-pile-build-process.md
  - ../../../wiki/concepts/fgw-pile-turn-schedule.md
  - ../../../raw/papers/2026-06-09-usda-2023-hardiness-zone-map-release.md
  - ../../../raw/papers/2026-06-09-vce-426-331-virginia-vegetable-planting-dates.md
  - ../../../raw/papers/2026-06-09-climate-central-2025-growing-season-trends.md
  - ../../../raw/papers/2026-06-09-noaa-ncei-wv-state-climate-summary.md
  - ../fgw-refinements/plan-fgw-refinements-2026-05-21.md
  - ../alpha-bundle/plan-alpha-bundle-2026-05-22.md
  - ../fgw-full-guide/plan-fgw-full-guide-2026-06-09.md
generated: 2026-06-09
articles_consulted: 10
decisions: 6
phases: 6
---

# Plan: Settings menu to configure the user's USDA hardiness zone

> Generated from the **compost-marketplace** wiki (10 articles consulted).
> Project: [`fgw-full-guide`](WHY.md). Closest sibling plan: [SPEC-054
> climate-adaptation banner](../fgw-refinements/plan-fgw-refinements-2026-05-21.md#spec-054).

## Executive Summary

Add a **Climate Zone** card to the existing Settings page (SPEC-024) that
lets a user pick their USDA Plant Hardiness Zone (5a–8b range, 12 entries)
and persists it on **two surfaces simultaneously**:

1. **Locally**, via a new `src/lib/userPrefs.ts` zustand+`persist` store so
   the value is available synchronously for first paint and works offline.
2. **Remotely**, by extending `updateProfile()` in `src/lib/profile.ts` to
   merge a custom `zone` field into kind-0 — the existing "preserve unknown
   fields" merge logic already protects this against other clients.

A small **ZIP→zone lookup helper** (a public-domain US dataset bundled as
`public/data/zip-to-hardiness-zone.json`, ~30–60 KB compressed) lets a user
who doesn't know their zone enter a ZIP code; the result is a *suggestion*
the user confirms, not an automatic write.

The first-run default is **Zone 6b** (Powder Keg WV), matching today's
implicit assumption everywhere in the app. Four consumers wire to the new
preference: the SPEC-054 climate-adaptation banner, the Phase 5 Sequence
Posters Zone 6b addendum, `src/lib/notifications.ts` calendar-trigger dates,
and the New Pile wizard's timezone default. Wiki articles already supply
per-zone calendar data for 5b/6a/6b/7a; Phase 6 schedules the gap-fill for
the remaining zones via a follow-up `/wiki:research`.

## Architecture Decisions

### Decision 1: Persist zone on **both** kind-0 and a local store, not one or the other

**Context**: User asked for kind-0 ("the setting follows the user across
devices"). But the existing Settings route (`src/routes/settings/Settings.tsx`)
and downstream consumers (notifications, banner) need a synchronous read on
mount — kind-0 fetches happen over a relay subscription with a 1.5–3 s
timeout (per `getProfile` in `src/lib/profile.ts:119`). A relay-only read
means the climate banner wouldn't render correctly on first paint, and the
notification scheduler couldn't compute trigger dates without awaiting the
relay round-trip.

**Options considered**:
- A. Kind-0 only. Universal across devices; no localStorage. Loses
  first-paint synchrony; loses offline.
- B. Local-only (zustand+`persist`). Matches `src/lib/chapter.ts` exactly.
  Loses cross-device.
- C. **Local-first, kind-0-mirrored.** Local read for first paint; kind-0
  publish on every change; on sign-in, hydrate local from kind-0 if the
  remote is newer. Keeps synchrony, gets cross-device, costs one extra
  publish per change.

**Decision**: **Option C.** The user's intent ("follows me across devices")
is satisfied by the mirror; the synchrony / offline / first-paint
requirements are satisfied by the local store. The merge logic in
`src/lib/profile.ts:150` ("preserve unknown fields") already does exactly
the right thing for round-tripping arbitrary kind-0 keys.

**Consequences**: One new module (`src/lib/userPrefs.ts`); two new types in
`src/lib/profile.ts` (`ProfileExt` extending `Profile` with `zone?:
HardinessZone`); a small hydration step in `useAuth`'s post-sign-in path so
local prefs catch up to remote on first sign-in.

### Decision 2: Custom kind-0 field key `zone` (not `usda_zone`, not a tag)

**Context**: NIP-24 enumerates standard kind-0 fields (`display_name`,
`name`, `website`, `banner`, `bot`, `birthday`). **It does not define any
location/zone/region field.** Custom keys are explicitly tolerated — the
`profile.ts:48` parser already preserves unknown fields verbatim through
`raw`.

**Options considered**:
- A. Field name `zone` — short, obvious, unlikely to collide with future
  NIP-24 additions.
- B. Field name `usda_zone` — explicit about the taxonomy, future-proof if
  a NIP-24 extension defines a generic `zone` key.
- C. Tag-based (`["t","zone:6b"]`). Wrong shape for kind-0 — kind-0 carries
  only `content` (JSON), not tags semantically.
- D. Separate addressable kind for "user climate preferences." Heavyweight;
  premature given today's single-field need.

**Decision**: **Option B (`usda_zone`).** The taxonomy *is* USDA-specific
(2023 Plant Hardiness Zone Map, per
[`raw/papers/2026-06-09-usda-2023-hardiness-zone-map-release.md`](../../raw/papers/2026-06-09-usda-2023-hardiness-zone-map-release.md)).
Naming it `usda_zone` is honest about scope and leaves room for an
international (Köppen, AHS heat zones) field later without a rename. The
`zone` key is too generic for a Nostr-wide convention.

**Consequences**: Field is `usda_zone`; type is `string` matching the
regex `^[2-9][ab]$|^1[0-1][ab]$` (zones 2a–11b). Validation lives in
`src/domain/userPrefs.ts` (new file).

### Decision 3: Zone list is a **bounded** dropdown of 12 entries (5a–8b), not all 22 USDA zones

**Context**: The 2023 USDA map covers zones 2a (sub-arctic) through 13b
(tropical). The wiki's calendar evidence
([VCE 426-331](../../raw/papers/2026-06-09-vce-426-331-virginia-vegetable-planting-dates.md))
is reliable for **6a / 6b / 7a / 7b / 8a / 8b** (the VA range);
[per-zone calendar deltas](../../wiki/concepts/fgw-calendar-zone-6b-translation.md)
are documented for 5b / 6a / 6b / 7a. Outside that range we have no
chapter-validated calendar data.

**Options considered**:
- A. Ship all 22 zones (2a–13b). Honest about USDA's range; degrades to
  "no calendar data available — generic posters only" for zones outside
  the wiki's coverage.
- B. **Ship 12 zones (5a–8b).** Covers WV / Mid-Atlantic / Mid-South /
  Pacific Northwest / Northern California — the chapters likely to adopt
  this app in the near term. Out-of-range users see a "Your zone isn't
  supported yet" message with a link to suggest one.
- C. Ship only the 4 zones the wiki currently has calendars for (5b / 6a
  / 6b / 7a). Too restrictive for any chapter not in WV.

**Decision**: **Option B.** Twelve zones balances honest coverage with
"no half-finished implementation" (per global guidance: don't ship features
that lack the data behind them). 5a / 8a / 8b ship with a "Climate
calendar partial — based on adjacent-zone extrapolation" badge; 6a–7b ship
clean.

**Consequences**: A 12-entry `<select>` in Settings; a constant
`SUPPORTED_ZONES` in `src/domain/userPrefs.ts`; a per-zone calendar map in
`src/domain/calendar.ts` (new) keyed by zone with explicit "partial"
markers where the wiki's evidence base is thin.

### Decision 4: ZIP→zone lookup is a **bundled JSON helper**, not a remote API call

**Context**: USDA hardiness GIS data is US federal work → **public
domain**. Community-maintained ZIP→zone CSVs cover all ~42k US ZIPs in
~30–60 KB compressed (1 ZIP + 1 zone string per row). The app already
ships under SPEC-024 with a strict offline-first guarantee; SPEC-024
forbids new network surfaces in Learn route. The Settings route should
follow.

**Options considered**:
- A. **Bundled JSON.** `public/data/zip-to-hardiness-zone.json` (~30–60
  KB gzip). One synchronous `fetch('/data/...')` on first ZIP-helper
  open; cached forever after. Works offline once cached.
- B. Remote API call to a ZIP→zone service (none official; third-party
  only). Network dependency; privacy leak (the ZIP); SLA risk.
- C. No helper at all — user picks from dropdown. Smallest bundle but
  poor UX for users who don't know their zone (most non-Powder-Keg
  members at first contact).

**Decision**: **Option A.** 30–60 KB is a rounding error against the
existing SPA bundle; the data is public domain (no license burden);
offline guarantee preserved; privacy preserved (ZIP never leaves device).

**Consequences**: A new asset under `public/data/`; a one-shot fetch
helper in `src/lib/userPrefs.ts`; documentation in `INSTALL.md` that
explains the ~50 KB asset under "What ships with the app." A follow-up
data-ingest entry into `.wiki/raw/data/` records the source dataset,
licensing, and refresh cadence.

### Decision 5: First-run default = Zone 6b (Powder Keg), shown unobtrusively, not as a forced prompt

**Context**: SPEC-024 today hardcodes "Powder Keg WV" as the chapter
default; the existing Settings card displays it without forcing a choice.
The
[`fgw-calendar-zone-6b-translation.md`](../../wiki/concepts/fgw-calendar-zone-6b-translation.md)
article is the calendar default the rest of the app already implicitly
assumes.

**Options considered**:
- A. **Default to Zone 6b silently** — user sees Settings, can change it
  anytime; downstream consumers behave as today on first run.
- B. Force a first-run picker before any FGW operation can run. Higher
  precision, more friction.
- C. Delegate to chapter relay (each relay owns a default zone). Adds a
  governance layer (who edits the relay's zone?) and complicates testing.

**Decision**: **Option A.** Matches the chapter app's "convention over
configuration" posture. The Climate Zone card surfaces the current value
prominently with a Change button; the existing Powder Keg default keeps
zero-friction onboarding.

**Consequences**: `userPrefs.zone` initializes to `'6b'` if no profile
field is present and no localStorage is present. After sign-in, if kind-0
contains `usda_zone`, the local store hydrates from it.

### Decision 6: Wire all four consumers in this plan, but ship them as 4 small per-consumer commits, not one mega-PR

**Context**: User selected all four consumers (climate banner, Sequence
Posters addendum, notification scheduler, pile-wizard timezone default).
The existing
[`alpha-bundle` plan](../alpha-bundle/plan-alpha-bundle-2026-05-22.md)
ships per-feature; SPEC-054 is a self-contained banner change; the
notification scheduler is the most code (touches `src/lib/notifications.ts`
and its tests).

**Options considered**:
- A. One PR that wires Settings + all four consumers. Atomic but huge.
- B. **One PR for Settings + storage + ZIP helper (Phases 1–3); one PR
  per consumer (Phases 4a–4d).** Smaller, reviewable; ships value
  incrementally; lets the chapter try the Settings card without all
  consumers wired.

**Decision**: **Option B.** Matches the repo's recent shipping pattern.

**Consequences**: Five PRs total, each with its own SPEC entry. Phase 5 in
this plan covers the SPEC update + alpha re-cut.

---

## Implementation Phases

### Phase 1: Domain types + localStorage store (1.5–2 hours)

**Goal**: Pure-data foundation. No UI yet.

**Tasks**:
- [ ] Create `src/domain/userPrefs.ts`:
  - Type `HardinessZone = '5a' | '5b' | '6a' | '6b' | '7a' | '7b' | '8a' | '8b'` (Decision 3 — bounded set; expand later).
  - `SUPPORTED_ZONES: readonly HardinessZone[]` constant.
  - `isHardinessZone(s: string): s is HardinessZone` validator.
  - `ZONE_LABELS: Record<HardinessZone, string>` (e.g. `'6b'` → `'6b — most of WV, Charleston, Lewisburg, Morgantown'`).
  - `ZONE_CALENDAR_QUALITY: Record<HardinessZone, 'full' | 'partial'>` — `'full'` for 5b/6a/6b/7a (wiki has dedicated calendar evidence); `'partial'` for 5a/7b/8a/8b.
- [ ] Create `src/lib/userPrefs.ts`:
  - zustand store with `persist` middleware, key `compost.userPrefs`.
  - Shape: `{ zone: HardinessZone; _set(z: HardinessZone): void }`.
  - Default `zone: '6b'`.
  - Hooks: `useUserZone(): HardinessZone`, `setUserZone(z: HardinessZone): void`.
- [ ] Vitest: `src/lib/userPrefs.test.ts` covering set/get round-trip, persist hydration, default value.

**Dependencies**: None.

**Validation**: `pnpm test src/lib/userPrefs.test.ts` green; `pnpm typecheck` green.

**Wiki grounding**: Zone list per
[`fgw-calendar-zone-6b-translation.md § WV zone reference (2026)`](../../wiki/concepts/fgw-calendar-zone-6b-translation.md). Calendar-quality flags align with the article's
"Confidence" section (high for 5b/6a/6b/7a, medium for the rest).

---

### Phase 2: Kind-0 mirror via `updateProfile` extension (1.5–2 hours)

**Goal**: Persist zone on the relay; round-trip preserves the value.

**Tasks**:
- [ ] Extend `Profile` interface in `src/lib/profile.ts`:
  ```ts
  export interface Profile {
    // existing
    displayName?: string; picture?: string; about?: string;
    nip05?: string; lud16?: string;
    // NEW
    usda_zone?: HardinessZone;
  }
  ```
- [ ] Update `ingest()` (line 41) to read `usda_zone` from parsed JSON when valid.
- [ ] Update `updateProfile()` (line 150) to merge `usda_zone` into outbound JSON when patch sets it.
- [ ] Add a `syncUserZoneToProfile()` helper in `src/lib/userPrefs.ts` that calls `updateProfile({ usda_zone: zone })` and is invoked from `setUserZone()`. Failure is non-fatal; toast notifies the user, local store still updates.
- [ ] Hydration: in `src/lib/auth/index.ts` (post-sign-in resolver), after the user's pubkey resolves, await `getProfile(pubkey, { timeoutMs: 1500 })`; if `profile.usda_zone` is set and differs from local, call `setUserZone(profile.usda_zone)`. Guard with a "first hydration only" flag so we don't fight the user.
- [ ] Vitest: extend `src/lib/profile.test.ts` for the new field; add round-trip test in `userPrefs.test.ts` against an in-memory NDK mock.

**Dependencies**: Phase 1.

**Validation**: `pnpm test`; manual check via local relay (`pnpm dev` → publish a profile change → re-fetch → field persists).

**Wiki grounding**: NIP-24 silence on location fields confirmed during gap
research (this plan's Stage 3). The `profile.ts:150` "preserve unknown
fields" merge logic was added in SPEC-028 and is the right insertion point
([`src/lib/profile.ts`](../../../src/lib/profile.ts)).

---

### Phase 3: Settings UI + ZIP helper (2.5–3 hours)

**Goal**: The "Climate Zone" card lands on the existing Settings page.

**Tasks**:
- [ ] **Climate Zone Card** in `src/routes/settings/Settings.tsx`:
  - New `<Card>` between "Chapter" and "Sign-in" (so it sits at top alongside chapter context).
  - Title: "Climate zone".
  - Subtitle: `ZONE_LABELS[zone]`.
  - Body: a `<select>` listing the 12 supported zones; on change, calls `setUserZone(z)`; shows a "Partial calendar" badge when `ZONE_CALENDAR_QUALITY[z] === 'partial'`.
  - Helper button: "Don't know your zone? Use ZIP" → opens a `<Sheet>` with a numeric ZIP input. On submit, calls `lookupZoneByZip(zip)`; result populates the dropdown but **does not auto-save** — user clicks Confirm.
  - If kind-0 mirror fails, toast "Saved on this device. Couldn't reach relay; retry later."
- [ ] **ZIP lookup**:
  - Add `public/data/zip-to-hardiness-zone.json` (the public-domain US dataset, gzipped on serve).
  - Helper `lookupZoneByZip(zip: string): Promise<HardinessZone | null>` in `src/lib/userPrefs.ts`. First call lazy-fetches and caches the JSON in module scope.
  - Validate the input is 5 digits before fetching.
- [ ] Tests in `src/routes/settings/Settings.test.tsx`:
  - Card renders with the default zone.
  - Changing the dropdown calls `setUserZone` and `updateProfile` mock.
  - Partial-calendar badge appears for 5a / 7b / 8a / 8b.
  - ZIP helper round-trips through a stub lookup.
- [ ] Manual visual review on `pnpm dev`: card renders, dropdown is keyboard-accessible, sheet opens/closes.

**Dependencies**: Phases 1, 2.

**Validation**: `pnpm test`; SPEC-024 snapshot updated; visual review on
mobile width.

**Wiki grounding**:
- Card pattern matches the existing five-card layout in
  [`Settings.tsx`](../../../src/routes/settings/Settings.tsx).
- ZIP→zone bundle approach per Decision 4.

---

### Phase 4a: Wire SPEC-054 climate banner (45–60 min)

**Goal**: The Learn-page banner copy is conditional on the user's zone.

**Tasks**:
- [ ] Update SPEC-054's banner schema in
  [`fgw-refinements` plan](../fgw-refinements/plan-fgw-refinements-2026-05-21.md#spec-054)
  to support per-zone variants:
  ```yaml
  banner:
    by_zone:
      '5a-6b': { tone: caution, heading: ..., body: ... }
      '7a-7b': { tone: info,    heading: ..., body: ... }
      default: null   # hide banner; warm zones don't have the spring-warming penalty
  ```
- [ ] `src/routes/Learn.tsx` reads `useUserZone()` and selects the matching banner variant. If no variant matches, hide.
- [ ] Update banner copy: 5a–6b retain the existing "100% mulch coverage at planting can delay soil warming 1–2 weeks" wording; 7a–7b get a softer "in cool springs the same penalty applies for 1 week — see calendar"; warm zones (8a+) hide the banner entirely.
- [ ] Vitest: snapshot tests of the three Learn pages × four zones (5b, 6b, 7a, 8a).

**Dependencies**: Phase 1, Phase 3 (so the user can change zone), and the
existing SPEC-054 implementation. If SPEC-054 hasn't shipped yet, this
phase blocks on it.

**Validation**: snapshot tests; visual review of `/learn/gods-blanket`
across the four zones via React DevTools state hack.

**Wiki grounding**:
[`mulch-spring-warming-penalty.md`](../../wiki/concepts/mulch-spring-warming-penalty.md)
explicitly notes the penalty is climate-bounded; the cold-spring evidence
weakens above Zone 7. Banner-hide-above-7 is the honest move.

---

### Phase 4b: Wire Sequence Posters Zone-6b addendum (30–45 min)

**Goal**: Phase 5 of the parent
[`fgw-full-guide` plan](plan-fgw-full-guide-2026-06-09.md#phase-5-authoring--trainers-guide-vegetable-guide-sequence-posters-46-hours)
ships a Zone 6b addendum on the Sequence Posters chapter. With the zone
setting in place, that addendum becomes conditional.

**Tasks**:
- [ ] In `src/content/learn/sequence-posters/`, the Zone-6b addendum
  blockquote is gated on `useUserZone() === '6b'`.
- [ ] For zones 5a–6a (cooler than 6b): the addendum links to the
  [`fgw-calendar-zone-6b-translation.md`](../../wiki/concepts/fgw-calendar-zone-6b-translation.md)
  article with copy "Your zone (5a/5b/6a) is cooler than 6b — add 1–2
  weeks to every operation date in the calendar below."
- [ ] For zones 7a+ (warmer): copy is "Your zone (7a/7b/8a/...) is warmer
  than 6b — subtract 1 week per half-zone."
- [ ] Sequence Posters chapter shipping under
  [`fgw-full-guide`'s Phase 5](plan-fgw-full-guide-2026-06-09.md#phase-5-authoring--trainers-guide-vegetable-guide-sequence-posters-46-hours)
  uses these conditional copies instead of the hardcoded blockquote.
- [ ] Vitest: `Learn.test.tsx` snapshot per zone for the Sequence Posters
  page.

**Dependencies**: Phase 1, Phase 3, AND Phase 5 of the parent
`fgw-full-guide` plan (Sequence Posters authoring). Block on whichever
ships last.

**Validation**: snapshot tests; manual review.

**Wiki grounding**: Per-zone calendar deltas live in the
[Zone-6b translation article § Operation-by-operation translation](../../wiki/concepts/fgw-calendar-zone-6b-translation.md). The "+1–2 weeks for cooler / -1 week for warmer" rule of thumb is the article's own framing.

---

### Phase 4c: Wire notification scheduler (2–3 hours)

**Goal**: `src/lib/notifications.ts` calendar-trigger dates respect the
user's zone instead of hardcoding 6b.

**Tasks**:
- [ ] Create `src/domain/calendar.ts`:
  - Type `CalendarTrigger = { id: string; offsetDays: number; from: 'plant-date' | 'first-frost' | ...; copy: string; }`.
  - `CALENDAR_BY_ZONE: Record<HardinessZone, ZoneCalendar>` populated for 5b / 6a / 6b / 7a from
    [Zone-6b translation § Compost-pile timing for the notification scheduler](../../wiki/concepts/fgw-calendar-zone-6b-translation.md).
  - For 5a / 7b / 8a / 8b: extrapolated by ±7-day shifts from the nearest available zone, marked with `partial: true`.
- [ ] Refactor `src/lib/notifications.ts`:
  - Existing trigger functions take a `zone` parameter (default `'6b'` for backward compat with current callers).
  - Compute trigger dates against `CALENDAR_BY_ZONE[zone]` instead of hardcoded offsets.
  - When a caller has the user's zone (most do via `useUserZone()`), pass it.
- [ ] Update `src/routes/Calendar.tsx` and any other consumer of
  `scheduleNotificationsForRsvp` to pass `useUserZone()`.
- [ ] Vitest: `notifications.test.ts` covers each supported zone for at
  least one trigger (compost-build, plant-corn, sidedress, harvest).

**Dependencies**: Phases 1–3.

**Validation**: `pnpm test src/lib/notifications.test.ts`; manual smoke
test by switching zones and re-rendering the Calendar route.

**Wiki grounding**: The trigger-table rows in the
[Zone-6b translation article](../../wiki/concepts/fgw-calendar-zone-6b-translation.md)
are the canonical input. The article's "elevation ±1–2 weeks" caveat
becomes the basis for the partial-zone extrapolation.

---

### Phase 4d: Pile wizard timezone default + zone surfacing (45–60 min)

**Goal**: The New Pile wizard's timezone step shows the user's zone
context (so they understand WHY the default plant date is Apr 25 vs
May 5).

**Tasks**:
- [ ] In `src/components/pile/PileWizardSteps.tsx` "Timezone" step
  (currently uses `Intl.DateTimeFormat()`), add a small inline note:
  "Your climate zone: {ZONE_LABELS[zone]}. The pile's turn schedule and
  cure window are timed for this zone." Link to Settings to change.
- [ ] No change to the timezone default (still `deviceTimezone()` in
  `src/components/pile/wizardUtils.ts`); the zone is informational here.
- [ ] If `ZONE_CALENDAR_QUALITY[zone] === 'partial'`, render the same
  partial-calendar badge from Phase 3.
- [ ] Vitest: `NewPile.test.tsx` snapshot covering the new note.

**Dependencies**: Phase 1, Phase 3.

**Validation**: snapshot; visual review.

**Wiki grounding**:
[`fgw-pile-build-process.md`](../../wiki/concepts/fgw-pile-build-process.md)
explicitly mentions that the build window is zone-bounded ("Powder Keg WV
(Zone 6b)... typically falling in August–September"); the wizard should
not silently strip that context.

---

### Phase 5: SPEC update + alpha re-cut + chapter announcement (60–90 min)

**Goal**: Land the SPEC update, ship a re-cut alpha, announce.

**Tasks**:
- [ ] **SPEC update**: extend SPEC-024 to include the Climate Zone card;
  add SPEC-058 "User climate zone preference" covering the storage,
  dropdown, ZIP helper, and the four consumers. Cite this plan.
- [ ] **Wiki update**: fix the stale TODO link in
  [`fgw-pile-build-process.md` line 21](../../wiki/concepts/fgw-pile-build-process.md)
  from `fgw-calendar-zone-6b.md` (does not exist) to
  `fgw-calendar-zone-6b-translation.md`.
- [ ] **Wiki ingest**: add the public-domain ZIP→zone dataset under
  `.wiki/raw/data/2026-06-09-zip-to-hardiness-zone.md` with source URL,
  license note (US public domain), file size, and refresh cadence
  (annually after USDA updates).
- [ ] Bump version → `v0.1.0-alpha.3` (or `v0.2.0` if the chapter wants a
  content milestone signal).
- [ ] Re-cut the
  [alpha-bundle](../alpha-bundle/plan-alpha-bundle-2026-05-22.md) deploy.
- [ ] DM Powder Keg testers via the existing crash-report / member-DM path.

**Dependencies**: Phases 1–4d (whichever consumers shipped).

**Validation**: `fgw.virginiafreedom.tech/settings` shows the Climate Zone
card; changing the value updates the climate banner / Sequence Posters /
notifications visibly.

**Wiki grounding**:
[`alpha-bundle`'s Phase 6 distribution runbook](../alpha-bundle/plan-alpha-bundle-2026-05-22.md) covers
the redeploy mechanics.

---

### Phase 6: Calendar gap-fill (deferred; not in v1) (4–6 hours)

**Goal**: Fill the partial-calendar zones (5a / 7b / 8a / 8b) with proper
research, replacing the ±7-day extrapolation in `CALENDAR_BY_ZONE`.

**Tasks**:
- [ ] Run `/wiki:research --plan "USDA Zone 5a / 7b / 8a / 8b growing
  calendar for maize and dry beans" --project fgw-full-guide` (single
  command, four parallel paths via `--plan`).
- [ ] Replace the partial entries in `src/domain/calendar.ts` with
  evidence-based offsets.
- [ ] Drop the `partial: true` flag from the affected zones; remove the
  "Partial calendar" badge in Settings + Pile wizard for those zones.

**Dependencies**: Phases 1–5 shipped.

**Validation**: research log entries in `.wiki/log.md`; updated calendar
constants; updated `ZONE_CALENDAR_QUALITY`.

**Wiki grounding**: The current
[Zone-6b translation article's "Inventory candidates" section](../../wiki/concepts/fgw-calendar-zone-6b-translation.md)
already records this as a follow-up.

---

## Risks & Mitigations

| Risk | Source | Mitigation |
|------|--------|------------|
| User on a partial-calendar zone trusts trigger dates that are extrapolated, not measured | Decision 3; Zone-6b article's confidence section | Render a "Partial calendar — based on adjacent-zone extrapolation" badge wherever a partial zone is in effect (Settings, Pile wizard, Calendar route). Phase 6 closes this for the four affected zones. |
| Kind-0 mirror conflicts with another client editing the user's profile | NIP-01 last-writer-wins; `profile.ts:150` merge logic | The `updateProfile` merge in `src/lib/profile.ts:150` already preserves unknown fields, so a non-fGw client won't lose `usda_zone` when it edits other keys. fGw last-writer-wins on `usda_zone` is acceptable. |
| ZIP→zone dataset goes stale after a USDA refresh | USDA 2023 update was the first since 2012 | Phase 5 records the dataset's retrieval date. A refresh script in `scripts/` can re-extract from the public USDA download. Refresh annually. |
| ZIP helper bundle bloats above 5 MB total figure budget when combined with the parent fgw-full-guide plan | [parent fgw-full-guide plan § Risks](plan-fgw-full-guide-2026-06-09.md) | Verify gzip is enabled in nginx for `/data/*.json`; the dataset compresses ~5–8x. Hard-cap raw at 100 KB; if exceeded, drop to state→zone (loses precision but stays under 10 KB). |
| Hydration-from-kind-0 fights the user (they change zone locally → relay returns old value → local gets reset) | Phase 2 hydration logic | Hydration runs once per sign-in (guarded by a session flag); subsequent changes are local-first → relay-mirrored, no read-back. |
| Time-of-first-render banner flicker if local store hasn't hydrated yet | zustand `persist` is synchronous on init in browser, async on Tauri/Android per platform | Use `useUserZone()` synchronously; zustand's `persist` middleware reads localStorage in the same tick on initialization. Tauri/Android use the same web shell so this holds. |
| ZIP helper privacy concern (user enters a ZIP that pinpoints them) | All processing is client-side per Decision 4 | Document in Settings sheet copy: "ZIP is checked locally; never sent to a server." Reinforce in Privacy section of the upcoming Sources & Licensing page (parent plan Phase 6). |

## Open Questions

- **Should the zone setting also affect the Calendar route's filter?**
  Today `src/routes/Calendar.tsx` lists labor events filtered by chapter
  community; zone could narrow it further but no chapter currently spans
  multiple zones — defer.
- **AHS heat zones, Köppen, or other taxonomies?** Out of scope; the
  `usda_zone` field name (Decision 2) leaves room without a rename.
- **Exposure of zone in the user's public profile.** A `usda_zone` on
  kind-0 is publicly visible. For most chapter members this is fine
  (Powder Keg is geographically known); for others it's a privacy hint.
  Settings copy should note "Your zone is published with your profile and
  visible to other Nostr clients." Defer the question of whether to add
  a "private mode" that holds zone in localStorage only.
- **International chapters.** The plan assumes USA. Non-USA users should
  be told "USDA zones are USA-only; pick the closest analog or wait for
  international support." Defer.

## Sources Consulted

- [Wiki: FGW calendar — Zone 6b WV translation](../../wiki/concepts/fgw-calendar-zone-6b-translation.md) — calendar map for 5b/6a/6b/7a; source for `CALENDAR_BY_ZONE`.
- [Wiki: Mulch spring-warming penalty](../../wiki/concepts/mulch-spring-warming-penalty.md) — climate-bounded scope of the SPEC-054 banner.
- [Wiki: FGW pile build process](../../wiki/concepts/fgw-pile-build-process.md) — pile timing depends on zone; informs Pile wizard surfacing.
- [Wiki: FGW pile turn schedule](../../wiki/concepts/fgw-pile-turn-schedule.md) — independent of zone; baseline for the wizard's timezone step.
- [Source: USDA 2023 Plant Hardiness Zone Map](../../raw/papers/2026-06-09-usda-2023-hardiness-zone-map-release.md) — taxonomy authority; informs the dropdown.
- [Source: VCE 426-331 zone tables](../../raw/papers/2026-06-09-vce-426-331-virginia-vegetable-planting-dates.md) — calendar evidence for the dropdown's documented range.
- [Source: Climate Central 2025 trends](../../raw/papers/2026-06-09-climate-central-2025-growing-season-trends.md) — informs the partial-calendar caveat copy.
- [Source: NOAA WV state climate summary](../../raw/papers/2026-06-09-noaa-ncei-wv-state-climate-summary.md) — climate baseline.
- [Output: fgw-refinements plan (SPEC-054 climate banner)](../fgw-refinements/plan-fgw-refinements-2026-05-21.md) — banner spec this plan extends.
- [Output: fgw-full-guide plan (Sequence Posters)](plan-fgw-full-guide-2026-06-09.md) — parent project; Phase 5 consumer.
- [Output: alpha-bundle plan](../alpha-bundle/plan-alpha-bundle-2026-05-22.md) — distribution runbook reused in Phase 5.
- Code: [`src/routes/settings/Settings.tsx`](../../../src/routes/settings/Settings.tsx), [`src/lib/profile.ts`](../../../src/lib/profile.ts), [`src/lib/chapter.ts`](../../../src/lib/chapter.ts), [`src/lib/auth/index.ts`](../../../src/lib/auth/index.ts), [`src/lib/notifications.ts`](../../../src/lib/notifications.ts), [`src/components/pile/PileWizardSteps.tsx`](../../../src/components/pile/PileWizardSteps.tsx), [`src/routes/Learn.tsx`](../../../src/routes/Learn.tsx) — the surfaces this plan extends.

## Inventory candidates

Durable follow-ups worth tracking:

- **Item**: Public-domain ZIP→zone JSON dataset → ingest into
  `.wiki/raw/data/` with source URL, retrieval date, license note. (Phase
  5 task.)
- **Open question**: Should `usda_zone` become a Nostr standard? File a
  NIP discussion thread linking the wiki's research artifact.
- **Watch item**: USDA next zone-map refresh (likely ≥ 2030). Refresh the
  bundled dataset and re-validate calendar evidence at that time.
- **Task** (Phase 6): `/wiki:research --plan "USDA Zone 5a / 7b / 8a / 8b
  growing calendar"` to upgrade the partial-calendar zones to full.
