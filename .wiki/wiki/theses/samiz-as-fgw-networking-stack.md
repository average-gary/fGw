---
title: "Thesis: samiz (KoalaSat/samiz) would be a great networking stack to add to fGw"
type: thesis
status: completed
created: 2026-06-09
updated: 2026-06-09
verdict: contradicted
confidence: high
core_claim: "Adding samiz — KoalaSat's 'BLE mesh for nostr notes when the internet is down' Android Kotlin app — as a networking stack to fGw would meaningfully improve offline reach, resilience, or UX for the Powder Keg WV compost-marketplace use case beyond Nostr-over-Pyramid alone, AND beat bitchat as the BLE-mesh option for fGw because samiz is Nostr-native by design."
key_variables:
  - samiz design (BLE mesh shape, NIP support, signing, gossip, dedup, store-and-forward semantics)
  - samiz maturity (~78 stars, last push 2025-08-11, single-author, license)
  - samiz integration shape (standalone Android app vs library vs spec/protocol)
  - fGw networking surface (Nostr-only via Pyramid relay; Tauri 2 web/desktop/Android)
  - Powder Keg WV context (rural, sub-100-member, in-person pile-build events)
  - Pyramid AUTH membership model (samiz mesh would bypass it)
falsification: |
  Any of: (a) samiz is unmaintained/alpha/abandoned (Aug 2025 last push is concerning); (b) Android-only standalone app, not consumable as a library; (c) license forces fGw into IPC, clean-room reimplementation, or contagion; (d) mesh shape doesn't carry NIP-99/52/32 broadcast events well; (e) Powder Keg's density still kills the use case; (f) Pyramid AUTH bypass irreconcilable; (g) NDK outbox-queue + strfry-on-Pi dominate it for this use case.
related_thesis: bitchat-as-fgw-networking-stack.md
tags: [networking, mesh, samiz, koalasat, ble, nostr, fgw, alternatives, offline, citrine, negentropy]
---

# Thesis: samiz would be a great networking stack to add to fGw

## Core Claim

samiz ([KoalaSat/samiz](https://github.com/KoalaSat/samiz)) — "BLE mesh for nostr notes when the internet is down" — is a Nostr-native BLE mesh app. This thesis tests whether adopting it would materially improve fGw's offline story for Powder Keg WV pile-build events, AND whether it beats bitchat for that purpose given samiz carries signed Nostr events natively without bitchat's cross-protocol gymnastics.

## Key Variables

- **samiz architecture**: Negentropy set-reconciliation over BLE GATT; preserves signed Nostr events end-to-end via local-relay bridging
- **samiz project state**: 78 stars, last push **2025-08-11** (~10 months dormant), Kotlin Android-only, single author, alpha-only, ~775 lifetime APK downloads, MIT
- **Integration shape**: standalone Android Activity-based app, NOT a library; hard-coded dependency on Citrine running at `ws://127.0.0.1:4869`
- **fGw networking surface**: today Nostr-only via Pyramid relay, Tauri 2 web+desktop+Android
- **Powder Keg context**: same density paradox as bitchat; ~5–30 attendees per event, ~100 ceiling, rural WV, ~98% HardyNet fiber coverage at fixed structures
- **Pyramid AUTH bypass**: samiz mesh delivers signed events; non-members can inject events into the local mesh

## Testable Prediction

Two fGw users meeting at a pile-build with no cell signal can: (1) sign a Nostr event natively, (2) publish to a samiz BLE mesh, (3) the event hops through nearby samiz nodes, (4) the first device that returns to internet flushes the queued events to the Pyramid relay (after passing NIP-42 AUTH).

## Falsification Criteria

1. **Maintenance**: last push 2025-08-11 + 78 stars + single author = high abandonment risk
2. **Library shape**: samiz is a standalone Android app (Application class), not a library
3. **License contagion**: in this case, MIT — clean
4. **Event shape**: samiz handles arbitrary signed Nostr events including NIP-99/52/32
5. **Density**: same paradox as bitchat — BLE physics doesn't care about protocol semantics
6. **Pyramid bypass**: confirmed — no NIP-42 AUTH at the BLE edge
7. **Better alternatives**: NDK outbox-queue + strfry-on-Pi (or Citrine-alone, surfaced by this research)

## Scope Boundary (skip filter)

OUT of scope:
- Generic BLE / Nostr primers
- Unrelated mesh apps unless they directly inform samiz's design choices
- Bitchat as primary subject (only invoked for head-to-head comparison)
- Other KoalaSat projects (RoboSats, Pokey) unless they share networking code with samiz

## Evidence For

Sorted by evidence strength (strongest first).

### **Strong** — samiz IS Nostr-native end-to-end

- **Source**: samiz README + `BluetoothReconciliation.kt` source code (primary)
- The protocol carries `["EVENT", subId, eventJson]` messages where `eventJson` is full untouched signed Nostr event JSON. Signature preserved end-to-end. Pyramid will accept republished events as native — no bespoke ingest path.
- Use Case C (satellite backhaul) is literally the Powder Keg WV pattern: collect locally, publish later when one device has connectivity.
- Sync algorithm is Negentropy (NIP-77, Doug Hoyte) — same primitive strfry/nostr.wine/nostrdb use for relay-to-relay sync. **Production-proven**.
- See [samiz-protocol.md](../references/samiz-protocol.md).

### **Strong** — Cleanest identity model: no third per-user key

- **Source**: `NostrClient.kt` source code (primary)
- samiz **never sees an nsec**. The user's Nostr client signs; samiz only relays.
- BLE pairing UUID is per-install random, decoupled from Nostr identity.
- No separate Curve25519/Ed25519 Noise key like bitchat requires. fGw users keep their secp256k1 nsec only.
- This is samiz's **single biggest win over bitchat**.

### **Strong** — MIT license + permissive dependencies

- **Source**: GitHub LICENSE files (primary)
- samiz: MIT (Copyright © 2024 KoalaSat)
- Citrine: MIT-equivalent permissive
- All three integration paths (3-app, fork+JNI, Rust port) are license-clean
- vs bitchat-android's GPL-3.0 contagion concern: samiz is materially better here

### **Strong** — `rust-negentropy` exists (Rust port is feasible)

- **Source**: [yukibtc/rust-negentropy](https://github.com/yukibtc/rust-negentropy) (in production use, NIP-77 spec)
- A Tauri-Rust port of samiz's wire protocol does NOT have to reimplement the hard sync math
- Five JSON message types + Negentropy algorithm + standard BLE GATT = a small spec to re-implement

### **Moderate** — Mesh range fits Powder Keg pile-builds

- **Source**: BLE physics (carries from bitchat thesis sources)
- 30–50 m phone-to-phone outdoors LOS; 7-hop cap covers a 5-acre site comfortably
- Range is NOT the binding constraint (same conclusion as bitchat thesis)

### **Moderate** — KoalaSat ecosystem peers actively maintained

- **Source**: greenart7c3/Citrine repo (primary)
- **Citrine** (samiz's hidden third dependency) is **actively maintained** (last push 2026-06-03, v2.0.0 March 2026, 126 stars, 60 releases)
- Maintainer is greenart7c3, an Amethyst contributor — independently trustworthy
- The bus factor on Citrine isn't tied to KoalaSat
- **(Note)**: original thesis framing incorrectly assumed KoalaSat maintained Citrine. Historical agent corrected this.

### **Moderate** — KoalaSat track record

- **Source**: KoalaSat GitHub profile (primary)
- KoalaSat is a credible Nostr-Android contributor (RoboSats, Pokey, Nostros, samiz)
- Pattern: ships single-author utility apps; sometimes mothballs (Nostros archived Feb 2025)
- Adopting samiz isn't betting on a random alpha — it's betting on a known maintainer with a known cadence pattern

### **Weak** — Some real-world deployment evidence

- **Source**: GitHub release download counts (primary)
- ~775 lifetime APK downloads across 7 releases
- Not zero, but tiny — likely <300 active devices ever
- A Powder Keg deployment of ~100 phones would be one of the largest single samiz user pools globally

## Evidence Against

Sorted by evidence strength (strongest first).

### **Strong** — Project is dormant and alpha-only

- **Source**: GitHub API + commit log (primary)
- **Last push 2025-08-11 — ~10 months silent** as of 2026-06-09
- 7 releases all in 2025, perpetual `*-alpha` (v0.0.1 → v0.0.7) — **never crossed v0.1.0 in lifetime**
- 78 stars, 1 fork (also dormant since April 2025), 2 contributors (KoalaSat 111 commits + a 1-commit translation fix)
- **Bus factor 1**
- Maintainer's own next-step PR (#22 "Raspberry Pi app") sitting unmerged for 10 months
- No commits during bitchat's July 2025 surge → samiz didn't respond to obvious mindshare competition

### **Strong** — Standalone Application class blocks Tauri integration

- **Source**: `AndroidManifest.xml` + `build.gradle.kts` (primary)
- samiz declares `<application android:name=".Samiz">` with its own `class Samiz : Application()`
- Tauri 2 Android target also owns `Application`. **Two Application classes cannot coexist in one APK.**
- No AAR target, no Maven publish, no library `plugins { alias(libs.plugins.android.application) }` — it's a `application`, not a `library`
- Tauri 2 mobile plugin docs are silent on hosting foreign Application classes — because Tauri owns the lifecycle
- **Result**: Path A (3-app stack) is the only "no-fork" path; Path B (fork) and Path C (Rust port) are months of work each

### **Strong** — Hidden Citrine dependency = three-app stack per phone

- **Source**: `NostrClient.kt` hard-coded `defaultRelayUrls = ["ws://127.0.0.1:4869"]` (primary)
- samiz crashes its own service if Citrine isn't running (`relayError() { stopService() }`)
- Powder Keg onboarding becomes: fGw + samiz + Citrine = 3 APKs, 3 foreground-service notifications, ~12 runtime permission grants per phone
- UX cliff for a 100-member compost marketplace
- Original thesis framing collapses: "add samiz" is not one integration, it's a multi-app architecture

### **Strong** — Density paradox inherits from bitchat thesis

- **Source**: HN bitchat thread (Marlinski/Rumble dev) + Powder Keg context (already in wiki)
- Same anti-correlation: BLE mesh works in dense urban / festival, fails in rural / sparse
- Powder Keg estimate: **~60 mesh-eligible device-pairs/year** for the entire chapter
- samiz inherits BLE physics without exception; no protocol elegance changes the radio window

### **Strong** — Mobile OS background-radio death inherits

- **Source**: Android Developers FGS docs + Marlinski testimony (carries from bitchat)
- Android 14+ requires `FOREGROUND_SERVICE_SPECIAL_USE` + persistent user-visible notification
- samiz's notification text: "Run a foreground service to check for notes and keep the connection to the relays active" — Google Play policy review required for the publisher
- OEM battery management (Samsung, Xiaomi, Huawei) overrides standard rules

### **Strong** — Pyramid AUTH bypass at the BLE edge

- **Source**: `BluetoothReconciliation.kt` source code + NIP-42 spec (primary)
- samiz has no event acceptance filter beyond JSON parse + Nostr-id dedup
- Any non-member with a Nostr keypair walking past a pile-build can inject signed events
- fGw renders mesh-delivered events before Pyramid filter applies
- fGw must add custom NIP-42 AUTH bridge for flush-to-Pyramid AND allowlist filter at local relay AND UI for distinguishing mesh-delivered events

### **Strong** — fiatjaf-flagged NIP-70 leak (issue #17)

- **Source**: GitHub issue #17 (primary, by Nostr's creator)
- fiatjaf identified that samiz's Citrine interaction breaks NIP-70 distribution scoping
- His fix prototype: patch Citrine to relax NIP-70 for localhost — labeled "not too good"
- Quote: "events could be shared freely via BLE and not escape to the external world"
- Fix is unimplemented; samiz is dormant
- For fGw: marketplace listings (NIP-99) marked NIP-70-protected for chapter-only distribution would leak through the mesh

### **Strong** — Android-only with no path to web/desktop/iOS

- **Source**: Tauri 2 mobile plugin docs + Web Bluetooth spec + btleplug README (primary)
- samiz: 98.3% Kotlin, Android-only by project choice
- Tauri Android: only platform fGw can reach today (alpha-bundle defers iOS pending Apple Dev account)
- Web Bluetooth: central-only, no peripheral mode
- `btleplug` (Rust desktop BLE): central-only
- **Realistic deployment surface for samiz-style mesh in fGw is Android only — a small fraction of fGw's targets**

### **Strong** — Microscopic adoption + no F-Droid

- **Source**: GitHub release download counts + F-Droid search (primary, negative)
- ~775 lifetime APK downloads across all 7 alpha releases (vs bitchat's ~360k)
- Latest release v0.0.7-alpha: 268 downloads
- **Not on F-Droid** — no reproducible-build verification; users get raw GitHub-built APKs
- Powder Keg's privacy-conscious audience leans on F-Droid; this is a step DOWN from fGw's current trust posture

### **Moderate** — Mindshare lost to bitchat

- **Source**: Sonicviz Oct 2025 mesh-comparison + meta agent's negative search (no Stacker News, no Nostriga talks, no podcast interviews surfacing)
- Sonicviz Oct 2025 systematic comparison of mesh systems **omits samiz entirely** while including Bitchat, Meshtastic, OpenMANET, Reticulum
- bitchat repo created July 2025 (during samiz's active phase); samiz didn't ship a v1.0 push to compete
- "BLE mesh for Nostr" mindshare has effectively migrated to bitchat's NIP-17-fallback model

### **Moderate** — Real-world reliability unproven on fGw's persona

- **Source**: GitHub issue #14 (primary)
- Crash on Pixel 9 / GrapheneOS / Android 15 (target SDK 35) in v0.0.5
- Cause: `BluetoothAdapter.ACTION_REQUEST_ENABLE` without holding `BLUETOOTH_CONNECT` runtime permission — basic Android-12-era bug
- Reporter: f321x (well-known privacy-focused Bitcoin/Nostr dev)
- fGw's privacy audience overlaps heavily with GrapheneOS

### **Moderate** — UUID squatting on SIG Battery Service

- **Source**: `BluetoothBle.kt` (primary)
- samiz uses `0000180f-...` — the SIG-assigned 16-bit Battery Service short-form `0x180F` — as its service UUID
- Non-conformant; collides with real battery services on phones
- fGw participating in the existing samiz mesh inherits this issue; fixing it breaks interop with the ~775 existing users

### **Moderate** — Cold-boot amnesia + no store-and-forward window

- **Source**: `BluetoothReconciliation.kt` `db.applicationDao().deleteAll()` on every service start (primary)
- samiz is real-time gossip, not durable store-and-forward
- A freshly-restarted fGw device temporarily forgets its own gossip-history view of the mesh
- Local relay (Citrine) holds longer history, but samiz only sees events arriving during the current service lifetime

### **Moderate** — Coverage trends erode the offline window

- **Source**: WV broadband data (carries from bitchat) + HardyNet ~98% Mathias coverage
- Hardy County / Mathias has ~98.1% HardyNet fiber at fixed structures
- "Rural therefore offline" frame is partially false — homes and many fixed venues have fiber
- The genuine offline window is "outdoors at a pile-build away from any uplinkable structure" — narrower than initially assumed
- Starlink Direct-to-Cell SMS GA July 2025 in WV; data plausibly within 2 years

### **Weak** — Plaintext over-air for non-NIP-17 events

- **Source**: protocol design (primary)
- NIP-17 kind 1059 traverses encrypted (inner payload pre-encrypted)
- NIP-99 listings (kind 30402), NIP-52 events, NIP-32 labels traverse as **plaintext signed JSON** readable by any BLE peer in range
- Marketplace coordinates exposed — fGw must apply NIP-17 wrapping if confidentiality is needed

## Nuances & Caveats

### Nuance — samiz is *philosophically* better than bitchat for fGw

The core architecture decision — Nostr-native end-to-end with full event JSON preservation, no per-user secondary identity key, MIT license, Negentropy-backed sync — is a **better fit for fGw than bitchat's chat-shaped protocol with Nostr fallback**. If fGw were ever going to do BLE mesh, samiz's protocol is the right shape to copy.

### Nuance — but samiz has no cheap integration path equivalent to bitchat's Path A

The bitchat thesis's narrow exception — Path A (Nostr-tunneled bitchat-app DM interop, no BLE, ~2–4 weeks) — exists because bitchat itself ships a Nostr fallback. **samiz has no equivalent**. All three samiz paths require BLE peripheral participation, foreground service, Android-only deployment, and NIP-42 AUTH bridge work. The cheapest samiz path (Path A 3-app stack) costs ~1–2 weeks of fGw code but pushes 2 extra APK installs onto every Powder Keg member's phone.

### Nuance — Citrine alone is a real alternative surfaced by this research

samiz's hard requirement on Citrine led to discovering that **Citrine alone, without samiz, gives a phone-as-LAN-relay model that may obviate samiz for planned events**:

- Steward brings phone with Citrine running on event-day Wi-Fi hotspot
- All fGw clients on the LAN add `ws://<steward-ip>:4869` as a relay
- Events propagate via Citrine; flush to Pyramid on uplink return

This is Nostr-native, cross-platform on the client side, no BLE, no foreground-service-on-every-phone, no 3-app stack. Citrine is actively maintained (last push 2026-06-03). For Powder Keg's planned pile-build pattern, this is a strictly cheaper, more-maintained path than samiz.

### Nuance — Hardy County has more fiber than the offline narrative implies

HardyNet fiber covers ~98.1% of Mathias up to 1 Gbps. The "rural therefore offline" frame is partially false. The actual offline window is outdoor pile-build sites away from uplinkable structures — narrower than samiz's most expansive use case.

### Nuance — Negentropy is the right primitive, regardless of samiz's fate

If fGw ever needs Nostr-over-mesh, **Negentropy via `rust-negentropy` is the architecturally correct choice**, not bitchat's bespoke Bloom-filter dedup over Noise-encrypted opaque payloads. samiz's design choice here is a useful prior-art finding even if samiz itself isn't adopted.

## Verdict

**Status**: Contradicted

**Confidence**: High

**Summary**: samiz is philosophically more aligned with fGw than bitchat — Nostr-native end-to-end, no third per-user key, MIT-licensed, Negentropy-based — but loses on every practical dimension that decides this kind of integration. (1) The project is dormant (~10 months no commits), perpetually alpha, single-author, with ~775 lifetime APK installs. (2) It is a standalone Android Activity-based application, not a library, with its own `Application` class that conflicts with Tauri 2's Android host architecture. (3) It has a hidden hard dependency on Citrine, making the realistic deployment a 3-app stack per phone with ~12 permission grants and 3 persistent notifications. (4) The same density paradox that contradicted the bitchat thesis applies here, plus extra Android-only-by-design penalty (no iOS, no web, no desktop). (5) Pyramid AUTH bypass at the BLE edge AND fiatjaf-flagged NIP-70 leak (issue #17, unfixed) make it a privacy regression for fGw's marketplace use case. (6) Better-fitting alternatives — NDK outbox-queue, strfry-on-Pi, or **Citrine alone (newly surfaced)** — dominate samiz on cost, platform reach, and maintenance.

**Strongest supporting evidence**:
- Negentropy sync algorithm (NIP-77) is the correct primitive — production-proven, with `rust-negentropy` enabling clean Rust port
- Signed Nostr events traverse the mesh untouched; Pyramid would accept republished events as native
- No third per-user identity key (samiz never sees an nsec) — clean ID model vs bitchat's Noise X25519/Ed25519 separation
- MIT license throughout (samiz + Citrine) — license-clean across all integration paths

**Strongest opposing evidence**:
- Project is dormant: 10 months no commits, perpetual alpha, bus factor 1, ~775 lifetime APK installs, single fork also dormant
- Standalone Application class structurally blocks Tauri 2 integration; only fork (3–6mo) or Rust rewrite (4–6mo) avoid the 3-app stack
- Hidden Citrine dependency = 3 APKs + ~12 permissions + 3 notifications per phone (UX cliff)
- Density paradox unchanged from bitchat thesis (~60 mesh-eligible device-pairs/year for entire chapter)
- fiatjaf-flagged NIP-70 leak (issue #17, unfixed) + Pyramid AUTH bypass = privacy regression on fGw's actual threat model
- Sonicviz Oct 2025 systematic comparison **omits samiz entirely**; mindshare migrated to bitchat

**Key caveats**:
- Verdict is on samiz **as a "networking stack to add"** — its protocol design is sound prior art and worth studying
- Citrine alone (without samiz) IS a real alternative for planned events at fixed locations
- Re-evaluate annually if samiz revives, gets an audit, ships a library AAR, fixes the NIP-70 leak, and gets non-trivial adoption
- The thesis's narrow strong reading ("great networking stack") is rejected; a weak reading ("interesting Negentropy-over-BLE prior art for a future fGw initiative") is supported

**What would change this verdict**:
- samiz revives with a v1.0 release, library AAR target, and fixed NIP-70 enforcement
- A maintained `samiz-rs` or equivalent Tauri 2 plugin emerges with desktop + iOS coverage
- An independent security audit clears the BLE protocol + parser
- Powder Keg empirical event data shows ≥monthly events with ≥10 Android attendees AND no LTE AND no Wi-Fi alternative
- bitchat's Nostr-fallback path (v1.3.0+) is shown to interop with samiz's Nostr-native path through public relays — would obsolete the choice

**Suggested follow-up theses** (derived from this research):

1. *"Citrine alone (a chapter steward's phone running greenart7c3/Citrine on a Wi-Fi hotspot) is the cheapest Nostr-native offline pattern for Powder Keg pile-builds — strictly dominating samiz, strfry-on-Pi, AND bitchat for planned events."* — testable; corollary of this research
2. *"NIP-77 Negentropy via `rust-negentropy` is the correct sync primitive for any future fGw mesh effort, regardless of transport (BLE / LoRa / Reticulum)."* — design-pattern thesis
3. *"fGw's Powder Keg pile-build attendance, frequency, and cellular-coverage data show the offline scenario fires at a low enough rate to make any mesh integration ROI-negative."* — empirical, would close the density-paradox gap definitively for fGw
4. *"NIP-70 enforcement at non-relay transports (mesh, P2P, IPC) is a category-of-bug that the entire Nostr ecosystem hasn't yet patterned a solution for."* — broader Nostr-protocol research thesis

## Cross-references

- Reference: [samiz-protocol.md](../references/samiz-protocol.md) — full technical reference
- Concept: [samiz-integration-paths.md](../concepts/samiz-integration-paths.md) — Path A / B / C cost comparison
- Topic: [samiz-in-fgw.md](../topics/samiz-in-fgw.md) — synthesis with bitchat head-to-head + alternatives
- Companion thesis: [bitchat-as-fgw-networking-stack.md](bitchat-as-fgw-networking-stack.md) — same outcome (contradicted), different reasoning
- Existing networking: [pyramid-in-fgw.md](../topics/pyramid-in-fgw.md)
- Membership model both samiz AND bitchat bypass: [pyramid-invite-tree-semantics.md](../concepts/pyramid-invite-tree-semantics.md)
