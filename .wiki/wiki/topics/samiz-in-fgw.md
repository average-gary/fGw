---
title: "samiz in fGw — synthesis, head-to-head with bitchat, alternatives"
type: topic
confidence: high
status: stable
sources:
  - ../../raw/repos/2026-06-09-samiz-main-repo.md
  - ../../raw/repos/2026-06-09-citrine-android-relay.md
  - ../../raw/papers/2026-06-09-samiz-readme.md
  - ../../raw/papers/2026-06-09-samiz-bluetoothble-source.md
  - ../../raw/papers/2026-06-09-samiz-reconciliation-source.md
  - ../../raw/papers/2026-06-09-samiz-nostrclient-source.md
  - ../../raw/papers/2026-06-09-samiz-android-manifest.md
  - ../../raw/papers/2026-06-09-nip-77-negentropy.md
  - ../../raw/articles/2026-06-09-samiz-issue-17-fiatjaf-nip70-leak.md
created: 2026-06-09
updated: 2026-06-09
tags: [samiz, fgw, mesh, nostr, citrine, bitchat-comparison, alternatives, density-paradox]
---

# samiz in fGw — synthesis

Companion to [samiz-as-fgw-networking-stack.md](../theses/samiz-as-fgw-networking-stack.md). This article synthesizes the 8-agent research into the verdict that thesis renders.

## The thesis

> "samiz (https://github.com/KoalaSat/samiz) would be a great networking stack to add to fGw."

## The short answer

**Mostly false.** samiz is *philosophically more aligned* with fGw than bitchat — Nostr-native end-to-end, no separate per-user identity key, MIT-licensed — but is structurally more expensive at every integration tier, dormant for ~10 months, alpha-only with ~775 lifetime APK installs, and dependent on a second-app (Citrine) that fGw cannot ship as one binary. The same density paradox that contradicted the bitchat thesis applies here, plus extra penalties (no library shape, hidden Citrine dependency, ~1/333 the mindshare of bitchat).

## Head-to-head: samiz vs bitchat for fGw

| Dimension | samiz | bitchat |
|---|---|---|
| **Architecture fit** | ✅ Nostr-native end-to-end (signed events stay signed) | ⚠️ BLE-first chat protocol with NIP-17 fallback |
| **Identity model** | ✅ Reuses user's Nostr nsec via local relay; no third key | ❌ Separate Curve25519 + Ed25519 Noise keys |
| **License** | ✅ MIT (samiz) + MIT (Citrine) | ⚠️ Unlicense (iOS) + GPL-3.0 (Android port) |
| **Mindshare / project state** | ❌ 78 stars, 10mo dormant, single author, alpha | ✅ 26k stars, active 2026 commits, multi-platform |
| **Library shape** | ❌ Standalone Application + hidden Citrine dep | ⚠️ Standalone Apps, but Nostr-fallback usable without BLE |
| **Cheap integration path** | ❌ None — all 3 paths require BLE + foreground service | ✅ Path A (Nostr-tunneled, ~2–4 weeks, no BLE) |
| **Tauri 2 integration cost** | 1–2w (Path A 3-app) / 3–6mo (Path B fork) / 4–6mo (Path C Rust) | 2–4w (Path A) / 3–6mo (Path B native BLE) |
| **Web target** | ❌ | ⚠️ Path A only (no BLE on web) |
| **Desktop target** | ❌ | ⚠️ Path A only |
| **iOS target** | ❌ Android-only project | ⚠️ iOS reference exists; fGw blocked by Apple Dev account |
| **Audit / security review** | None published | Trail of Bits + Radocea (broke v1, fixed via Noise XX) |
| **Field deployment** | ~775 APK installs lifetime | ~360k cumulative downloads (Madagascar, Nepal, Iran) |
| **Community signal** | fiatjaf flagged NIP-70 leak (issue #17) | Dorsey admitted no security review; CVSS 9.8 in parser |
| **Pyramid AUTH bypass** | ❌ Same problem (BLE bypasses NIP-42) | ❌ Same problem |
| **Density paradox** | ❌ Same problem | ❌ Same problem |

**Net**: samiz wins **architectural fit + license + identity model**; bitchat wins **mindshare + maturity + cheap-path availability**. For fGw's concrete situation, bitchat's Path A (Nostr-tunneled DM interop, weeks of work, no BLE) is the only "cheap optional feature" available in either thesis. samiz has no equivalent shortcut — all samiz paths involve BLE, foreground service, and Android-only deployment.

## The density paradox (carries from bitchat)

Same finding, identical reasoning:

- Powder Keg WV: ~100-member chapter ceiling, ~5–30 attendees per pile-build event
- Hardy County density: 24.6 people/sq mi
- Mesh-eligible moments per year: **~60 device-pairs across all chapter events**

samiz inherits BLE physics. The protocol can be elegant; the radio window can't change. With the bitchat literature establishing this paradox, samiz doesn't get a free pass.

## What samiz gets RIGHT (the supporting case worth preserving)

1. **Nostr-native sync algorithm**: samiz uses Negentropy (NIP-77, Doug Hoyte) — the same primitive strfry, nostr.wine, and nostrdb use for relay sync. Production-proven. Bandwidth proportional to set difference.

2. **Signature preservation end-to-end**: `["EVENT", subId, eventJson]` carries full untouched Nostr event JSON. fGw's signed events stay signed, valid, and re-publishable to Pyramid downstream.

3. **No third per-user key**: samiz never sees an nsec; the user's Nostr client signs; samiz only relays. BLE pairing UUID is per-install random and decoupled from Nostr identity. **Cleanest dimension over bitchat**.

4. **MIT license**: clean for both samiz and Citrine. Path B (fork + JNI) and Path C (Rust port) are license-clean.

5. **Use Case C (satellite backhaul) maps to Powder Keg**: collector → publisher pattern is a real-world fit if anyone in the chapter has satellite connectivity.

6. **`rust-negentropy` exists** ([yukibtc/rust-negentropy](https://github.com/yukibtc/rust-negentropy)) — a Rust port of samiz's wire protocol does NOT have to reimplement the hard sync math.

## What samiz gets WRONG (the opposing case)

### Project-health red flags

- **78 stars, 1 fork, 1 maintainer** — bus factor 1
- **Last push 2025-08-11** (~10 months dormant)
- **Perpetual alpha** — never crossed v0.1.0 in lifetime
- **Maintainer's own next-step PR (#22 "Raspberry Pi app")** sitting unmerged for 10 months
- **~775 lifetime APK downloads** across all releases — likely <300 active devices ever
- **NOT on F-Droid** — no reproducible-build verification; `usesCleartextTraffic="true"` for the Citrine localhost connection
- **Single fork is also dormant** since April 2025
- **Crash on Pixel 9 / GrapheneOS / Android 15** in v0.0.5 (issue #14) — basic Android-12 runtime-permission bug shipped to users
- **fiatjaf-flagged NIP-70 leak** (issue #17) — Nostr's creator publicly identified that samiz's interaction with Citrine breaks NIP-70 distribution scoping; fix prototype labeled "not too good"; not shipped

### Architectural blockers

- **Standalone Android Application class** — fGw cannot import samiz; only Path B (fork) or Path C (rewrite) avoid the three-app problem
- **Citrine is a hidden third dependency** — samiz hard-codes `ws://127.0.0.1:4869`; without Citrine running, samiz crashes
- **No iOS / no desktop / no web** — Android-only by design and by host-platform constraints (Web Bluetooth has no peripheral mode; `btleplug` is central-only)
- **`FOREGROUND_SERVICE_SPECIAL_USE`** — Google Play policy review required for the publisher (fGw)
- **Two `Application` classes cannot coexist** in one APK — Tauri 2 owns its own Application; samiz owns its own — collision

### Threat model gaps

- **Pyramid AUTH bypass at the BLE edge** — non-members with Nostr keypairs can inject signed events into the local mesh; fGw renders them before any Pyramid filter runs. Not a samiz bug; structural mismatch between BLE peer-to-peer and relay-edge-AUTH models.
- **NIP-70 leak (fiatjaf #17)** — samiz republishes ALL events from Citrine to BLE peers without checking NIP-70 protection tags. fGw marketplace listings carrying private location/contact info would leak.
- **No event acceptance filter** — any well-formed signed event is accepted from any peer
- **No rate limit, no DoS budget, no eclipse-attack mitigation** — samiz README and SECURITY.md are silent
- **Cold-boot amnesia** — `db.applicationDao().deleteAll()` on every service start; samiz is real-time gossip, not a durable store-and-forward

## Better-fitting alternatives (unchanged from bitchat thesis)

The recommended alternatives from the bitchat thesis apply identically here, plus one new option:

### 1. NDK outbox-queue layer (~1 week of engineering)

Persistent unsent-event queue + retry on reconnect. Delivers ~80% of offline value with zero new permissions/transports/keys. Works on web/desktop/Android/iOS uniformly.

### 2. Chapter-steward strfry-on-Pi at events ($35 hardware)

Nostr-native LAN at planned events; negentropy gives clean catch-up; every existing fGw client already speaks Nostr. Cross-platform on the client side, uses negentropy to sync to Pyramid when uplink returns. Cheaper than 3-app stack on every phone.

### 3. **Citrine alone** (new — surfaced by samiz research)

Without samiz, Citrine still solves a fraction of fGw's offline story:
- Steward brings phone with Citrine running on event-day Wi-Fi hotspot
- All fGw clients on the LAN add `ws://<steward-ip>:4869` as a relay
- Events propagate via Citrine while everyone's on the hotspot
- Citrine flushes to Pyramid when uplink returns

This is **Nostr-native, cross-platform, no BLE, no foreground-service-on-every-phone, no 3-app stack**. It's a subset of strfry-on-Pi pattern with even less hardware. **Citrine is actively maintained** (last push 2026-06-03; v2.0.0 in March 2026); samiz is not.

### 4. Reticulum Network Stack — same as bitchat thesis (out of scope for current fGw needs)

## Hardy County coverage caveat (refines offline-base-rate)

HardyNet fiber covers ~98.1% of Mathias up to 1 Gbps. The "rural therefore offline" frame is partially false — homes and many fixed venues likely have fiber. The genuine offline scenario is "outdoors on a build site away from a structure" or "specific carrier dead zone." A venue Pi+strfry on the host's HardyNet uplink covers most events, narrowing samiz's win condition further.

## Where the thesis IS partially true (the narrow window)

samiz wins exclusively when ALL of these hold:

- ad-hoc / unplanned gathering (no time to set up Pi/Citrine ahead)
- outdoors away from any uplinkable structure (HardyNet fiber unavailable)
- ≥2 fGw users on Android specifically (no iOS, no web, no desktop)
- foreground service running on each phone (notification not dismissed)
- Citrine installed separately on each phone (or Path B/C done by fGw)
- battery acceptable (10–20%/hr drain)
- bad-actor density at the event is zero (no Pyramid AUTH at BLE edge)
- threat model accepts plaintext NIP-99 over the radio
- threat model accepts the NIP-70 leak fiatjaf flagged

That's a narrow product-of-conditionals.

## Recommended decision

1. **Do not adopt samiz as a networking stack.** The thesis is rejected on the same grounds as bitchat (density paradox, Android-only, foreground-service UX), plus additional penalties (no library shape, hidden Citrine dep, dormant project, NIP-70 leak, Pyramid AUTH bypass, ~775 lifetime users).

2. **Worth studying as reference**: samiz's Negentropy-over-BLE design is sound prior art. If fGw ever needs Nostr-over-mesh, the Path C Rust port using `rust-negentropy` is the architecturally clean approach — but invest only after density math justifies it.

3. **If pursuing offline at all, prefer Citrine alone (without samiz)** at planned events. Citrine is actively maintained, MIT, Nostr-native, and obviates samiz for fixed-venue use cases.

4. **The bitchat thesis recommendations remain dominant**: NDK outbox-queue (1 week) + strfry-on-Pi at events ($35) deliver more offline value than any samiz path, with cross-platform reach and no new permissions.

5. **Re-evaluate annually** — if samiz revives, gets an audit, ships a library AAR, lands the NIP-70 fix, and gets non-trivial adoption, revisit.

## Cross-references

- Reference: [samiz-protocol.md](../references/samiz-protocol.md)
- Concept: [samiz-integration-paths.md](../concepts/samiz-integration-paths.md)
- Thesis (verdict): [samiz-as-fgw-networking-stack.md](../theses/samiz-as-fgw-networking-stack.md)
- Bitchat counterpart for comparison: [bitchat-in-fgw.md](bitchat-in-fgw.md), [bitchat-integration-paths.md](../concepts/bitchat-integration-paths.md), [bitchat-protocol.md](../references/bitchat-protocol.md)
- Existing networking: [pyramid-in-fgw.md](pyramid-in-fgw.md)
- Membership model bitchat AND samiz both bypass: [pyramid-invite-tree-semantics.md](../concepts/pyramid-invite-tree-semantics.md)
