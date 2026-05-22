---
title: "fGw git commit history (Waves 0–9)"
type: source-data
source: "git log of the fGw repo as of 2026-05-20"
ingested: 2026-05-20
provenance: |
  Generated via `git log --reverse --pretty=format:'## %h — %s%n%n%b%n---%n'`
  in /Users/garykrause/repos/fGw on 2026-05-20. Captures the full
  wave-by-wave implementation narrative including parallel agent reports
  embedded in commit messages.
---

# fGw Commit History

## 87e9cc8 — SPEC-001: scaffold Tauri 2 + Vite + React + TS

Wave 0 of the agent-swarm execution graph. Establishes:
- pnpm + TypeScript 5 + Vite 5 + React 18 + Tailwind 3 frontend.
- Tauri 2 Rust shell with notification, sql, and stronghold plugins
  configured for the SPEC-009/SPEC-029 features that follow.
- Earthy soil/moss palette in tailwind.config.ts as a starting point
  for SPEC-004 (UI primitives).
- Repo hygiene: SPEC.md persisted in tree, .gitignore covers
  node_modules, build artefacts, and rust-analyzer scratch.

Verified: pnpm build produces a working static bundle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## f7cdb20 — Wave 1: SPEC-002 + SPEC-003 + SPEC-004

Three agents in parallel produced the foundation layer.

SPEC-002 — Domain constants (src/domain/)
- fgw.ts: PILE_PRESETS (Standard/Large/Commercial), PILE_REFERENCE_DIMENSIONS,
  layer recipe, turn schedule, planting station, mulch — each with Field Guide
  page citation.
- pileMath.ts: layersForHeight, volumeM3, scaledIngredients (linear scale on
  volume), staffingEstimate.
- materials.ts: 24 material kinds + label + category helpers.
- quantity.ts: 12 units, canonicalToM3 returns null for mass-without-density.
- geoPrecision.ts: § 3.4 table + truncateGeohash.
- 34 vitest assertions, all passing.

SPEC-003 — Geohash utilities (src/lib/geohash.ts)
- encode/decode/distanceMiles/prefixesForRadiusMiles backed by ngeohash.
- Heuristic: pick precision whose cell width ≥ requested radius.
- 6 tests passing.
- SPEC.md acceptance criteria patched: High View encodes to dqb*, not dnv*;
  haversine to (39,-78) is ~36 mi, not 38-42.

SPEC-004 — UI primitives + theme (src/components/ui/, tailwind.config.ts)
- Palette: soil/moss/harvest/bloom/dusk (50–900 scales). No purple gradients.
- Typography: Fraunces (variable serif, optical sizing) + IBM Plex Sans/Mono.
- Primitives: Button, Input, Textarea, Select, Card, Badge, Sheet, Toast,
  Spinner. Each mobile-first, 44 px touch floors, focus-visible only.
- Showcase route at src/routes/_dev/Components.tsx wired to App.tsx
  (TODO marker for SPEC-018 swap).
- Paper-grain SVG body texture, embossed button shadows — distinctive,
  agrarian, not generic AI.

40/40 tests pass. tsc clean. vite build 173 kB JS / 25 kB CSS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## e92edb0 — Wave 2: SPEC-006 + SPEC-007 + SPEC-008 + SPEC-009

Four agents in parallel produced the auth + relay-preference layer.

SPEC-006 — Chapter store (src/lib/chapter.ts)
- zustand persist middleware (localStorage key compost.chapter).
- DEFAULT_RELAY = wss://chat.virginiafreedom.tech.
- setCurrentRelay validates ws/wss URL parsing; throws otherwise.
- 7 tests.

SPEC-007 — NIP-07 (src/lib/auth/nip07.ts)
- detectNip07 + loginWithNip07 wrapping NDKNip07Signer (NDK 2.18.1).
- Nip07Error class: 'no-extension' | 'permission-denied' | 'unknown'.
- Heuristic perm-denied detection by error message.
- 5 tests.

SPEC-008 — NIP-46 bunker (src/lib/auth/nip46.ts)
- connectBunker parses bunker:// URI, instantiates NDKNip46Signer with a
  separate NDK pointed only at the signer's relay; persists local nsec
  in localStorage so reconnects don't litter the bunker side.
- 60s handshake timeout; 7 tests.
- connectViaQR: BarcodeDetector + getUserMedia for web; throws
  qr-not-supported on Safari. SPEC-024 will add native camera plugin.

SPEC-009 — Local nsec encrypted storage (src/lib/auth/nsecLocal.ts)
- AES-256-GCM, PBKDF2-SHA-256 100k iters, per-user 16-byte salt.
- Persisted in Dexie (IndexedDB) under DB compost-auth, store keys.
- generate/unlock/revealNsecOnce: signer signs verifiable kind-1 event.
- NsecLocalError: 'no-key' | 'key-exists' | 'wrong-passphrase' | 'storage-error'.
- Tauri Stronghold path stubbed with TODO marker for SPEC-024 hardening.
- 5 tests.

All 64 tests pass. tsc clean.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## 47effef — Wave 3: SPEC-005 + SPEC-010

NDK singleton + auth orchestrator + onboarding flow.

SPEC-005 — NDK singleton (src/lib/ndk.ts, src/lib/useNdk.ts)
- Lazy singleton bound to exactly one relay (the chapter relay).
- enableOutboxModel: false, autoConnectUserRelays: false.
- Subscribes to chapter store; rebuilds on relay change, calling
  pool.relays.forEach(disconnect) on the prior NDK before swapping.
- relay:disconnect + error-flavored relay:notice events surface via a
  setRelayToast(fn) module-level callback so React can wire useToast()
  without coupling ndk.ts to React.
- 8 tests.

SPEC-010 — Auth orchestrator + onboarding (src/lib/auth/index.ts,
                                            src/routes/Onboarding.tsx,
                                            src/lib/location.ts,
                                            src/lib/onboarding.ts)
- useAuth() / useAuthStore zustand+persist: only `method` and `npub`
  persist; signer is re-derived on boot.
- bootstrapSession() runs once and:
    nip07 → probe window.nostr; auto-login or set 'no-extension'.
    nip46 → read stored bunker URI; 'reauth-required' if missing.
    nsec-local → stay idle until passphrase provided.
- Onboarding 3-step flow: method picker → passphrase (gen/unlock) →
  optional location → done. Final tap on "Open feed" stamps
  useOnboardingStore.completedAt.
- App.tsx now gates Onboarding vs ComponentsRoute on completedAt.
- ToastProvider wraps the tree.
- Location store stub uses geohash from SPEC-003 at precision 5.
- 12 tests across orchestrator + onboarding.

Test bug fixed mid-wave: getAllByLabelText(/passphrase/i) was matching
both Passphrase and Confirm passphrase fields in non-deterministic
order. Switched to exact-label getByLabelText. @testing-library/user-event
added (devDep) since happy-dom + fireEvent.change rejects setters on
password inputs.

84/84 tests pass across 9 files. tsc clean. vite build green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## 35f1adc — Wave 4: SPEC-027 + SPEC-011 + SPEC-012 + SPEC-013 + SPEC-014 + SPEC-016

Six specs landed (one solo Wave 4a, five parallel Wave 4) producing the
event encoder/decoder layer + media pipeline.

SPEC-027 — Image transform (src/lib/image.ts)
- transformImage: createImageBitmap → canvas resize ≤ 2048px longest edge
  → JPEG q0.85 with quality fallback ladder if > 2 MB → SHA-256 of final
  bytes. PNG-with-alpha stays PNG; opaque PNG → JPEG.
- extractExif: hand-rolled DataView walker for JPEG APP1 + PNG tEXt/iTXt/
  eXIf chunks, surfaces hasExif/hasGps + GPS coords. No deps.
- 10 tests; canvas pipeline mocked in happy-dom but EXIF round-trip uses
  real synthesized JPEG bytes with a hand-built GPS sub-IFD.

SPEC-011 — NIP-99 listings (src/lib/listings/)
- types/encode/parse for kind 30402. CHAPTER_A_TAG_DEFAULTS exported
  for cross-spec re-use. Geohash truncation honors per-listing precision.
- 14 tests, including round-trip with all fields, precision truncation,
  rejection of unknown materials and version 2.

SPEC-012 — NIP-52 calendar + RSVP (src/lib/events/)
- LaborEvent (kind 31923) + Rsvp (kind 31925) encoders/parsers. Default
  geoPrecision 7 (street-level) for events. RSVP d-tag derived from
  event ref so re-RSVP replaces.
- 10 tests.

SPEC-013 — Pile (src/lib/pile/)
- types/schedule/state/events/queries. State machine refuses skipping
  forward; abandon transition from any non-ABANDONED state.
- generateTurnEvents respects timezone via Intl.DateTimeFormat 9-AM-local
  snap (DST-safe). 6×6×6 → minVolunteers=54 from staffingEstimate.
- validatePile enforces dimensional floor + ingredient ±10% drift.
- 17 tests.

SPEC-014 — NIP-17 gift-wrapped DMs (src/lib/dm.ts)
- nostr-tools/nip59 wrapEvent/unwrapEvent. Publishes wrap to recipient
  AND self for cross-device threads. Only kind-1059 hits the relay.
- LIMITATION: requires NDKPrivateKeySigner (raw secret key access);
  NIP-07 / NIP-46 paths throw DmError('unsupported-signer') with a TODO
  marking the migration to signer.encrypt('nip44').
- 5 tests.

SPEC-016 — Blossom uploads (src/lib/blossom.ts)
- Hand-rolled NIP-98 (kind 27235) PUT /upload — blossom-client-sdk
  internally uses BUD-01 kind 24242, incompatible with our spec.
- transformImage runs first, so PhotoRef.sha256 always matches the
  uploaded bytes. Server hash mismatch is a typed error.
- imetaTag emits NIP-92 url/m/x/dim/size fields.
- verifyDownload re-hashes fetched blob; refuses on mismatch.
- 9 tests.

149/149 tests pass across 15 files. tsc clean. vite build green
(bundle 696 kB pre-splitting, an item for later optimization).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## 9fd315d — Wave 5: SPEC-015 + SPEC-017 + SPEC-025 + SPEC-028 + SPEC-029

Five specs landed in parallel producing the cross-cutting feature layer.
SPEC-025's first agent expired mid-wave after writing pyramid.ts; a
follow-up agent verified the production code typechecks against the
contract and added the missing test file (8 tests).

SPEC-015 — Claims (src/lib/listings/claim.ts)
- claim() accepts NDKEvent or AddressableRef; emits kind-1 reply with
  e + a tag and t:claim. ClaimError('no-signer') when unauthenticated.
- subscribeClaimsFor() and subscribeMyInbox() — observable surfaces over
  NDK relay subscriptions. 4 tests.

SPEC-017 — Reputation (src/lib/reputation.ts)
- postReview emits kind 1985 with L:compost-marketplace.review namespace,
  d-tag derived from (target, reference) so same reviewer's later
  review replaces earlier one client-side.
- Score formula: positive - negative - 2*noShows. Self-reviews filtered.
- aggregateReviews helper for hook-free testing. 7 tests.

SPEC-025 — Pyramid invite client (src/lib/pyramid.ts)
- listMembers/listBanned scrape /allowed and /banned HTML.
- parseMemberPage uses split-on-landmark contract (matches "Invited
  members"/"invitees" boundary; before = inviters, after = invitees).
- inviteByNpub/dropMember POST with NIP-98 (kind 27235) auth header.
- 422 body classifier maps over-quota/cycle/already-member.
- useMembershipStatus + usePublishGuard hooks present (untested
  directly — TODO for react-testing-library coverage).
- 8 tests.

SPEC-028 — Profile + inbox (src/lib/profile.ts, src/lib/inbox.ts)
- useProfile/getProfile/updateProfile for kind-0 with module-scope
  zustand cache keyed by pubkey.
- inbox: Dexie-backed lastSeenAt with InMemoryStore fallback for tests;
  useUnreadCounts wires SPEC-015's subscribeMyInbox + SPEC-014's
  subscribeDms; markRead resets per scope. 9 tests across both files.

SPEC-029 — Local notifications (src/lib/notifications.ts)
- requestPermission wraps tauri-plugin-notification + web Notification
  API; result cached. Permission denied → schedule calls become no-ops
  but populate pendingFallback zustand for in-app banner UI.
- scheduleNotificationsForPile uses generateTurnEvents from SPEC-013;
  RSVP scheduler 24h+1h before start; listing 24h before expiresAt.
- cancelNotificationsFor by stable refId; getPending() snapshot for
  tests. 10 tests.

187/187 tests across 21 files. tsc clean. vite build green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## 06c8838 — Wave 6 (batch 6A): SPEC-018 + SPEC-019 + SPEC-020 + SPEC-022 + SPEC-028 routes

Five route surfaces built in parallel by the swarm. Two agents had
session/API failures mid-run but the production files they wrote landed
intact — follow-up agents wrote the test files (Feed.test, Inbox.test,
pyramid.test in Wave 5).

SPEC-018 — Feed (src/routes/Feed.tsx, src/components/feed/{PubkeyChip,
                  ReputationBadge}.tsx)
- Single NDK subscription on chapter #a tag asking for kinds 30402+31923
  simultaneously; each event run through parseListing then
  parseLaborEvent.
- Filter pipeline: kind chips, material Select (disabled on kind=event),
  radius Select (disabled when no location). Material filter hides labor
  events since events have no material — documented behavior.
- Empty/loading states; cap render to 50 cards. 6 tests.

SPEC-019 — NewListing (src/routes/NewListing.tsx, src/components/listing/
                       {ListingFormFields, PhotoThumbs}.tsx)
- Form with kind toggle, material Select, title/description, optional
  Quantity (value+unit), location text + precision Select, expires-at
  date, Blossom photo upload, optional pile reference Select fed by a
  live NDK subscription on kind-30078 authored by the user.
- Membership gate: useMembershipStatus !== 'allowed' renders form
  read-only with a request-invite banner.
- usePublishGuard wraps publish so non-member rejections surface the
  "not a member" sentinel. scheduleNotificationsForListing fires when
  expiresAt set. 2 tests.

SPEC-020 — ListingDetail (src/routes/ListingDetail.tsx, src/components/
                          listing/{ClaimRow, DmThreadSheet, PubkeyChip,
                          ReviewForm}.tsx)
- NDK subscription resolves the addressable listing; live claim list via
  subscribeClaimsFor; inline DM thread sheet via sendDm/subscribeDms;
  post-fulfillment review form via postReview.
- Spec deviation: prop renamed from `ref` → `listingRef` because React
  18 strips bare `ref`. Documented inline. 4 tests.

SPEC-022 — Calendar (src/routes/Calendar.tsx, src/components/calendar/
                     EventCard.tsx)
- Subscribes to kind 31923 on chapter #a; filters to upcoming-30-days,
  sorts start asc.
- One combined RSVP-counts subscription per route mount: kind 31925 #a
  filter over all in-view event addressable refs; aggregator tracks
  latest RSVP per (event, author) for NIP-33 replace semantics.
- Optimistic RSVP UI; rollback on publish failure. 3 tests.

SPEC-028 routes — Profile + Inbox (src/routes/Profile.tsx,
                                   src/routes/Inbox.tsx)
- Profile: avatar/displayName/about/nip05/lud16; edit mode for own
  profile with Blossom picture upload.
- Inbox: composes subscribeMyInbox (claims) and subscribeDms (DMs) into
  one time-sorted list; markRead('claims') and markRead('dms') called
  on mount. 6 tests across both files.

208/208 tests across 27 files. tsc clean. vite build green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## 8f72a00 — Wave 6 (batch 6B): SPEC-021 + SPEC-023 + SPEC-024 + SPEC-026

Four parallel agents produced the heavier route surfaces. All converged
clean despite flagged "pre-existing" issues during iteration.

SPEC-021 — Pile wizard + detail + my-piles
- src/routes/NewPile.tsx (428 LOC): six-step wizard (preset → size →
  location → schedule → preview → publish). Custom dimensions validated
  against PILE_MIN_DIMENSIONS. Preview renders generateTurnEvents from
  SPEC-013. Publish sequence: kind-30078 first, then six kind-31923 turn
  events; partial-failure retry button replays against same pile slug.
  scheduleNotificationsForPile fires on success.
- src/routes/PileDetail.tsx (439 LOC): layer checklist sized to
  layersForHeight(height), turn timeline highlighting next-due turn,
  temp/moisture log, photo gallery, advance/abandon controls.
- src/routes/MyPiles.tsx (184 LOC): subscribed list with state badges +
  days-until-next-turn + archive Button.
- src/components/pile/{PileWizardSummary, PileWizardSteps,
  LayerChecklist, TurnTimeline, wizardUtils}.tsx — extracted helpers.
- 4 tests. 6×6×6 staffing verified at 54 volunteers per turn (matches
  pileMath.staffingEstimate(volume/4)); SPEC's "~14" approximation
  documented as wrong.

SPEC-023 — Map (src/routes/Map.tsx, 333 LOC)
- Single NDK subscription on chapter #a tag for kinds 30402+31923.
- OpenStreetMap tile layer (no API key, attribution).
- Custom Leaflet divIcons: soil-tone leaf-pile glyph for listings,
  moss-tone calendar dot for events. Inline SVG, no external assets.
- Markers cap at 200 with "showing 200 of N — zoom in" hint.
- Open callback yields the AddressableRef for parent routing.
- 7 tests with react-leaflet mocked at the module boundary.

SPEC-024 — Settings + chapter switch + Learn
- src/routes/settings/Settings.tsx (289 LOC): chapter, sign-in (with
  reveal-nsec-once for local-key users), Blossom URL, notifications
  permission state, sign-out.
- src/routes/settings/ChapterSwitch.tsx (162 LOC): warning-gated
  type-to-confirm flow + free-form wss:// URL entry.
- src/routes/Learn.tsx (253 LOC): five FGW education topics with an
  inline ~95-LOC markdown renderer supporting headings/paragraphs/
  bullets/code/bold/inline-code/hr. Compost Recipe page templates
  numbers from PILE_LAYER_RECIPE / PILE_TURN_SCHEDULE_DAYS / etc. via
  {{var}} substitution so the page stays in sync with src/domain/fgw.ts.
- src/content/learn/{six-keys, compost-recipe, on-time,
  planting-station, gods-blanket}.md — verbatim FGW citations.
- 17 tests across the three routes.

SPEC-026 — Admin (src/routes/admin/)
- Members.tsx (306 LOC): roster from listMembers, search, invite-by-npub
  Sheet, optimistic Drop button (relay enforces 403).
- InviteTree.tsx (242 LOC): lazy-loading expandable tree, lights up
  path-to-current-user incrementally.
- Banned.tsx (121 LOC): root-only restore Buttons.
- RequestInvite.tsx (248 LOC): non-member flow that DM-blasts chosen
  members with deep link compostmkt://invite-request?npub=<npub>.
- Root-status heuristic: first member with level === 0 in listMembers.
  Documented inline as a simplification.
- 4 tests.

Wave 6 grand totals: 240/240 tests across 36 files. tsc clean.
vite build 696 kB pre-splitting (chunk-size advisory; deferred).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## e105a9e — Wire react-router-dom across the app shell

Final glue for Wave 6: replace the placeholder App.tsx (which toggled
between Onboarding and a dev components page) with a 19-route HashRouter
plus a 5-tab AppShell.

src/App.tsx (325 LOC):
- HashRouter so the app works from file:// in Tauri and from any static
  web host without server-side routing config.
- 19 routes covering: Feed (/), NewListing, ListingDetail, Calendar,
  Map, MyPiles, NewPile, PileDetail, Profile, Inbox, Settings,
  ChapterSwitch, Learn, admin/{members, tree, banned, request-invite},
  and the dev /_dev/components fallback.
- React.lazy + Suspense splits the heavier routes (Map, NewPile,
  PileDetail, Learn, admin/*).
- ListingDetail and PileDetail parse their addressable refs from URL
  params (kind:pubkey:d), validate hex+slug, redirect to / on bad input.
- Per-route wrappers translate route props (onPublished/onBack/etc) into
  useNavigate() pushes.
- Onboarding gate: useOnboarding().completedAt === null short-circuits
  the router and renders <Onboarding/> with the ToastProvider wrapper.
- Exports both `App` (HashRouter, prod) and `AppForTest` (MemoryRouter,
  test).

src/components/AppShell.tsx (193 LOC):
- Sticky bottom nav with 5 inline-SVG icons (Feed, Calendar, Map, Inbox,
  Settings) using <NavLink> for active-state styling.
- Hides the bar on /listings/new and /piles/new (full-viewport routes
  that have their own back button).
- <Outlet/> renders the matched route inside max-w-screen-sm column.

Bundle now splits into 11 JS chunks:
- main 832 kB (gz 253 kB) — react-router + eager routes
- Map 159 kB (Leaflet) split out
- NewPile 12.5, Learn 14.7, _dev 12, PileDetail 8.4, Members 4.3,
  RequestInvite 3.6, InviteTree 3.1, Banned 2.1.

5 new tests in App.test.tsx exercise the onboarding gate, default-route
landing on Feed, bottom-nav presence on Settings, hidden bar on
NewListing, and malformed-param redirect.

245/245 tests across 37 files. tsc clean. vite build green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## 19fdefb — Wave 8: SPEC-030 + SPEC-031 + SPEC-032 + SPEC-033

Four parallel agents addressed the cross-signer + cross-device coherence
TODOs flagged after MVP. All converged clean despite intermediate
"pre-existing failure" reports from parallel WIP visibility.

SPEC-030 — Cross-signer DMs (src/lib/dm.ts: 229 → 393 LOC)
- Replaced direct nostr-tools/nip59 wrapEvent/unwrapEvent (which need
  a raw 32-byte sk) with a hand-rolled pipeline:
  * signSeal: signer.encrypt(NDKUser, JSON.stringify(rumor), 'nip44')
    + NDKEvent kind-13 sign(signer)
  * wrapForRecipient: locally-generated ephemeral keypair via
    nostr-tools/pure.generateSecretKey, NIP-44 v2 encrypt seal to
    recipient via nip44.v2.utils.getConversationKey, finalizeEvent as
    kind 1059. Zero signer round-trip on the wrap step (one prompt
    per outgoing seal under bunker, two per sendDm since we wrap to
    recipient AND self).
  * unwrap mirrors via two signer.decrypt calls; asserts
    rumor.pubkey === seal.pubkey to defend against forged inner
    identity.
- Removed requireSecretKey + DmError('unsupported-signer'). NIP-07
  and NIP-46 paths now work end-to-end.
- Test count 5 → 8; bunker-style sender + recipient + no-leak audit.

SPEC-031 — Pile mutations re-publish (new src/lib/pile/publish.ts,
                                     src/routes/PileDetail.tsx)
- New src/lib/pile/publish.ts (153 LOC) exports republishPile(pile)
  and PilePublishError {'no-signer'|'invalid-state'|'forbidden'|
  'network'}. Validates state transitions via nextState; rejects
  backward jumps. signAndPublish moved here; wizardUtils.ts re-exports
  it so NewPile.tsx import stays stable.
- PileDetail.tsx (439 → 543 LOC): every layer toggle / turn record /
  photo add / state advance now optimistically updates local state
  AND calls republishPile via usePublishGuard. Inline "Saving…"
  Spinner in the header; rollback on publish failure.
- Last-writer-wins on inbound kind-30078: usePileByRef tracks
  publishedAt per ref, mid-edit working copy is protected via
  lastSyncedAtRef so older races don't clobber unsaved edits.
- Test count 2 → 5: advance, layer toggle, cross-device update.

SPEC-032 — Fulfillment marker (src/lib/listings/claim.ts: +135 LOC,
                                src/routes/ListingDetail.tsx: +63 -6)
- New fulfill(listingRef, claimEventId?) posts a kind-1 with
  t:fulfilled + a:30402:<pubkey>:<d>.
- New subscribeFulfillmentFor(ref): drops events where
  raw.pubkey !== ref.pubkey (relay can't enforce this; client-side
  spoof guard).
- ListingDetail's fulfilled flag is now derived: localFulfilled OR
  any author-authored marker observed. Cross-device: claimer sees the
  review form open as soon as the author's marker propagates.
- Test count 4+4 → 7+10: spoofed marker is dropped, cross-device
  derivation verified.

SPEC-033 — Pyramid hook tests (src/lib/pyramid.test.ts: 8 → 13)
- renderHook + waitFor exercise useMembershipStatus across:
  initial 'unknown' → 'allowed', chapter swap busts the cache, kind-
  22242 NDK event triggers re-fetch.
- usePublishGuard happy path + 'restricted'-rejection path; blocked
  flag flips. No production code change.

265/265 tests across 37 files. tsc clean. vite build green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## a11cdc4 — Wave 9: SPEC-034 + SPEC-035 (hardening)

Two parallel agents wired native-only Tauri plugin paths for the
post-MVP hardening items.

SPEC-034 — Tauri Stronghold nsec storage (src/lib/auth/nsecLocal.ts:
                                          246 → 364 LOC)
- @tauri-apps/plugin-stronghold dynamically imported only on native
  (isTauri()), so the web bundle keeps Stronghold out of the main
  chunk via Vite code-splitting.
- Stronghold.load(path, passphrase) → loadClient/createClient
  → store.get/insert with Uint8Array<->number[] conversion. Path is
  appDataDir() + 'compost.stronghold' joined via api/path.join (cross-
  platform separator).
- The encrypted ciphertext stored inside Stronghold is still our own
  AES-GCM via PBKDF2 — Stronghold provides at-rest defense in depth,
  not the primary crypto. The Stronghold passphrase doubles as the
  user's app passphrase (already collected in onboarding).
- On Stronghold error: fall back to IndexedDB only when that API is
  available (it always is in Tauri webviews).
- 6 tests (5 web + 1 mocked-Tauri Stronghold round-trip).

SPEC-035 — Mobile QR scanner for NIP-46 (src/lib/auth/nip46.ts:
                                         169 → 198 LOC)
- @tauri-apps/plugin-barcode-scanner added (mobile-only Tauri 2
  plugin). scan({ formats: [Format.QRCode] }) → bunker:// URI →
  connectBunker.
- Cargo.toml gates the Rust crate behind cfg(target_os="android" |
  "ios") so desktop builds stay compiling.
- src-tauri/src/lib.rs conditionally registers the plugin at runtime
  on the same gate; capabilities/default.json adds
  "barcode-scanner:default".
- isTauriMobile() guard combines isTauri() with a mobile-UA check
  since @tauri-apps/api/core doesn't expose platform() (that lives in
  the optional plugin-os which we don't ship).
- Web Safari path keeps the existing 'qr-not-supported' Nip46Error.
- 8 tests (7 web + 1 mocked-mobile native-path).

iOS deploy still needs NSCameraUsageDescription in the generated
Info.plist (added by `pnpm tauri ios init`); Android camera permission
is auto-merged by the plugin manifest. Both documented in lib.rs.

267/267 tests across 37 files. tsc clean. vite build green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---

## cd90988 — SPEC-035 finish: NSCameraUsageDescription via Info.ios.plist merge

src-tauri/gen/ is gitignored and regenerated by `tauri ios init`, so
direct edits to the generated Info.plist would not survive. Tauri 2
merges src-tauri/Info.ios.plist into the generated plist on each init
and build — the canonical place for iOS-specific overrides.

- src-tauri/Info.ios.plist (new): adds NSCameraUsageDescription with a
  user-facing rationale that names the NIP-46 bunker QR flow.
- src-tauri/src/lib.rs: comment block updated to document the merge
  source so future readers don't try to edit gen/ directly.

iOS init succeeded (cocoapods 1.16.2 installed via brew), Apple deps
are up to date, Xcode project generated at
src-tauri/gen/apple/compost-marketplace.xcodeproj.
Android init succeeded earlier (this commit only finishes the iOS
side); CAMERA permission auto-merges from the plugin manifest.

Tests/build unchanged: 267/267, tsc + vite build clean.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

---
