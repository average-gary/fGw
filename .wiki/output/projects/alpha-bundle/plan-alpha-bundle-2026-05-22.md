---
title: "Plan: ship v0.1.0-alpha.1 bundle (web + Android + desktop)"
type: plan
project: alpha-bundle
format: roadmap
sources:
  - .wiki/output/assess-fGw-2026-05-20.md
  - .wiki/output/assess-fGw-2026-05-20-r2.md
  - .wiki/raw/notes/spec.md
  - .wiki/raw/data/commit-history.md
  - .wiki/wiki/topics/pyramid-in-fgw.md
  - .wiki/wiki/references/pyramid-relay-api.md
  - "Stage-3 gap research: Tauri 2.1 mobile signing + sideload UX (this session)"
generated: 2026-05-22
---

# Plan: ship v0.1.0-alpha.1 bundle

## Executive Summary

Ship a self-hosted alpha distribution of the Powder Keg compost-marketplace
app from current `master` (commit `efbe7aa`, post-Wave-10) to the chapter:
**web SPA on a `virginiafreedom.tech` subdomain, Android APK as a direct
download from the same server, and macOS/Windows/Linux desktop installers
similarly hosted**. iOS is **deferred** — no Apple Developer account, no
TestFlight. Tag `v0.1.0-alpha.1`.

The plan is a build-and-deploy runbook, not a feature wave. No new SPECs.
The single net-new artifact in the repo is an Android signing keystore
config (one file, one secret) and an `INSTALL.md` covering platform
sideload steps. Everything else is shell commands and DNS.

## Architecture Decisions

### Decision 1: Self-host all bundles on the chapter's existing server

**Context**: The user already runs `chat.virginiafreedom.tech` (Pyramid
relay) and an `https://...virginiafreedom.tech` web stack. The wiki's
[pyramid-in-fgw.md § Operational notes](../../../wiki/topics/pyramid-in-fgw.md)
documents the chapter sovereignty principle: chapter == relay.
Distributing app bundles from any third party (GitHub Pages, Cloudflare,
Netlify) would split the trust surface — testers fetching code from
two domains with different operators.

**Options considered**:
- **A. Same server, same TLS** — `fgw.virginiafreedom.tech` for the web SPA, `https://fgw.virginiafreedom.tech/dist/<artifact>` for installers. Single domain, single operator.
- **B. GitHub Releases for installers, GH Pages for web** — free, easy CI/CD, but couples the alpha to GitHub's availability and creates the "where does this code come from" trust question.
- **C. Cloudflare Pages + GitHub Releases** — fastest, but two third parties.

**Decision**: Option A. Matches sovereignty principle. The user's server
already serves the relay over TLS; adding a static-asset subdomain is a
nginx/Caddy config + DNS record, no new cost.

**Consequences**:
- One subdomain to provision: **`fgw.virginiafreedom.tech`** (pinned
  2026-05-22; names the project explicitly so `app.*` stays free for
  future siblings).
- `INSTALL.md` points to one host.
- Outage of the chapter server == alpha goes dark. Acceptable for
  alpha audience size (~10).
- The git remote on GitHub remains the source-of-truth for code; the
  user's server hosts the *built* artifacts.

### Decision 2: Tag the bundle from current `master`, no Wave 11 features

**Context**: Per user instruction. The wiki's
[assess-r1 § Failure Mode #1](../../assess-fGw-2026-05-20.md) names
empty-store cold-start as the top alpha risk, but the chapter (~10
known testers) has the in-person trust to seed listings *after* install
without it being a launch-day event. The
[assess-r1 § Recommended Actions table](../../assess-fGw-2026-05-20.md)
ranks bundle-splitting + biometric + deep-link plugins as Wave 11; they
are quality polish, not alpha blockers.

**Options considered**:
- **A. Ship from current `master` (`efbe7aa`)** — 287/287 tests, NIP-86 verified, root-detection regression closed.
- **B. Land bundle-splitting first** — main chunk drops 832 KB → ~300 KB. Half a day of work; a real first-impression improvement on slow connections.
- **C. Land Wave 11 first** — 2–3 days; richer feature surface but pushes alpha past this weekend.

**Decision**: Option A. The user explicitly chose "ship as-is."
Polish-class items (B and C) are tracked in the Wave-11 plan and don't
block alpha.

**Consequences**:
- Tag `v0.1.0-alpha.1` directly from `master` HEAD.
- The 832 KB main bundle is documented as a known issue in `INSTALL.md`
  ("first load is slow on cellular; subsequent loads are cached").
- Bump `package.json` and `tauri.conf.json` versions to `0.1.0` so the
  installers carry a stable identity.

### Decision 3: Android only on mobile; iOS deferred until Apple Developer enrollment

**Context**: User has no Apple Developer account. Without it, iOS
distribution requires either (a) ad-hoc UDID provisioning per device (max
100 devices, certificates expire annually), or (b) TestFlight which
requires the paid account. Neither fits "ship this weekend." Android
sideload, by contrast, requires only a keystore + the user toggling
"Install unknown apps" once per browser source. Stage-3 research (this
session) confirms Tauri 2.1's `pnpm tauri android build --apk` produces
a signed APK once a keystore is in place.

**Options considered**:
- **A. Android only, defer iOS** — ships now, half the mobile coverage.
- **B. Block on Apple enrollment** — costs $99 + ~24 hours review time; pushes alpha out by a week.
- **C. Ad-hoc iOS provisioning for known testers** — maintainable for ≤ 100 testers; requires collecting each tester's UDID by hand. High friction.

**Decision**: Option A. The wiki's
[assess-r1 § Tauri 2 mobile production status](../../assess-fGw-2026-05-20.md)
flagged this exact gap: TestFlight readiness was an open question. The
honest answer for *this* alpha is "we don't have the account yet." iOS
ships in beta once enrollment lands.

**Consequences**:
- `INSTALL.md` has Android + web + desktop sections; iOS is a "coming
  soon" line.
- The Tauri iOS project at `src-tauri/gen/apple/` stays in the repo
  (its presence is verified by `pnpm tauri ios build` succeeding) but
  isn't shipped.
- Apple Developer enrollment is captured as an Open Question for the
  next plan.

### Decision 4: Unsigned macOS + Windows installers, with explicit install-instructions

**Context**: Code-signing macOS and Windows installers requires paid
certificates ($99/yr Apple, $200–500/yr Windows code-signing CA).
Neither is procured. Without them, macOS Gatekeeper says "cannot be
opened because Apple cannot check it for malicious software" and
Windows SmartScreen says "Windows protected your PC." Both are
dismissible by the user with a 2–3 click override.

**Options considered**:
- **A. Ship unsigned with an `INSTALL.md` workaround section** — works today.
- **B. Procure Apple Developer cert + EV Code Signing cert** — $300–600/yr; weeks of identity verification for EV. Out of scope.
- **C. Ship desktop only via web (PWA install)** — web-app-as-desktop. Already free via the SPA; covers macOS + Windows + Linux. But loses the Tauri-native plugins (notification, sql, stronghold) on the desktop.

**Decision**: Option A. The chapter audience can follow 3-step install
instructions; the alpha purpose is to find bugs in the *app*, not in
the installation process. We document the override clicks.

**Consequences**:
- macOS users see the Gatekeeper dialog → System Settings → "Open Anyway"
- Windows users see SmartScreen → "More info" → "Run anyway"
- Linux .AppImage just runs after `chmod +x`, no warnings
- `INSTALL.md` shows screenshots of each override flow

### Decision 5: Version `0.1.0` (not `0.0.1`); pre-release tag `alpha.1`

**Context**: `package.json` and `tauri.conf.json` currently report
`0.0.1`. Semver convention for alphas: `<major>.<minor>.<patch>-alpha.<n>`.
The wiki has nothing to say here — pure platform convention.

**Decision**: Bump to `0.1.0` and tag `v0.1.0-alpha.1`. `0.0.x` reads
as "scaffolding / pre-real-code"; `0.1.0` reads as "first alpha milestone."

**Consequences**:
- Two-line edit to `package.json` and `tauri.conf.json`.
- All built artifacts carry `0.1.0-alpha.1` in their filenames.
- Subsequent alpha rounds increment to `alpha.2`, `alpha.3`, etc. Beta is `0.1.0-beta.1` or `0.2.0`.

## Implementation Phases

### Phase 1: Pre-flight (estimated effort: 30 min)

**Goal**: Lock the version, the subdomain, and confirm GitHub remote is in sync.

**Tasks**:
- [x] Pick subdomain: **`fgw.virginiafreedom.tech`** (pinned 2026-05-22; names the project explicitly so `app.*` stays free for future siblings). The SPA itself is host-agnostic — `vite.config.ts`'s `base` stays at the default `/` since this is a subdomain root, not a subpath. Pin lives in nginx (Phase 2) and `INSTALL.md` (Phase 5).
- [ ] Bump `package.json` `version` from `0.0.1` to `0.1.0`.
- [ ] Bump `src-tauri/tauri.conf.json` `version` from `0.0.1` to `0.1.0`.
- [ ] `pnpm install` to update `pnpm-lock.yaml` if version bumps cascade (they shouldn't, but verify).
- [ ] Run `pnpm tsc --noEmit && pnpm vitest run` — confirm 287/287.
- [ ] `git status` clean, `git push` to confirm GitHub `master` is at `efbe7aa`.

**Dependencies**: None.

**Validation**: `pnpm vitest run` reports 287/287; `package.json` and
`tauri.conf.json` both show `0.1.0`; `git log origin/master -1` shows
the version-bump commit.

**Wiki grounding**: SPEC § V7 cross-platform-build acceptance criterion.

### Phase 2: Web build + nginx subdomain (estimated effort: 1–2 hr)

**Goal**: `https://fgw.virginiafreedom.tech` serves the SPA pointed at
`wss://chat.virginiafreedom.tech`.

**Tasks**:
- [ ] `pnpm vite build` produces `dist/`. Verify by serving locally with `pnpm vite preview` and walking through onboarding → invite → publish a listing.
- [ ] On the server: provision the subdomain DNS A/AAAA record (chapter operator action).
- [ ] On the server: nginx (or Caddy) `server` block for `fgw.virginiafreedom.tech` with TLS via Let's Encrypt + fallback to `index.html` for SPA hash routes (the app uses `<HashRouter>` so all routes resolve to `/index.html`).
- [ ] On the server: `rsync dist/ root@server:/var/www/fgw.virginiafreedom.tech/` (or equivalent).
- [ ] Verify CORS / CSP — `tauri.conf.json` has `security.csp = null` (no in-app CSP); the web build's CSP comes from the nginx config. Default headers should permit `wss://chat.virginiafreedom.tech`. Test a publish from the browser; the relay's NIP-86 + NIP-42 should both work cross-origin.
- [ ] Smoke: load `https://fgw.virginiafreedom.tech` on a phone browser and a desktop browser; complete onboarding with a test nsec; verify the membership poller fires (Network tab shows `POST https://chat.virginiafreedom.tech/` with `application/nostr+json+rpc`).

**Dependencies**: Phase 1.

**Validation**: Two real browsers (phone + desktop) successfully load
the SPA, the user can paste an nsec, become signed-in, and see the
membership poller fetch `listallowedpubkeys` against the chapter relay.

**Wiki grounding**:
[pyramid-relay-api.md § NIP-86 reference impl](../../../wiki/references/pyramid-relay-api.md)
plus the Wave 10 SPEC-049 commit landing the verified NIP-86 client.

### Phase 3: Desktop installers — macOS, Windows, Linux (estimated effort: 1 hr)

**Goal**: `pnpm tauri build` produces installers for the platform you're
on. Run on macOS for `.dmg`, on Windows for `.msi`, on Linux for
`.AppImage`/`.deb`. Each artifact uploaded to the same server.

**Tasks**:
- [ ] On macOS: `pnpm tauri build` → produces `src-tauri/target/release/bundle/dmg/Compost Marketplace_0.1.0_x64.dmg` (and an `aarch64.dmg` for Apple Silicon — check the bundle config; if not, run with `--target aarch64-apple-darwin` and `--target x86_64-apple-darwin`).
- [ ] On Windows (via local VM, Parallels, or a separate machine): `pnpm tauri build` → `Compost Marketplace_0.1.0_x64-setup.msi`.
- [ ] On Linux (or via WSL/VM): `pnpm tauri build` → `compost-marketplace_0.1.0_amd64.AppImage` and `compost-marketplace_0.1.0_amd64.deb`.
- [ ] Test each: install on the host, launch, complete onboarding, publish one listing. Confirm Tauri plugins work (notification fires, stronghold reads/writes, sql cache hits).
- [ ] `rsync` artifacts to the server: `/var/www/fgw.virginiafreedom.tech/downloads/`.

**Dependencies**: Phase 1, Phase 2 (so the web build is up — desktop
builds default-connect to the same chapter relay, but having the web
URL canonical first is cleaner).

**Validation**: Three downloads (`.dmg`, `.msi`, `.AppImage`/`.deb`)
each install and complete onboarding through publish-a-listing on a
fresh user account.

**Wiki grounding**: SPEC § V7. The wiki has no compiled article on
desktop bundling — pure Tauri convention.

**Risks / mitigations**:
- **macOS Gatekeeper**: unsigned `.dmg` triggers "cannot be opened" on first launch. Documented in `INSTALL.md` (System Settings → Privacy & Security → "Open Anyway").
- **Windows SmartScreen**: similar. Documented in `INSTALL.md`.
- **Cross-compilation**: Tauri does not robustly cross-compile across all OS pairs. Plan assumes the user has access to one machine of each OS family, or accepts shipping only the platforms they can build natively. Linux is least-friction (any Linux box; even GitHub Actions free tier works).

### Phase 4: Android keystore + APK (estimated effort: 1.5–2 hr)

**Goal**: A signed `app-universal-release.apk` hosted at
`https://fgw.virginiafreedom.tech/downloads/fgw-0.1.0-alpha.1.apk`.

**Tasks**:
- [ ] **Generate a keystore** (one-time; back this up offsite *immediately*; if lost, future Android updates cannot be published with the same package ID):
   ```
   keytool -genkey -v -keystore ~/secrets/fgw-android.keystore \
     -alias fgw -keyalg RSA -keysize 4096 -validity 25000
   ```
   The 25,000-day validity is conventional for Android release signing.
- [ ] Create `src-tauri/gen/android/keystore.properties` with:
   ```
   password=<keystore-password>
   keyAlias=fgw
   storeFile=/Users/garykrause/secrets/fgw-android.keystore
   ```
   (`.gitignore` already covers `src-tauri/gen/`; the file does not commit.)
- [ ] Edit `src-tauri/gen/android/app/build.gradle.kts` (or `.gradle`) to add the `signingConfigs.release` block referencing `keystore.properties`. Tauri's mobile init scaffolds this; verify it's present and pointing at the right path.
- [ ] `pnpm tauri android build --apk` produces a signed APK at
  `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`.
- [ ] Test: `adb install -r app-universal-release.apk` on a real Android device. Open the app, complete onboarding, paste a test nsec, publish one listing.
- [ ] Verify Tauri plugins on Android: notification permission prompt, barcode-scanner camera permission (this is what SPEC-035 wired with the iOS Info.plist merge file — Android has its own manifest entries; `pnpm tauri android build` should produce the right manifest, but verify the camera permission prompt actually fires when the user taps "Scan QR" in the NIP-46 pairing flow).
- [ ] Rename to `fgw-0.1.0-alpha.1.apk` and `rsync` to the server alongside the desktop installers.

**Dependencies**: Phase 1.

**Validation**: APK installs on a fresh stock Android device, onboarding
completes, one listing published, NIP-46 QR-scan flow opens the camera.

**Wiki grounding**: SPEC-035 commit (`cd90988`) added
`NSCameraUsageDescription` for iOS via `Info.ios.plist`. The Android
equivalent (`<uses-permission android:name="android.permission.CAMERA"/>`)
is added by Tauri's barcode-scanner plugin scaffold automatically; this
is one of the bits the wiki flagged as "Tauri 2 mobile production
status — needs verification" in
[assess-r1 § Research Gaps](../../assess-fGw-2026-05-20.md).
This phase is partly closing that wiki gap.

**Risks / mitigations**:
- **Keystore loss**: Document offsite backup. If lost, the next major
  release ships under a *different* package ID and existing installs
  cannot be upgraded in-place.
- **Sideload UX**: Android 14+ requires the user to enable "Install
  unknown apps" per source app (e.g., Chrome) before tapping the APK,
  plus dismiss a Play Protect warning. `INSTALL.md` documents this in
  4 numbered steps with the path through Settings.
- **Tauri Android plugin breakage**: assess-r1 flagged uncertainty
  about Tauri 2 mobile maturity. If `notification`, `sql`,
  `stronghold`, or `barcode-scanner` fails on the test device, plan
  has us file a follow-up SPEC for the broken plugin and ship the
  alpha *without that feature gate hard*. Document the failure mode
  in `INSTALL.md` "Known issues."

### Phase 5: INSTALL.md + landing page (estimated effort: 1 hr)

**Goal**: Anyone receiving the alpha invite can install the app on
their platform of choice with no Slack-level support.

**Tasks**:
- [ ] Write `INSTALL.md` at repo root with sections:
   1. **Web** — "open https://fgw.virginiafreedom.tech in a recent browser"
   2. **Android** — 4-step sideload: download, enable unknown sources, install, allow notifications.
   3. **macOS** — download .dmg, drag to Applications, first-launch Gatekeeper override.
   4. **Windows** — download .msi, run, SmartScreen "More info → Run anyway."
   5. **Linux** — `chmod +x *.AppImage && ./*.AppImage`, or `dpkg -i *.deb`.
   6. **iOS** — "coming in beta when we get an Apple Developer account."
- [ ] Optional: a tiny `index.html` landing on `fgw.virginiafreedom.tech/install`
  (or `/`) with download buttons. Could also live as a single page in
  the SPA itself (`/install` route) so testers always land on something.
- [ ] Both link to the GitHub repo
  (`https://github.com/average-gary/fGw`) for source.
- [ ] Both name the maintainer (Ethan Tuttle, per Wave 10 docs commit).

**Dependencies**: Phases 2–4 (need the artifacts to point to).

**Validation**: A non-technical chapter member can follow the
instructions and install on any of the four supported platforms.

**Wiki grounding**: Wave 10 docs commit (`9feb6ec`) — the maintainer
name is already in `README.md`. `INSTALL.md` extends it with platform
coverage.

### Phase 6: Tag, push, distribute (estimated effort: 30 min)

**Goal**: `v0.1.0-alpha.1` exists on GitHub. Chapter testers receive a
DM (or Slack message) with the install URL.

**Tasks**:
- [ ] `git tag -a v0.1.0-alpha.1 -m "First alpha bundle: web + Android + desktop"` from current `master`.
- [ ] `git push origin v0.1.0-alpha.1` so GitHub shows the tag in the
  releases sidebar.
- [ ] Optional: `gh release create v0.1.0-alpha.1 --notes "..."` to make
  the tag a proper release on GitHub. **Don't** upload installers as
  GitHub release assets — those live on the chapter server per
  Decision 1.
- [ ] Notify the chapter: NIP-17 DM or in-person mention to Gini and
  the 5–10 testers, pointing them at `https://fgw.virginiafreedom.tech`
  and the install instructions.
- [ ] **Pre-allowlist** each tester's npub on Pyramid before they try to
  publish (per [pyramid-relay-api.md](../../../wiki/references/pyramid-relay-api.md)).
  Otherwise their first publish hits `auth-required:` and bounces them
  to the request-invite flow, which is a known UX rough edge but
  *acceptable for alpha*. Pre-allowlisting just makes the first-impression
  smoother.

**Dependencies**: Phases 1–5.

**Validation**: Tag visible on https://github.com/average-gary/fGw/tags;
at least one tester reports successful install + first-listing publish.

**Wiki grounding**:
[pyramid-relay-api.md § Auth model](../../../wiki/references/pyramid-relay-api.md)
on the cookie-session vs NIP-86 invite flow.

## Risks & Mitigations

| Risk | Source | Mitigation |
|---|---|---|
| Web origin → relay cookie sharing breaks NIP-42 AUTH | [pyramid-relay-api.md § Auth model](../../../wiki/references/pyramid-relay-api.md) | The web SPA at `fgw.virginiafreedom.tech` and the relay at `chat.virginiafreedom.tech` are different subdomains. Cookies are scoped per-subdomain; AUTH cookie won't share. **However** the post-Wave-10 client uses NIP-86 (HTTP+NIP-98, not cookie session) for admin actions, and NIP-42 AUTH happens on the WebSocket — cookieless. So the cross-origin concern reduces to: does the relay accept NIP-42 AUTH from a browser whose origin isn't `chat.virginiafreedom.tech`? Per the spec it should; verify with the smoke test in Phase 2. |
| Android keystore lost | Stage-3 gap research | Back up `~/secrets/fgw-android.keystore` to two offsite locations (encrypted) immediately on creation. Phase 4 task list captures this. |
| macOS / Windows install warnings drive testers off | Stage-3 gap research | `INSTALL.md` walks through the override clicks with screenshots. Audience is friendly chapter members, not strangers. |
| 832 KB main bundle slow on cellular | [assess-r1 § Bundle code-splitting (B3)](../../assess-fGw-2026-05-20.md) | Acceptable for alpha; `INSTALL.md` notes "first load may take a few seconds." Bundle-splitting tracked as Wave-11 SPEC-058 candidate. |
| Tauri Android plugin breakage on real devices | [assess-r1 § Tauri 2 mobile production status](../../assess-fGw-2026-05-20.md) | Test on at least 2 stock Android devices in Phase 4. If a plugin breaks, document in `INSTALL.md` "Known issues" and file a follow-up SPEC. Don't block the alpha. |
| Pyramid relay outage during alpha install window | [pyramid-in-fgw.md § Known limitations](../../../wiki/topics/pyramid-in-fgw.md) (mmmm.lock crash recovery) | Have the systemd `ExecStartPre=rm` workaround ready on the server. Document it in the chapter ops runbook (separate doc, future plan). |
| Apple Foundation cert costs ($99/yr) plus 24-hour review delay | Stage-3 gap research | Out of scope. iOS deferred to beta. Captured as Open Question. |
| empty-store cold start (Failure-mode #1) | [assess-r1 § Failure Modes](../../assess-fGw-2026-05-20.md) | User chose to ship as-is. Mitigation deferred — chapter-seeding plan is a separate effort and can land before invites scale beyond the first 10. |

## Open Questions

The plan can ship without resolving these:

1. **Apple Developer enrollment timeline**: when does Apple cert procurement happen? iOS distribution waits on it. Decide before tagging beta.
2. **Code-signing for desktop**: $300–600/yr for macOS Notarization + Windows EV cert. Probably worth it before public beta; not needed for chapter alpha.
3. **Chapter-seeding plan**: 5–10 real listings before public invites. Not needed for known-tester alpha; needed before the chapter advertises to broader Powder Keg circle.
4. **Crash + telemetry**: still no Sentry-equivalent. Alpha runs blind on crashes. The user said "ship as-is" but a follow-up plan should evaluate Sentry vs. local-only crash log on the next round.
5. **Update mechanism**: Tauri's auto-updater is configurable but not wired. Alpha testers will have to re-download manually for `alpha.2`. Acceptable for ≤ 10 testers; add Tauri updater for beta.

## Sources Consulted

10 wiki sources + 1 Stage-3 gap session.

**Decision-shaping**:
- [assess-fGw-2026-05-20.md](../../assess-fGw-2026-05-20.md) — Tauri 2 mobile gap and bundle-size context for Decisions 2, 3, and the risk table.
- [assess-fGw-2026-05-20-r2.md](../../assess-fGw-2026-05-20-r2.md) — README maintainer + "we will never" framing for Phase 5.
- [pyramid-relay-api.md](../../../wiki/references/pyramid-relay-api.md) — NIP-86 + NIP-42 transport details for Phase 2 cross-origin smoke.
- [pyramid-in-fgw.md](../../../wiki/topics/pyramid-in-fgw.md) — chapter-sovereignty principle for Decision 1; ops risks for the risk table.

**Spec/source-of-truth grounding**:
- [raw/notes/spec.md](../../../raw/notes/spec.md) — V7 cross-platform-build acceptance criterion verbatim.
- [raw/data/commit-history.md](../../../raw/data/commit-history.md) — confirms current shipping state at Wave 9 (assess generated then; live state is Wave 10 / commit `efbe7aa`).

**Stage-3 gap research** (this session): Tauri 2.1 Android signing
mechanics + sideload UX on stock Android 14+ + macOS/Windows
unsigned-installer override paths. Gaps too small for full
`/wiki:research`; surfaced in plan body and risk table.
