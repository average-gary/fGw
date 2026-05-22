---
title: "Plan: implementation plan to refine fGw per round-2 + round-3 wiki findings"
type: plan
project: fgw-refinements
format: spec
sources:
  - .wiki/output/assess-fGw-2026-05-20-r2.md
  - .wiki/wiki/topics/pyramid-in-fgw.md
  - .wiki/wiki/references/pyramid-relay-api.md
  - .wiki/wiki/concepts/pyramid-invite-tree-semantics.md
  - .wiki/wiki/theses/fgw-pile-satisfies-pfrp.md
  - .wiki/wiki/topics/fgw-compost-academic-standing.md
  - .wiki/wiki/concepts/mulch-spring-warming-penalty.md
  - .wiki/wiki/references/fgw-gods-blanket-mulch.md
  - .wiki/wiki/references/fgw-field-guide-compost-spec.md
  - .wiki/wiki/concepts/fgw-pile-turn-schedule.md
  - .wiki/wiki/concepts/fgw-pile-build-process.md
  - .wiki/raw/papers/2026-05-21-pyramid-handler-go.md
  - .wiki/raw/papers/2026-05-21-pyramid-members-go.md
  - .wiki/raw/papers/2026-05-21-pyramid-member-page-templ.md
  - .wiki/raw/papers/2026-05-21-nip-42-auth-spec.md
  - .wiki/raw/papers/2026-05-21-khatru-framework-readme.md
  - .wiki/raw/papers/2026-05-20-epa-40cfr-503-pfrp.md
  - .wiki/raw/papers/2026-05-20-epa-40cfr-503-32-class-a.md
  - .wiki/raw/papers/2026-05-20-van-donk-2011-mulch-depth.md
  - .wiki/raw/papers/2026-05-20-spring-soil-warming-penalty.md
  - "Stage-3 NIP-86 wire-format research (this session)"
generated: 2026-05-21
---

# Plan: refine fGw per round-2 + round-3 wiki findings

## Executive Summary

This plan ships **two waves of refinement** to the fGw codebase, grounded in the wiki's compiled research:

- **Wave 10 — Must-fix (3 SPECs + docs)** — repair `src/lib/pyramid.ts` so it actually works against the running Pyramid relay; patch SPEC § 2.2's "constants are sacred" framing for intellectual honesty; create the missing `README.md` at repo root.
- **Wave 11 — Additive (5 SPECs)** — surface the wiki's compiled FGW knowledge in the UI: PFRP-compliance badge, climate-adaptation banner on the Learn page, `TurnRecord.temperatureMethod` discriminator, vegetable-bed pile preset, `disable`/`enable` admin actions.

The Pyramid finding from round-3 is the **only known regression in shipped code** — the rest is additive. Both waves can ship inside a single weekend if executed in sequence.

## Architecture Decisions

### Decision 1: Pyramid client uses NIP-86 over HTTP+NIP-98 (not WebSocket, not cookie session)

**Context**: Round-3 research exposed that fGw's `src/lib/pyramid.ts` calls four endpoints (`/allow`, `/ban`, `/allowed`, `/banned`) that **do not exist** on Pyramid. Pyramid's actual mutation surface is `POST /action` with `type ∈ {invite, drop, leave, disable, enable}`, and its programmatic API is **NIP-86** ([pyramid-relay-api.md](../../wiki/references/pyramid-relay-api.md)).

**Options considered**:
- **A. Cookie-session HTTP to `POST /action`** — would work for a same-origin web build but breaks for Tauri (cross-origin, no cookie sharing) ([pyramid-in-fgw.md § Path A vs B](../../wiki/topics/pyramid-in-fgw.md))
- **B. NIP-86 over the existing NDK WebSocket** — the round-3 wiki article originally proposed this; **incorrect** per the actual NIP-86 spec
- **C. NIP-86 via HTTP POST with NIP-98 auth header** — what the spec actually defines; works in Tauri (no cookie); structured response (no HTML scraping); NDK 2.18.1 has no helper, must hand-roll

**Decision**: Option C. NIP-86 is HTTP-borne ([NIP-86 spec verbatim](https://github.com/nostr-protocol/nips/blob/master/86.md)), authenticated via a NIP-98 event in `Authorization: Nostr <base64-event>`, with a **mandatory** `payload` tag (sha256 of request body). NDK ships no helper as of 2.18.1; fGw hand-rolls a `nip86Call(...)` helper. See [pyramid-relay-api.md § NIP-86 reference implementation](../../wiki/references/pyramid-relay-api.md#nip-86-reference-implementation) for the canonical code shape.

**Consequences**:
- Removes 4 broken HTTP paths.
- Replaces HTML screen-scraping for membership lists with structured JSON.
- The kind-22242 subscription must be removed (NIP-42 reserves kind 22242 for AUTH only — Pyramid never broadcasts it).
- Membership-status freshness now relies on **polling** `listallowedpubkeys` / `listbannedpubkeys` (every 5 min in foreground; on app-resume; on publish failure with `restricted:` reason).
- The signing key must be in Pyramid's admin allowlist or every call 401s.

### Decision 2: PFRP-compliance is reported, not enforced

**Context**: The wiki's [PFRP thesis](../../wiki/theses/fgw-pile-satisfies-pfrp.md) verdict is **partially-supported / medium confidence** — FGW's 6-turn / 36-day high-temp window meets EPA 40 CFR § 503 Appendix B PFRP windrow on paper (≥ 5 turns / ≥ 15 days at ≥ 55 °C), but the Field Guide's hand-feel rod test is not TMECC-defensible.

**Options considered**:
- **A. Block** non-compliant pile distribution in the app UI (refuse to mark `READY` if cumulative-high-temp-days < 15)
- **B. Inform** — surface a PFRP badge that turns green when criteria are met, yellow when measurement method is hand-feel, neutral otherwise
- **C. Ignore** — leave compliance to the chapter's discretion

**Decision**: Option B. The chapter is the source of truth on whether their pile leaves the chapter; the app should not gate workflow on a regulatory frame the chapter may not be subject to ([pyramid-in-fgw.md § Operational notes](../../wiki/topics/pyramid-in-fgw.md), [fgw-pile-satisfies-pfrp.md § Verdict](../../wiki/theses/fgw-pile-satisfies-pfrp.md)). Inform-don't-block respects chapter sovereignty while making the PFRP/Class A frame visible to admins who care.

**Consequences**:
- `PileDetail.tsx` gains a small badge component reading `cumulative_high_temp_days` from `TurnRecord[]`.
- The badge color encodes both quantitative (≥ 15 days?) and methodological (probe vs hand-feel?) compliance.
- A future `Pile.distributionScope: 'chapter-only' | 'external'` field could escalate the badge to a hard warning when distribution leaves the chapter — explicitly deferred to Wave 12.

### Decision 3: Climate-adaptation banner is one banner per Learn page, not a global toggle

**Context**: The wiki's [academic-standing topic](../../wiki/topics/fgw-compost-academic-standing.md) and [mulch spring-warming concept](../../wiki/concepts/mulch-spring-warming-penalty.md) document specific climate-mismatch findings: Giller 2015 shows no-till underperforms in wet climates (Powder Keg's WV is humid-continental); Field Guide's mulch prescription delays soil warming 1–2 weeks in cold-spring climates.

**Options considered**:
- **A. Single global "FGW is southern-Africa-anchored" banner** at the top of every Learn page
- **B. Per-page banners** with content tailored to that page (compost-recipe page → cite academic-standing; gods-blanket page → cite spring-warming concept)
- **C. Inline footnote markers** inside the existing Learn content

**Decision**: Option B. The two affected pages (`compost-recipe.md`, `gods-blanket.md`, plus `six-keys.md` because it lists no-till as Key 1) each have a different climate concern. A global banner is too generic to be actionable; inline footnotes are too easy to miss.

**Consequences**: 3 banners across 3 pages. ~30 lines of markdown total. Banner copy is templated and pulls a `banner` prop block from each Learn page's frontmatter so future chapters can override.

### Decision 4: `TurnRecord` gets a `temperatureMethod` discriminator, not a separate `probeMethod` collection

**Context**: TMECC method 03.05 mandates calibrated multi-probe arrays at multiple depths/locations. FGW's hand-feel rod test is not TMECC-defensible. Today `TurnRecord` has `temperatureC?: number` — single scalar, no method tag.

**Options considered**:
- **A. Add `temperatureMethod: 'rod-hand-feel' | 'electronic-probe-calibrated'`** as a discriminator on the existing scalar
- **B. Add a parallel `probeReadings: Array<{ depthCm, locationLabel, tempC }>` field** for true multi-probe support
- **C. Both** — discriminator now, multi-probe later

**Decision**: Option A this wave. Multi-probe (Option B) is real value but requires UI affordances we don't yet have (depth picker, location picker, multi-row form). Ship the discriminator now; if/when chapter members start using calibrated probes, multi-probe lands as a clean extension. Backwards-compatible: existing `TurnRecord` records get `temperatureMethod: 'rod-hand-feel'` on read (the default).

**Consequences**:
- Schema additive; no migration needed.
- PFRP badge logic uses `temperatureMethod` to pick the badge color (yellow for any hand-feel reading).
- The Add Turn Record form gets one extra control (radio: rod / probe).

### Decision 5: Wave 10 docs (SPEC § 2.2 honesty patch + README) ship as commit-only, not as SPECs

**Context**: Documentation-only changes don't need SPEC numbers, acceptance tests, or a multi-agent swarm. They need a careful read and a commit.

**Decision**: SPEC § 2.2 honesty patch + README live as a single commit at the start of Wave 10. The plan calls them out for visibility but doesn't allocate SPEC numbers.

**Consequences**: Faster start; lower ceremony for the docs-only piece.

### Decision 6: Vegetable-bed preset deferred until the Vegetable Guide is text-extracted

**Context**: The wiki has [a raw note for the Vegetable Guide](../../raw/papers/2026-05-20-fgw-vegetable-guide-2nd-edition.md) but no verbatim ratios. The Field Guide explicitly says "If making compost for vegetable plantings, please see the Vegetable Guide for guidelines on compost ingredient ratios." Without the Vegetable Guide text, fGw has no ratios to ship.

**Decision**: Vegetable-bed preset is **gated on a `/wiki:research` round** that text-extracts the Vegetable Guide first. Plan flags this as an open dependency; SPEC-053 stub captures the intent.

**Consequences**: SPEC-053 ships in a future wave (12+), not Wave 11. The plan honestly reflects that.

## Implementation Phases

The plan has two waves. Each contains SPECs with the same structure as the existing fGw SPECs (001–035).

### Wave 10 — Must-fix (estimated effort: 1–2 days)

**Goal**: Restore `src/lib/pyramid.ts` to working order; close the SPEC § 2.2 / README documentation gaps surfaced in round-2 assess.

**Wave 10 dependencies**: none. Can start immediately.

**Wave 10 validation**: `pnpm tsc --noEmit && pnpm test` clean; `pnpm vite build` clean; manual smoke against `chat.virginiafreedom.tech` confirming `inviteByNpub` actually invites.

#### SPEC-049 — Pyramid client surgery (NIP-86 over HTTP+NIP-98)

**Context**: `src/lib/pyramid.ts` calls 4 nonexistent endpoints (`/allow`, `/ban`, `/allowed`, `/banned`) and uses NIP-98 in a way Pyramid doesn't accept. NIP-86 is the canonical API; NDK ships no helper.

**Inputs**: SPEC-005 (NDK singleton), SPEC-010 (auth orchestrator), SPEC-025 (existing Pyramid client). Wiki: [pyramid-in-fgw.md](../../wiki/topics/pyramid-in-fgw.md), [pyramid-relay-api.md](../../wiki/references/pyramid-relay-api.md).

**Architecture**:

```
src/lib/pyramid.ts
├── existing: parseMemberPage(html)            ← KEEP (still useful for /u/{pubkey})
├── existing: usePyramidStore                  ← KEEP
├── existing: useMembershipStatus(pubkey)      ← REWIRE to polling
├── existing: usePublishGuard()                ← KEEP
├── existing: _resetPyramidForTests            ← KEEP
├── REMOVE: kind-22242 subscription (line ~373) ← never fires per NIP-42
├── REWRITE: inviteByNpub(npub)                ← was POST /allow → now nip86Call('allowpubkey', ...)
├── REWRITE: dropMember(pubkey)                ← was POST /ban → now nip86Call('banpubkey', ...)
├── REWRITE: listMembers()                     ← was GET /allowed → now nip86Call('listallowedpubkeys', [])
├── REWRITE: listBanned()                      ← was GET /banned → now nip86Call('listbannedpubkeys', [])
└── NEW: nip86Call<T>(method, params): Promise<T>  ← hand-rolled HTTP+NIP-98
```

**API contracts**:

```ts
// Internal helper (not exported)
async function nip86Call<T>(
  ndk: NDK, relayWsUrl: string, method: string, params: unknown[],
): Promise<T>;

// Public API (existing signatures preserved for callers; internals rewired):
export async function inviteByNpub(npub: string): Promise<Result<void, InviteError>>;
export async function dropMember(pubkey: string): Promise<Result<void, DropError>>;
export async function listMembers(): Promise<Member[]>;
export async function listBanned(): Promise<Member[]>;
```

**Reference implementation**: see [pyramid-relay-api.md § NIP-86 reference implementation](../../wiki/references/pyramid-relay-api.md#nip-86-reference-implementation) for the `nip86Call` body. The implementer should copy that helper verbatim and write `inviteByNpub` etc. as thin wrappers that call it with the right method name.

**Data model**: no schema changes. The `Member` interface remains `{ pubkey, npub?, level? }`; the `level?` field becomes harder to populate from NIP-86 alone (the response gives `{pubkey, reason?}`) — defer level rendering to a separate `parseMemberPage(html)` call when the user opens an admin detail view.

**Error mapping** (replace existing):

| Old | New |
|---|---|
| HTTP 401 → `InviteError('not-authed')` | NIP-86 401 → `InviteError('not-authed')` |
| HTTP 422 + body keyword → cycle/over-quota/already-member | NIP-86 `error: <message>` field — substring match for keywords |
| Network/5xx | unchanged |
| (new) HTTP 200 + `error` field set | typed by message keyword |

**Membership polling** (replaces kind-22242 listener):

- On boot: fetch once.
- On chapter relay change: bust cache, fetch.
- Foreground: poll every 5 min.
- App resume from background: fetch.
- On publish failure with `auth-required:` or `restricted:` reason: fetch immediately (the user just learned they're not allowed).

**Tests**:
- Existing `src/lib/pyramid.test.ts` has 13 tests — keep as many as possible. Tests that asserted HTTP `/allow` / `/ban` paths must be rewritten to assert `nip86Call` is invoked with the right method name.
- Add: `nip86Call` request envelope shape (method + params), NIP-98 header construction, `payload` tag presence.
- Add: error mapping for NIP-86 `{result: null, error: "over quota"}` → `InviteError('over-quota')`.
- Add: kind-22242 subscription removed (assert `getNdk()` is never called with kinds containing 22242 by pyramid.ts).

**Acceptance**:
- `pnpm tsc --noEmit && pnpm vitest run src/lib/pyramid` clean.
- Manual smoke: with a NIP-86-allowlisted signer configured, `inviteByNpub('npub1...')` against `chat.virginiafreedom.tech` returns `{ok: true}` and the new pubkey appears in a subsequent `listMembers()` call.

**Deployment**: ships in the same commit as SPEC-050.

#### SPEC-050 — Drop the kind-22242 listener; add NIP-86 polling

**Context**: NIP-42 reserves kind 22242 for AUTH only ([NIP-42 verbatim](../../raw/papers/2026-05-21-nip-42-auth-spec.md)). Pyramid never broadcasts membership-change events. The defensive subscription will never fire.

**Inputs**: SPEC-005, SPEC-049.

**Architecture**: remove the `ensureMembershipSubscription()` function at `src/lib/pyramid.ts:~373`. Replace with a `MembershipPoller` class keyed on `useChapterStore.subscribe`:

```ts
class MembershipPoller {
  private timer?: ReturnType<typeof setInterval>;
  private currentRelay?: string;

  start() {
    this.fetch();                          // immediate
    this.timer = setInterval(() => this.fetch(), 5 * 60 * 1000);
    document.addEventListener('visibilitychange', this.onVisible);
    useChapterStore.subscribe(() => this.fetch());
  }

  private fetch = () => {
    refreshMembership();  // existing private function in pyramid.ts
  };

  private onVisible = () => {
    if (document.visibilityState === 'visible') this.fetch();
  };

  stop() {
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisible);
  }
}
```

**Wiring**: instantiated once at app boot from `src/App.tsx` inside the `<ToastProvider>` wrap (alongside the auth orchestrator's bootstrap). One global poller, not per-component.

**Tests**:
- Mock `setInterval` + `document.visibilityState`; assert poller fetches on schedule, on visibility-change, on chapter-store change.
- Assert `getNdk()` subscriptions in pyramid.ts never use `kinds: [22242]`.

**Acceptance**: integration test in `pyramid.test.ts` verifies polling cadence; existing kind-22242 test cases (if any) updated or deleted.

#### Wave 10 docs (commit-only, no SPEC #)

Single commit at the **start** of Wave 10:

1. **SPEC § 2.2 honesty patch**: append the sentence `"These constants are practitioner-codified from Brian Oldreive's Hinton Estate experience and captured in the Field Guide; they are not independently peer-validated, but represent tested tradition within the FGW framework. See .wiki/wiki/topics/fgw-compost-academic-standing.md for context."` after the existing "These constants are sacred" line in `SPEC.md`.

2. **README.md at repo root**: 150 words per the round-2 assess r2 § Documentation Drift / Q4 draft. Points to `SPEC.md` and `.wiki/`. Names a maintainer (TBD — ask user before commit).

3. **Quick `git status` check** — confirm no other working-tree drift before the commit.

### Wave 11 — Additive (estimated effort: 2–3 days)

**Goal**: Surface the wiki's compiled FGW knowledge in the UI so chapter members benefit from the research.

**Wave 11 dependencies**: Wave 10 must land first (the Pyramid surgery is structural; the additive items would conflict with the rewrite if interleaved).

#### SPEC-051 — PFRP-compliance badge on PileDetail

**Context**: [fgw-pile-satisfies-pfrp.md](../../wiki/theses/fgw-pile-satisfies-pfrp.md): regimen-compliant, not measurement-compliant. Badge informs without blocking.

**Inputs**: SPEC-013 (Pile state), SPEC-021 (PileDetail), SPEC-052 (TurnRecord temperatureMethod, ships in same wave).

**Architecture**:

```
PileDetail.tsx
└── <PfrpBadge pile={pile} turns={turnRecords} />
    └── badge rules:
        cumulativeHighTempDays(turns) >= 15 && allMethods === 'electronic-probe-calibrated' → green ("PFRP windrow met (instrumented)")
        cumulativeHighTempDays(turns) >= 15 && some hand-feel                              → yellow ("Regimen meets PFRP, instrumentation does not")
        cumulativeHighTempDays(turns) <  15 && state === ACTIVE_TURNS                       → neutral ("Building PFRP window — N of 15 days")
        state === DRAFT|COLLECTING|BUILDING                                                 → hidden
        state === CURING|READY|CONSUMED                                                     → frozen badge from final turn
        state === ABANDONED                                                                  → hidden
```

`cumulativeHighTempDays` is a pure helper in `src/lib/pile/pfrp.ts`: walks `turnRecords[]` chronologically, counts days where `temperatureC >= PILE_TEMP_RANGE_C.min` (= 55 °C from `src/domain/fgw.ts`). Only counts a day once even if multiple readings on the same day.

**Component**:

```tsx
// src/components/pile/PfrpBadge.tsx
export interface PfrpBadgeProps { pile: Pile; turns: TurnRecord[]; }
export function PfrpBadge({ pile, turns }: PfrpBadgeProps): JSX.Element | null;
```

**Tests** (in `src/lib/pile/pfrp.test.ts`):
- `cumulativeHighTempDays([])` === 0
- 16 days each with one reading at 60°C → 16
- 16 days each with one reading at 50°C (below floor) → 0
- Multiple readings same day, one ≥ 55, one < 55 → counts the day
- Mixed methods → returns the days but discriminator is rendered separately

`src/components/pile/PfrpBadge.test.tsx`: render with the four state-machine cases above.

**Acceptance**: PileDetail rendering tests pass; badge appears in the right state for the right turn-history input.

#### SPEC-052 — `TurnRecord.temperatureMethod` discriminator

**Context**: TMECC method 03.05 vs FGW hand-feel. ([fgw-pile-satisfies-pfrp.md § Evidence Against](../../wiki/theses/fgw-pile-satisfies-pfrp.md#evidence-against))

**Inputs**: SPEC-013 (Pile types).

**Schema change** (in `src/lib/pile/types.ts`):

```ts
// before:
export interface TurnRecord {
  index: number;
  completedAt?: number;
  temperatureC?: number;
  moisture?: number;
  notes?: string;
}

// after:
export type TemperatureMethod = 'rod-hand-feel' | 'electronic-probe-calibrated';

export interface TurnRecord {
  index: number;
  completedAt?: number;
  temperatureC?: number;
  temperatureMethod?: TemperatureMethod;  // NEW; default 'rod-hand-feel' on read
  moisture?: number;
  notes?: string;
}
```

**Migration**: backwards-compatible. Decoder defaults missing field to `'rod-hand-feel'` (the historical assumption). Encoder writes only when set.

**UI**: `PileDetail.tsx` Add-Turn-Record form gets one new control:

```tsx
<RadioGroup label="How did you measure temperature?" required>
  <RadioOption value="rod-hand-feel" default>
    8 mm steel rod, 5-second hand-feel test (Field Guide method)
  </RadioOption>
  <RadioOption value="electronic-probe-calibrated">
    Calibrated electronic probe (TMECC method 03.05)
  </RadioOption>
</RadioGroup>
```

**Tests** (in `src/lib/pile/pile.test.ts`):
- New TurnRecord with `temperatureMethod: 'electronic-probe-calibrated'` round-trips through encodePile/parsePile.
- Old TurnRecord without the field, parsed, gets `temperatureMethod === 'rod-hand-feel'`.

**Acceptance**: encode/parse round-trip; PileDetail form renders the radio; PfrpBadge (SPEC-051) reads the discriminator correctly.

#### SPEC-053 — Vegetable-bed pile preset (DEFERRED)

**Context**: [Vegetable Guide raw note](../../raw/papers/2026-05-20-fgw-vegetable-guide-2nd-edition.md) confirms the manual exists but has not been text-extracted. Field Guide explicitly says vegetable-bed compost has different ratios than maize.

**Status**: **DEFERRED to Wave 12+.** Gated on `/wiki:research --local "FGW Vegetable Guide compost ratios variant" --sources 3` text-extracting the actual numbers.

**Stub**: SPEC-053 reserved. When Vegetable Guide is ingested, the SPEC ships as: extend `PILE_PRESETS` in `src/domain/fgw.ts` with a 4th preset; update NewPile wizard to surface it; add a "vegetable" branch to `scaledIngredients` if the ratios differ.

This SPEC is **not in Wave 11**. It's in the plan only for visibility.

#### SPEC-054 — Climate-adaptation banner on Learn pages

**Context**: [academic-standing topic](../../wiki/topics/fgw-compost-academic-standing.md) + [mulch spring-warming](../../wiki/concepts/mulch-spring-warming-penalty.md) + the Field Guide's own 5cm-gap rule for non-maize crops ([fgw-gods-blanket-mulch.md § The spec](../../wiki/references/fgw-gods-blanket-mulch.md)).

**Inputs**: SPEC-024 (Learn route).

**Architecture**: each affected Learn page (`compost-recipe.md`, `gods-blanket.md`, `six-keys.md`) gets a YAML-frontmatter `banner` block:

```yaml
---
title: God's Blanket
banner:
  tone: caution
  heading: Cold-climate adaptation
  body: |
    The Field Guide is anchored on southern-Africa rainy-season agronomy.
    Powder Keg WV (Zone 6b) is humid-continental, where 100% mulch coverage
    at planting can delay soil warming 1–2 weeks. The Field Guide already
    prescribes a 5 cm gap around non-maize seedlings — extend that gap rule
    to all crops in cold-spring climates, or apply the full blanket only
    after emergence.
  link:
    text: See research evidence
    href: '/learn/.context/mulch-spring-warming'
---
```

`src/routes/Learn.tsx` reads the banner block from each page's frontmatter and renders a `<LearnBanner>` component above the content. The `link.href` resolves to a wiki cross-reference rendered as an in-app modal (no new route — uses existing Sheet).

**Three banners total** (one per affected page); copy drawn directly from wiki articles cited above.

**Tests**: snapshot tests on the three Learn pages confirming the banner renders with the right heading + body.

**Acceptance**: visual review; markdown linter passes the new frontmatter; banner displays above content without overflowing card layout on mobile.

#### SPEC-055 — `disable`/`enable` admin actions

**Context**: [pyramid-invite-tree-semantics.md § The five actions](../../wiki/concepts/pyramid-invite-tree-semantics.md): Pyramid supports 5 actions; fGw exposes 2. `disable` is reversible suspension (sabbatical, travel) — useful for chapter governance.

**Inputs**: SPEC-026 (Admin Members route), SPEC-049 (NIP-86 client).

**Architecture**:

```
src/lib/pyramid.ts (extend)
├── existing: inviteByNpub, dropMember
├── NEW: disableMember(pubkey): Promise<Result<void, DisableError>>
└── NEW: enableMember(pubkey): Promise<Result<void, EnableError>>
```

Both call `nip86Call(...)` from SPEC-049 — `disableMember` calls method `disablepubkey` (or whatever Pyramid's go-nostr nip86 surface names it; the Stage-3 research listed extras but didn't pin disable/enable specifically — implementer should confirm method name from `https://github.com/nbd-wtf/go-nostr/blob/master/nip86/methods.go` before writing the helper). If go-nostr doesn't expose disable/enable in NIP-86 (likely — those are Pyramid-internal actions), the fallback is `POST /action` with `type=disable` over the cookie path; document the choice.

UI: `src/routes/admin/Members.tsx` gets two new per-row actions (visible only when current user has authority over that row, same gating as Drop):

- "Pause member" → `disableMember(pubkey)`
- "Resume member" → `enableMember(pubkey)` (visible only if member is currently `Removed: true` due to disable, distinguishable from `Removed: true` due to drop — Pyramid's `Member` shape distinguishes these; check `getMemberStatus` on the response).

**Tests**: round-trip in `pyramid.test.ts`; integration in `Members.test.tsx`.

**Acceptance**: a member can be paused, the chapter feed stops showing their content, the member can be resumed.

#### SPEC-056 — `parseMemberPage` status-text fast path

**Context**: [member-page-templ source](../../raw/papers/2026-05-21-pyramid-member-page-templ.md) shows the page emits distinct status text: `root member` `(level 0)` | `member` `(level N)` | `not a member`. fGw's existing parser scrapes the inviter list to determine membership — slower and more brittle.

**Inputs**: existing `parseMemberPage(html)` in `src/lib/pyramid.ts`.

**Architecture**: in `parseMemberPage`, before the landmark-split for inviter/invitee lists, run a regex against the status text:

```ts
function detectStatus(html: string): 'root' | 'member' | 'not-a-member' | 'unknown' {
  if (/root member/.test(html)) return 'root';
  if (/not a member/.test(html)) return 'not-a-member';
  if (/(?<!not a )member \(level \d+\)/.test(html)) return 'member';
  return 'unknown';
}
```

Use the status as a fast-path in `useMembershipStatus`: if status text says `not a member`, return `'not-listed'` immediately without scraping lists.

**Tests**: small fixture HTML for each branch.

**Acceptance**: existing 13 pyramid tests still pass; new branch coverage.

## Risks & Mitigations

| Risk | Source | Mitigation |
|---|---|---|
| Pyramid's deployed version on `chat.virginiafreedom.tech` differs from upstream `master` | Wiki research read upstream only | First Wave-10 manual smoke is a **read-only** call (`listallowedpubkeys`) before any mutation; verify response shape matches spec before writing tests |
| NDK 2.18 `NDKEvent.toNostrEvent` signature subtly differs from the spec implementer expects | Stage-3 research | Add a unit test that exercises `auth.toNostrEvent()` shape against the NIP-98 spec's required tags |
| NIP-98 `payload` tag computation off-by-one (sha256 of body before vs after JSON.stringify) | NIP-86 spec strictness | Test fixture with a known-input known-hash check; if Pyramid 401s, the message includes the expected hash |
| `disable`/`enable` not exposed via NIP-86 — must fall back to cookie-session `/action` | Stage-3 research listed go-nostr extras but didn't confirm method names | SPEC-055 implementer first reads go-nostr methods.go; if missing, deferral is OK (skip SPEC-055, doesn't block Wave 11) |
| Polling every 5 min wastes battery | SPEC-050 design | Don't poll while backgrounded; only on visibility-change to foreground |
| Climate-adaptation banner is read as criticism of FGW theology | [academic-standing topic § How the wiki should phrase this](../../wiki/topics/fgw-compost-academic-standing.md) | Banner copy is informational, not contradictory; cites the Field Guide's own 5 cm gap rule (which already accommodates the warming concern); avoids any "FGW is wrong" framing |
| PFRP badge implies app endorses external compost distribution | SPEC-051 design | Badge is informational only; wave 12 may add a `distributionScope` gate that turns the badge into a hard warning when distribution is set to external |
| Climate-mismatch caveat (Giller 2015) is older than the spec ideally cites | [academic-standing topic](../../wiki/topics/fgw-compost-academic-standing.md) | Wiki article notes 2015 but 667 cites and a 5,463-paired-observation meta-analysis; defensible until a more recent one supersedes |
| User has no NIP-86 admin signer → Wave 10 can't be smoke-tested against real Pyramid | NIP-86 reference impl | Either obtain admin allowlist for the test signer from the Pyramid root admin, OR stand up a local Pyramid instance with the test signer as root for integration testing |

## Open Questions

The plan can ship without resolving these, but each could improve quality:

1. **Pyramid `disable`/`enable` NIP-86 method names** — go-nostr methods.go has the answer; implementer should pull before writing SPEC-055.
2. **README.md maintainer name** — defaults to "TBD" per round-2 assess r2 draft; ask user before the Wave-10 docs commit.
3. **Whether the climate-adaptation banner should also disclose the academic-standing critique** (Giller 2015 + Spaling & Vander Kooy 2019) at the bottom of every Learn page, vs only on the affected pages — currently scoped to per-page banners only.
4. **PFRP badge in `CONSUMED` state** — should the badge show frozen final-turn state, or hide entirely once compost is consumed? Current decision: freeze. Re-examine post-Wave-11.

## Sources Consulted

20 wiki articles + 1 Stage-3 gap research session.

**Decision-shaping**:
- [pyramid-in-fgw.md](../../wiki/topics/pyramid-in-fgw.md) — round-3 finding; drove Decision 1 + Wave 10 entirely.
- [pyramid-relay-api.md](../../wiki/references/pyramid-relay-api.md) — NIP-86 reference impl; SPEC-049 architecture.
- [pyramid-invite-tree-semantics.md](../../wiki/concepts/pyramid-invite-tree-semantics.md) — 5-action surface; SPEC-055 scope.
- [fgw-pile-satisfies-pfrp.md](../../wiki/theses/fgw-pile-satisfies-pfrp.md) — partially-supported verdict; Decision 2 + SPEC-051.
- [academic-standing topic](../../wiki/topics/fgw-compost-academic-standing.md) — practitioner-codified framing; SPEC § 2.2 patch + SPEC-054 banner.
- [mulch-spring-warming-penalty](../../wiki/concepts/mulch-spring-warming-penalty.md) — Zone 6b mismatch evidence; SPEC-054 banner copy.
- [output/assess-fGw-2026-05-20-r2.md](../../output/assess-fGw-2026-05-20-r2.md) — opportunity prioritization; wave structure.

**Source-of-truth grounding**:
- [pyramid-handler-go.md](../../raw/papers/2026-05-21-pyramid-handler-go.md), [pyramid-members-go.md](../../raw/papers/2026-05-21-pyramid-members-go.md), [pyramid-member-page-templ.md](../../raw/papers/2026-05-21-pyramid-member-page-templ.md) — Pyramid Go source.
- [nip-42-auth-spec.md](../../raw/papers/2026-05-21-nip-42-auth-spec.md) — kind-22242 = AUTH only.
- [khatru-framework-readme.md](../../raw/papers/2026-05-21-khatru-framework-readme.md) — Pyramid's parent.
- [epa-40cfr-503-pfrp.md](../../raw/papers/2026-05-20-epa-40cfr-503-pfrp.md), [-32-class-a.md](../../raw/papers/2026-05-20-epa-40cfr-503-32-class-a.md) — PFRP regulation.
- [van-donk-2011-mulch-depth.md](../../raw/papers/2026-05-20-van-donk-2011-mulch-depth.md), [spring-soil-warming-penalty.md](../../raw/papers/2026-05-20-spring-soil-warming-penalty.md) — mulch-page banner evidence.
- [fgw-field-guide-mulch-passages.md](../../raw/papers/2026-05-20-fgw-field-guide-mulch-passages.md), [-2nd-edition.md](../../raw/papers/2026-05-20-fgw-field-guide-2nd-edition.md), [-vegetable-guide-2nd-edition.md](../../raw/papers/2026-05-20-fgw-vegetable-guide-2nd-edition.md) — Field Guide primary source.

**Stage-3 gap research**: NIP-86 spec (https://github.com/nostr-protocol/nips/blob/master/86.md) + go-nostr nip86/methods.go + local NDK 2.18.1 grep. Findings: NIP-86 is HTTP+NIP-98 (not WebSocket), NDK ships no helper, hand-rolled `nip86Call` reference implementation provided in pyramid-relay-api.md.
