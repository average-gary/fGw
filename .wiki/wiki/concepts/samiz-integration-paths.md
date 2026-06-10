---
title: "samiz integration paths for fGw — three options, none cheap"
type: concept
confidence: high
status: stable
sources:
  - ../../raw/repos/2026-06-09-samiz-main-repo.md
  - ../../raw/repos/2026-06-09-citrine-android-relay.md
  - ../../raw/papers/2026-06-09-samiz-android-manifest.md
  - ../../raw/papers/2026-06-09-samiz-reconciliation-source.md
  - ../../raw/papers/2026-06-09-samiz-nostrclient-source.md
  - ../../raw/papers/2026-06-09-nip-77-negentropy.md
created: 2026-06-09
updated: 2026-06-09
tags: [samiz, integration, tauri, rust, android, kotlin, fgw, three-app-stack]
---

# samiz integration paths for fGw

Three structurally distinct ways to add samiz to fGw, in increasing cost order. Each lands in a different place; none are free.

## The setup

samiz is an **Android-only Kotlin standalone application** (not a library) that **requires Citrine** (a separately-maintained Android relay APK) to function. Adopting samiz means deciding what to do with:

- The **Application class conflict** (samiz declares its own; fGw's Tauri Android target also declares its own; one APK can have only one)
- The **Citrine dependency** (samiz hard-codes `ws://127.0.0.1:4869`; if Citrine isn't running, samiz crashes its own service)
- The **Tauri host model** (Tauri 2 Android plugins are callable Kotlin classes, not foreign Activities or Application subclasses)

## Path A — Three-app stack (samiz + Citrine + fGw, IPC via localhost)

**Approach**: ship fGw as today; recommend Powder Keg members install samiz and Citrine separately. fGw points its Nostr client at `ws://127.0.0.1:4869` (Citrine) when on Android.

### What this requires

- fGw modifies its Nostr client to optionally route through localhost on Android
- Powder Keg onboarding includes Citrine APK install + samiz APK install + 12 runtime permission grants + 3 persistent foreground-service notifications + battery-optimization opt-out per phone
- Pyramid bridge: when an event arrives via mesh, fGw's NDK must publish to Pyramid using NIP-42 AUTH on flush. Citrine itself has no Pyramid AUTH support.

### Cost

- **fGw code**: ~1–2 weeks (route-through-localhost on Android + Pyramid flush stage)
- **User onboarding**: 3 APKs, ~12 permission grants, 3 notifications. UX disaster for a 100-member chapter.
- **Maintenance**: fGw inherits zero direct upstream burden. Both samiz and Citrine remain external projects.

### What it delivers

Functional samiz mesh on Android only. Not on web, not on desktop, not on iOS.

### What it does NOT deliver

- Coverage on web/desktop/iOS targets
- Any feature on fGw devices that don't have Citrine running
- Any moderation at the BLE edge — Pyramid AUTH applies only on flush, not on local mesh receipt

## Path B — Embed samiz + Citrine via JNI / clean-room AAR fork

**Approach**: fork samiz, strip its `Application` class, expose its BLE+Negentropy core as an AAR library; embed Citrine the same way (or run a minimal in-process relay); wrap both behind a Tauri 2 Kotlin plugin that exposes commands callable from fGw's Rust core.

### What this requires

- Fork samiz, refactor `Samiz : Application` → `SamizService` (or pure callable class). Months of work.
- Fork or replicate Citrine's relay-on-device functionality. Or write a minimal embedded Nostr relay in Rust (e.g. nostr-rs-relay subset) inside the Tauri runtime.
- Write a Tauri 2 Android Kotlin plugin that owns the `SynchronizationService` lifecycle, the foreground-service notification, and the BLE GATT server.
- Merge ~12 Android manifest permissions and `FOREGROUND_SERVICE_SPECIAL_USE` declaration into fGw's `AndroidManifest.xml` (already at risk per `BUILD-ANDROID.md` warning about `tauri android init` clobbering).
- Carry the Vitor Pamplona `ammolite` + `quartz` Kotlin dependency tree into fGw's Android build (Amethyst-derived; substantial).
- Lifetime maintenance of the fork.

### Cost

- **fGw code**: 3–6 months for one engineer
- **License**: samiz is MIT (fine); Citrine is MIT (fine). Path B is license-clean.
- **User onboarding**: zero extra apps — fGw users get samiz functionality from inside fGw
- **Maintenance**: fGw becomes the de facto upstream for samiz's protocol. KoalaSat is dormant; if upstream samiz revives, fGw must port changes.

### What it delivers

Functional samiz mesh on Android only, integrated into fGw's UX. Web/desktop/iOS still get nothing.

### What it does NOT deliver

- Web/desktop reach: zero. Web Bluetooth has no peripheral mode. `btleplug` (Rust desktop BLE) has no peripheral support either.
- iOS: zero. fGw's iOS is deferred per alpha-bundle plan.
- Pyramid moderation at the BLE edge: still bypassed; fGw must add allowlist/denylist filtering at the local relay edge AND surface UI distinguishing mesh-delivered events from Pyramid-validated events.

## Path C — Reimplement samiz's protocol in Rust as a Tauri plugin

**Approach**: skip samiz's code entirely; reimplement the wire protocol (5 JSON messages + Negentropy + BLE GATT) in Rust against the spec ([samiz-protocol.md](../references/samiz-protocol.md)). Use [rust-negentropy](https://github.com/yukibtc/rust-negentropy) for the algorithm. Skip Citrine — drive Negentropy state from fGw's existing Nostr event stream directly.

### What this requires

- Rust port of `BitchatPacket`-equivalent codec for samiz's 5 message types
- Embed `rust-negentropy` crate
- Custom Tauri 2 Android plugin (Kotlin) for BLE peripheral mode (`btleplug` is central-only; Android peripheral requires platform Kotlin code wrapping Nordic BLE Library or AOSP `BluetoothLeAdvertiser`)
- Custom Tauri plugins for iOS (Swift + CoreBluetooth) and desktop (`bluster` for Linux, Swift bridge for macOS, WinRT for Windows) if those targets are wanted
- ~12 Android manifest permissions + foreground-service merge

### Cost

- **fGw code**: 4–6 months Android-only; 8–12 months full multi-platform
- **License**: clean — fresh implementation against an MIT spec
- **Wire compatibility**: with care, interoperable with samiz's existing ~775 APK user base
- **Maintenance**: fGw owns the protocol implementation entirely

### What it delivers

Wire-compatible mesh participation across whatever platforms fGw chooses to invest in. Avoids the JVM dependency tree (no `ammolite`/`quartz`) and avoids the Citrine three-app problem.

### What it does NOT deliver

- Existing samiz interop "for free" — must verify against samiz Android peers in lab
- iOS background advertising still has the platform-level constraints bitchat encountered
- Web target still gets nothing (Web Bluetooth limitation)

## Comparison table

| | Path A (3-app) | Path B (fork + JNI) | Path C (Rust port) |
|---|---|---|---|
| **fGw engineering** | 1–2 weeks | 3–6 months | 4–6 months |
| **User extra apps** | 2 (samiz + Citrine) | 0 | 0 |
| **Per-phone permissions** | ~12 + 3 notifications | ~12 + 1 notification | ~12 + 1 notification |
| **Web target** | ❌ | ❌ | ❌ |
| **Desktop target** | ❌ | ❌ | ⚠️ (with bluster) |
| **iOS target** | ❌ | ❌ | ⚠️ (deferred per alpha-bundle) |
| **Android target** | ✅ | ✅ | ✅ |
| **Wire-compatible with samiz peers** | ✅ | ✅ | ✅ (with care) |
| **License risk** | none | none (both MIT) | none |
| **Pyramid AUTH bridging** | fGw must add | fGw must add | fGw must add |
| **NIP-70 leak (issue #17)** | inherited | inherited until fixed | fGw must implement filter |
| **Maintenance burden** | low (external upstream) | high (own the fork) | medium (own a single Rust impl) |

## The asymmetry vs bitchat thesis

In the [bitchat thesis](../theses/bitchat-as-fgw-networking-stack.md), Path A was "Nostr-tunneled bitchat interop" — cheap because bitchat already speaks NIP-17 over public Nostr relays, requiring no BLE on fGw's side. **samiz has no equivalent cheap path.** All three samiz paths require BLE peripheral participation, foreground service, and Android-only deployment.

samiz IS philosophically more aligned with fGw than bitchat (Nostr-native end-to-end, no separate Noise key), but the integration shape is structurally more expensive at every cost tier.

## Recommendation framework

If the question is "should fGw add samiz?" the answer depends on:

1. **Is offline pile-build coordination the goal?** Path C (Rust port) is the only architecturally clean path, but Powder Keg's density math (~60 mesh-eligible device-pairs/year per the bitchat thesis) makes the ROI poor.

2. **Is bitchat-app or samiz-app interop the goal?** Path A is cheap for samiz's wire-level interop, but you'd be betting users will install Citrine and samiz separately.

3. **Is general resilience the goal?** Neither — invest in NDK outbox-queue + chapter-steward strfry-on-Pi at events (per the bitchat thesis recommendation, unchanged here).

## Cross-references

- Reference: [samiz-protocol.md](../references/samiz-protocol.md)
- Synthesis + verdict: [samiz-in-fgw.md](../topics/samiz-in-fgw.md)
- Thesis: [samiz-as-fgw-networking-stack.md](../theses/samiz-as-fgw-networking-stack.md)
- Bitchat counterpart: [bitchat-integration-paths.md](bitchat-integration-paths.md)
- Sync algorithm: [NIP-77 Negentropy](../../raw/papers/2026-06-09-nip-77-negentropy.md)
