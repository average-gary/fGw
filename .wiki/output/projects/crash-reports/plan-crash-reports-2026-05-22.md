---
title: "Plan: optional crash reports via NIP-17 DM"
type: plan
project: crash-reports
format: roadmap
sources:
  - .wiki/raw/notes/spec.md
  - .wiki/raw/notes/home-dir-plan.md
  - .wiki/output/assess-fGw-2026-05-20.md
  - .wiki/output/projects/alpha-bundle/plan-alpha-bundle-2026-05-22.md
  - .wiki/wiki/topics/pyramid-in-fgw.md
generated: 2026-05-22
---

# Plan: optional crash reports via NIP-17 DM

## Executive Summary

Add a small, opt-in crash-reporter that captures uncaught JS errors and
unhandledrejections, persists redacted payloads across process restarts,
and on next boot — after the user's signer is available — shows a
per-report prompt to send the report as a NIP-17 DM to a maintainer
constant. Real user signer (Pyramid relay's allowlist forbids ephemeral
publishers); the existing kind-1059 wrap pipeline already generates an
ephemeral outer-wrap keypair and discards it at scope exit (SPEC-030).
**No new crypto, no new dependencies, no telemetry SaaS.**

The feature is **alpha-class diagnostic only**: scope is JS error
handlers (`window.error` / `unhandledrejection`) and React error
boundaries. Native Rust panics and OS-level signal crashes are out of
scope.

## Architecture Decisions

### Decision 1: Real signer, not anonymous ephemeral key

**Context**: Pyramid's write allowlist gates kind-1059 publishes by the
event's `pubkey` field — see [pyramid-in-fgw.md § Operational notes](../../../wiki/topics/pyramid-in-fgw.md).
An ephemeral, non-allowlisted pubkey cannot publish to
`chat.virginiafreedom.tech`. The original framing of this plan
("anonymous report from a one-shot identity") would require either a
public-relay fallback or a server-side relay that accepts unallowlisted
1059s. Both expand the trust surface.

**Options considered**:
- **A. Real signer, accept that the maintainer sees the sender npub** — minimal new infrastructure; matches existing `sendDm` pipeline; loses anonymity.
- **B. Public relay (relay.damus.io / nos.lol) for crash reports** — preserves anonymity but introduces a third-party relay the user never opted into.
- **C. Ephemeral-pubkey allowlist exception** on the chapter relay — would require Pyramid feature work or a separate Khatru sub-relay.

**Decision**: Option A, gated by per-report opt-in. The chapter audience
is small (~10 known testers) where attribution is *useful* for
follow-up, not adversarial. The opt-in prompt makes attribution
explicit ("this will send a DM identifying you as the sender to
[maintainer]").

**Consequences**:
- The maintainer sees who sent each report. This is the chapter
  sovereignty cost of staying on chapter infrastructure.
- The existing `wrapForRecipient()` ephemeral key (kind-1059 outer
  wrap) is unchanged — already best-practice; already discarded at
  scope exit.
- Beta or public release should re-evaluate via Option B if the alpha
  audience expands beyond friends.

### Decision 2: Opt-in per-report, on next boot

**Context**: User chose this in the interview. Alternatives (onboarding
opt-in, always-off) trade higher report volume for lower agency. The
wiki's [assess-r1 § Failure Mode #4](../../assess-fGw-2026-05-20.md)
("Diaspora — federation rhetoric covering for an absent maintainer")
is the relevant frame: the chapter sovereignty story breaks if the app
silently DMs the maintainer.

**Decision**: Capture crashes always (cost is one localStorage write
per crash). On next boot, after the signer is ready, show a single
modal per queued report: payload preview + "Send" / "Discard" / "Send
all queued" actions. No persistent global toggle — the user re-decides
each time.

**Consequences**:
- Slightly higher friction → fewer reports, but each report carries
  user-explicit consent.
- If a tester crashes 3 times in one session, they get 3 prompts on
  the next boot. Add a "Send all queued" button to make that one click.
- "Don't ask again" is intentionally absent — sovereignty over
  re-consent.

### Decision 3: Storage = `localStorage` everywhere

**Context**: SPEC § 3.0 names `tauri-plugin-sql` SQLite for native and
IndexedDB for web. For a crash queue (≤ 50 KB total, mostly stack
traces), `localStorage` is simpler and works on both — Tauri's webview
provides it, and the web build trivially has it.

**Options considered**:
- **A. localStorage on both** — simple, uniform code path, ≤ 5 MB cap is
  irrelevant at this volume.
- **B. tauri-plugin-sql + IndexedDB** — matches SPEC § 3.0 prescription
  but doubles the code surface for a 50 KB use case.

**Decision**: Option A. The crash queue is small and ephemeral; aligning
with SPEC § 3.0 is correct for the relational caches it was written for
(piles, listings, events) but unnecessary here.

**Consequences**:
- Privacy-mode browsers / "clear all data" wipe the queue. Acceptable —
  a wiped queue means no reports, not a corruption.
- Bound the queue to 20 entries; FIFO-evict on overflow.

### Decision 4: Redaction allowlist, not denylist

**Context**: [assess-r1 § Failure Mode #2 (Strava heatmap geo-leak)](../../assess-fGw-2026-05-20.md)
is the wiki's clearest "what NOT to leak" guidance: the failure mode
isn't malice, it's not realizing what got included. The same principle
applies to crash payloads — a stack trace through `Pile.tsx` could
contain pile names, geohashes, photo URLs, member npubs, claim text.

**Options considered**:
- **A. Denylist** — strip known bad patterns (npubs, geohashes, etc.).
  Misses anything novel.
- **B. Allowlist** — start with `{message, name, stack, app_version,
  commit_sha, platform, ts}` and explicitly *redact* `stack` before
  inclusion: strip absolute paths, query strings, all bech32 (`npub1`,
  `nsec1`, `naddr1`, `note1`, `nevent1`, `nprofile1`), all 64-hex-char
  runs.

**Decision**: Option B with stack redaction. The whitelist of fields
fits in 7 keys; the regex pass on `stack` covers the predictable PII
classes. Anything not in the whitelist never enters the payload.

**Consequences**:
- A stack trace with `at /Users/gary/repos/fGw/src/lib/listings.ts:142`
  → `at <redacted>/src/lib/listings.ts:142`. The line number is what
  matters for triage; the absolute path isn't.
- Component names and function names in the stack survive redaction
  (they aren't PII for an app whose source is open on GitHub).
- Free-text fields ("what were you doing?") are explicitly NOT in the
  alpha scope. The user can add them in a future iteration; the prompt
  preview shows the user every byte before send so they're free to
  type addenda *after* dismissing and resending.

### Decision 5: Maintainer npub is a build-time constant

**Context**: The maintainer (Ethan Tuttle, per Wave 10 docs commit) is
named in `README.md`. His npub goes in `src/domain/crashReports.ts` as
`MAINTAINER_NPUB` next to the schema constants. Build-time constant
means: no runtime config UI, no in-app maintainer change, no Settings
field. Future maintainers update the constant via PR.

**Decision**: Single constant, exported from `src/domain/crashReports.ts`
alongside the redaction regex set and the queue cap.

**Consequences**:
- Simple. No new state, no new persisted setting.
- Maintainer rotation requires a code change + new build.
- The opt-in prompt copy includes the maintainer npub explicitly so
  the user can verify before sending.

## Implementation Phases

### Phase 1: Domain layer + schema (estimated effort: 30 min)

**Goal**: A new `src/domain/crashReports.ts` module that defines the
report schema, the maintainer npub, the queue cap, and the redaction
helpers. Pure functions, fully unit-testable.

**Tasks**:
- [ ] Create `src/domain/crashReports.ts`:
  ```ts
  export const MAINTAINER_NPUB =
    'npub1...' /* TODO: ask Ethan for his npub */;
  export const CRASH_REPORT_QUEUE_CAP = 20;
  export const CRASH_REPORT_VERSION = 1 as const;

  export interface CrashReport {
    version: typeof CRASH_REPORT_VERSION;
    ts: number;
    app_version: string;        // from package.json injected at build
    commit_sha: string;         // from VITE_COMMIT_SHA env injected by vite.config
    platform: string;           // navigator.userAgent on web; tauri os.platform on native
    error_name: string;
    error_message: string;
    stack: string;              // POST-REDACTION
  }

  export function redactStack(stack: string): string;
  export function buildReport(err: unknown): CrashReport;
  ```
- [ ] `redactStack` strips: `npub1[a-z0-9]{58}`, `nsec1[a-z0-9]{58}`,
  `naddr1[a-z0-9]+`, `note1[a-z0-9]{58}`, `nevent1[a-z0-9]+`,
  `nprofile1[a-z0-9]+`, runs of `[0-9a-f]{64}` (raw hex pubkeys/event
  IDs), absolute paths matching `/Users/<name>/...` and `C:\Users\...`,
  query strings (`?...` to end-of-line).
- [ ] `buildReport` extracts `name + message + stack` from `Error`
  instances; for non-`Error` throws, wraps in `String(thrown)` and
  marks `error_name = 'Unknown'`.
- [ ] `vite.config.ts`: inject `VITE_APP_VERSION` from `package.json`
  and `VITE_COMMIT_SHA` from `git rev-parse --short HEAD` via
  `define`. Both readable at runtime via `import.meta.env`.
- [ ] Tests in `src/domain/crashReports.test.ts`:
  - `redactStack` strips all 6 bech32 prefixes, 64-hex runs, and
    absolute paths; preserves line numbers and function names.
  - `buildReport(new Error('boom'))` → expected shape.
  - `buildReport('string thrown')` → wrapped shape.

**Dependencies**: None.

**Validation**: `pnpm vitest run src/domain/crashReports.test` clean,
new tests pass, `pnpm tsc --noEmit` clean.

**Wiki grounding**: SPEC § 3.7 (`version: 1` schema discipline).

### Phase 2: Capture + persistence (estimated effort: 1 hr)

**Goal**: A `src/lib/crashReports.ts` module that installs error
handlers, persists reports across restarts, and exposes a queue API.

**Tasks**:
- [ ] Create `src/lib/crashReports.ts`:
  ```ts
  export function installCrashHandlers(): () => void;  // returns uninstall
  export function getQueuedReports(): CrashReport[];
  export function clearReport(ts: number): void;
  export function clearAllReports(): void;
  ```
- [ ] On install, register `window.addEventListener('error', ...)` and
  `window.addEventListener('unhandledrejection', ...)`. Both call
  `buildReport()` and persist via `appendToQueue()`.
- [ ] `appendToQueue(report)`: read `localStorage['fGw.crashReports']`
  (JSON array), append, evict oldest if `length > CRASH_REPORT_QUEUE_CAP`,
  write back. **Synchronous**; the handler is in the death path of
  the renderer process and async writes may not flush.
- [ ] React error boundary at the app root (`src/components/CrashBoundary.tsx`)
  that calls the same `appendToQueue` on `componentDidCatch`. Boundary
  renders a "Something went wrong" fallback with a Reload button.
- [ ] Tests in `src/lib/crashReports.test.ts`:
  - Install handlers, dispatch a synthetic ErrorEvent → queued.
  - Queue evicts oldest at cap + 1.
  - `clearReport(ts)` removes one; `clearAllReports()` empties.
  - `installCrashHandlers()` returns a function that uninstalls.

**Dependencies**: Phase 1.

**Validation**: Manual: throw `setTimeout(() => { throw new Error('test crash') }, 100)` from the dev console. Verify localStorage gets the entry. Reload the page. Verify the entry survives.

**Wiki grounding**: SPEC § 3.0 (storage layer); the `localStorage`
choice is documented in Decision 3.

### Phase 3: Sender (estimated effort: 30 min)

**Goal**: A `sendCrashReport(report)` function that uses the existing
`sendDm()` pipeline to send the JSON-serialized report to the
maintainer.

**Tasks**:
- [ ] Add to `src/lib/crashReports.ts`:
  ```ts
  export async function sendCrashReport(
    report: CrashReport,
  ): Promise<{ ok: true } | { ok: false; reason: string }>;
  ```
- [ ] Implementation: decode `MAINTAINER_NPUB` to hex via
  `nostr-tools/nip19`, `JSON.stringify(report)` as content, call
  `sendDm(maintainerHex, content)` (existing API, preserves
  ephemeral-wrap behavior). On `ok`, clear from queue. On `reason ===
  'no-signer'`, leave queued + return error to caller.
- [ ] Test: mock `sendDm` to record calls; assert `sendCrashReport`
  invokes it with the expected `(maintainerHex, JSON-string-payload)`.
- [ ] Test: `sendCrashReport` does NOT clear the queue when `sendDm`
  rejects.

**Dependencies**: Phase 1, Phase 2.

**Validation**: Unit tests pass; manual end-to-end smoke (Phase 5).

**Wiki grounding**: SPEC-014 + SPEC-030 — existing `sendDm` is the
right primitive. No new crypto.

### Phase 4: Boot prompt (estimated effort: 1 hr)

**Goal**: On app boot, after the signer is available and the user is
on a screen that's not already modal, show a one-modal-per-queued-report
prompt with payload preview and Send/Discard/Send-all actions.

**Tasks**:
- [ ] Create `src/components/CrashReportPrompt.tsx`: a modal Sheet that
  takes `report: CrashReport` and renders:
  - Heading: "We caught a crash. Send to {maintainer-handle}?"
  - Body: a `<pre>` block showing the full JSON of the redacted
    payload, scrollable. Caption: "This will be sent as an encrypted
    DM to the maintainer."
  - Actions: `Send`, `Discard`, `Send all (N) queued`.
- [ ] Mount logic in `src/App.tsx` `AppRoutes`: after onboarding
  completes AND `useAuthStore().signer` is non-null, read
  `getQueuedReports()`. If non-empty, render
  `CrashReportPrompt(reports[0])` over the AppShell. On Send →
  `sendCrashReport(reports[0])` → on success `clearReport(reports[0].ts)`
  → re-read queue → render next prompt OR exit. On Discard →
  `clearReport(reports[0].ts)` → next. On Send all → loop, with toast
  on each success/failure.
- [ ] Mount `CrashBoundary` from Phase 2 around `AppRoutes`.
- [ ] Wire `installCrashHandlers()` in `AppRoutes`'s existing
  `useEffect` (the same one that starts `MembershipPoller`). Call the
  returned uninstall fn on unmount.
- [ ] Tests in `src/components/CrashReportPrompt.test.tsx`:
  - Renders the payload as JSON.
  - Tapping Send calls `sendCrashReport` with the report.
  - Tapping Discard calls `clearReport` and not `sendCrashReport`.
  - Tapping Send all calls `sendCrashReport` once per queued entry.
- [ ] Tests in `src/App.test.tsx`: when localStorage has a queued
  report and the user is signed in, the prompt renders.

**Dependencies**: Phases 1–3.

**Validation**: Manual smoke (Phase 5).

**Wiki grounding**: Decision 2 documents the per-report consent design;
SPEC § 3.3 (auth orchestrator) for the signer-readiness gate.

### Phase 5: End-to-end smoke + maintainer setup (estimated effort: 30 min)

**Goal**: Confirm a crash on one device produces a readable DM in the
maintainer's inbox.

**Tasks**:
- [ ] Get Ethan's npub. Update `MAINTAINER_NPUB` in
  `src/domain/crashReports.ts`.
- [ ] On a development build: throw `setTimeout(() => { throw new Error('e2e smoke crash @ ' + Date.now()) }, 200)` from the console. Reload. Verify prompt appears. Tap Send.
- [ ] In Ethan's NIP-17 inbox (whichever client he uses — Coracle,
  Amethyst, the fGw app's own Inbox), confirm the DM arrives, the
  content is the JSON, and the redaction stripped the absolute path.
- [ ] Log the maintainer npub into `INSTALL.md` (alpha-bundle plan
  Phase 5) so testers know who they're sending to.

**Dependencies**: Phases 1–4 + Ethan's npub.

**Validation**: Maintainer reports successful receipt + readable
content.

**Wiki grounding**: This phase closes the alpha-bundle plan's Open
Question #4.

## Risks & Mitigations

| Risk | Source | Mitigation |
|---|---|---|
| Pyramid relay rejects 1059 publish from a non-allowlisted user (paranoid edge case if a tester is mid-onboarding) | [pyramid-in-fgw.md § auth-required](../../../wiki/topics/pyramid-in-fgw.md) | The crash-reporter only fires `sendCrashReport` after the signer is ready AND the user has completed onboarding. Pre-onboarding crashes stay queued indefinitely until first successful sign-in. |
| Stack trace contains a string the redactor missed (e.g. a pile name with embedded geohash) | [assess-r1 § Failure Mode #2](../../assess-fGw-2026-05-20.md) | Allowlist field set, not denylist. Pile names / listing content are NOT in the schema. The only free-form field is `stack`, which is regex-redacted. The boot prompt also shows the user the full payload before send — final human-eyeballs gate. |
| Queue grows unbounded if user repeatedly dismisses prompts | Implementation risk | FIFO eviction at `CRASH_REPORT_QUEUE_CAP = 20`. If a tester sees 20 prompts on next boot, they have a real problem worth a different kind of follow-up. |
| `localStorage.setItem` throws (quota / security policy) | Browser docs | Wrap the write in a try/catch. On failure, drop the report; don't crash the crash handler (would be deeply funny but bad UX). |
| Maintainer npub is wrong / outdated | Implementation risk | Build-time constant + opt-in prompt shows the npub. Wrong npub = report goes to a stranger encrypted to a key only that stranger can read. Worst case is the report being dropped, not leaked. |
| Native Rust panic kills the webview before JS handler fires | Out of scope | Documented as out of scope. Beta could add `tauri-plugin-log` + a custom panic hook that writes to a file the JS layer reads on next boot. |
| User signs in with a different account between crash and prompt | Implementation risk | Acceptable: the report is sent from whichever signer is active when the user taps Send. The redacted payload doesn't reference any signer identity, so no leakage; just attribution-by-current-account. |

## Open Questions

1. **Ethan's npub** — needed to flip `MAINTAINER_NPUB` from placeholder
   to real value. Phase 5 task.
2. **Beta-tier roadmap**: native Rust panic hook (`tauri-plugin-log` +
   panic-to-file + JS reader) is the obvious extension. Worth a
   separate plan if alpha exposes panic-class crashes the JS handlers
   miss.
3. **Multi-maintainer**: if Gini also wants to triage reports, the
   constant becomes an array and the prompt becomes a picker. Trivial
   refactor; defer until requested.
4. **Auto-send-on-next-boot toggle**: per Decision 2 we deliberately
   don't ship this. If alpha reports come in low volume *and* testers
   are willing to opt into a global, this is the obvious next iteration.
5. **Anonymous mode revival** for public-beta: if the audience expands
   beyond friends, the public-relay-fallback path becomes worth
   building. Captured in alpha-bundle Open Question #4.

## Sources Consulted

5 wiki sources.

**Decision-shaping**:
- [raw/notes/spec.md § SPEC-014 + SPEC-030](../../../raw/notes/spec.md) — the existing `sendDm` API and the ephemeral-outer-wrap behavior. Means no new crypto.
- [output/projects/alpha-bundle/plan-alpha-bundle-2026-05-22.md § Open Question #4](../../alpha-bundle/plan-alpha-bundle-2026-05-22.md) — explicit predecessor; this plan answers it.
- [assess-fGw-2026-05-20.md § Failure Mode #2 (Strava geo-leak)](../../assess-fGw-2026-05-20.md) — the redaction-design frame: don't leak what you don't realize you're leaking.

**Operational grounding**:
- [pyramid-in-fgw.md § Operational notes](../../../wiki/topics/pyramid-in-fgw.md) — Pyramid allowlist gates kind-1059 publish by sender pubkey; collapses the original "anonymous ephemeral" framing to "real signer + opt-in."
- [raw/notes/home-dir-plan.md § SPEC-030](../../../raw/notes/home-dir-plan.md) — confirms the `wrapForRecipient()` already-ephemeral pattern.
