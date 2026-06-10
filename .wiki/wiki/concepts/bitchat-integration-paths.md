---
title: "bitchat integration paths for fGw — Path A (Nostr-tunneled) vs Path B (native BLE mesh)"
type: concept
confidence: high
status: stable
sources:
  - ../../raw/repos/2026-06-09-bitchat-main-repo.md
  - ../../raw/repos/2026-06-09-bitchat-android.md
  - ../../raw/repos/2026-06-09-tauri-plugin-blec.md
  - ../../raw/papers/2026-06-09-bitchat-whitepaper.md
  - ../../raw/papers/2026-06-09-bitchat-bring-the-noise.md
created: 2026-06-09
updated: 2026-06-09
tags: [bitchat, integration, tauri, rust, android, ios, nostr, fgw]
---

# bitchat integration paths for fGw

There are two structurally distinct ways to add bitchat to fGw, with very different cost, scope, and value profiles.

## Path A — Nostr-tunneled bitchat interop

**The decisive finding from this research session**: bitchat itself ships a Nostr fallback. `NostrEmbeddedBitChat.encodePMForNostr()` produces `bitchat1:` + base64url(`packet.toBinaryData()`) as the **content** of a NIP-17 gift-wrapped Nostr event. `MessageRouter.swift` chooses transport per-peer:

```swift
transports.first { $0.isPeerReachable(peerID) }
```

— BLE and `NostrTransport` are siblings. fGw, which is Nostr-only today, can speak the half of bitchat that travels over Nostr.

### What Path A requires in fGw's codebase

1. **Noise XX in Rust** — `snow` crate is the standard pick (audited, used by Tor / IronOxide / WireGuard-rs / many others)
2. **Curve25519 + Ed25519 identity** — separate from the user's nsec; persisted in Tauri keystore (`keyring` crate or platform keychain)
3. **`BitchatPacket` codec** — 13-byte header + variable fields + PKCS#7 padding (256/512/1024/2048)
4. **`NoiseEncrypted` payload TLV** — including the `NoisePayloadType` discriminator byte
5. **NIP-17 gift-wrap parse path** — fGw already subscribes to NIP-17 on Pyramid; detect `bitchat1:` content prefix and route to bitchat handler instead of fGw chat handler
6. **`NoiseIdentityAnnouncement`** — publish the user's Noise fingerprint alongside their npub, so other bitchat peers can find this fGw user

### What Path A delivers

- **Point-to-point bitchat interoperability over Nostr** — fGw users can DM with bitchat-app users when both are online
- **Web target works** — no BLE required
- **Desktop target works** — no BLE required
- **Android target works** — no BLE plugin required
- **iOS target works whenever Apple Dev account ships** — no BLE required

### What Path A does NOT deliver

- No offline operation — both peers must reach a Nostr relay
- No mesh — direct DM only
- No advantage over fGw's existing NIP-17 DMs unless the user wants to talk to *bitchat* users specifically
- Adds the Noise XX dependency + identity-key management

### Path A scope estimate

- Rust + JS: ~2–4 weeks for one engineer
- Net new identity key per user: 1 (Noise X25519/Ed25519 pair, on top of nsec + Pyramid AUTH pubkey = third key class)
- New external dependencies: `snow` (Noise), no BLE crates

## Path B — Native BLE mesh participation

The headline use case (offline coordination at a pile-build) requires fGw to be a real mesh node — both advertise and scan, both relay and originate.

### What Path B requires

#### Per-platform plugins (no off-the-shelf cross-platform Rust BLE peripheral exists)

| Platform | Strategy |
|---|---|
| Android | Custom Tauri Kotlin plugin wrapping Nordic BLE Library (same dep as bitchat-android) |
| iOS | Swift plugin wrapping `CBPeripheralManager` |
| macOS | Swift bridge to CoreBluetooth |
| Windows | WinRT bridge |
| Linux | `bluster` (BlueZ-only) |
| Web | **silently disabled** — Web Bluetooth is central-only with no background |

#### Plus everything in Path A

— Noise XX, identity, codec, payload — Path B does not subsume Path A; it adds to it.

#### Plus Android manifest changes

```xml
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE"/>
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT"/>
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"/>
<uses-feature android:name="android.hardware.bluetooth_le" android:required="true"/>
```

Plus a `MeshForegroundService` (persistent user-visible notification — Android 14+ structurally requires this) and a `BootCompletedReceiver`. **No background mesh without a foreground service.**

This interacts badly with fGw's existing Android scaffold: `BUILD-ANDROID.md` already warns that `tauri android init` clobbers signing config; adding ~12 manifest permissions + a foreground service makes the scaffold even more sensitive to regeneration.

### What Path B delivers

- True offline mesh: 2+ fGw users at a pile-build with no cell signal can chat / sign events / sync when one device returns to the network
- Interop with bitchat-app users on the same mesh
- Range envelope: ~30–50 m phone-to-phone line-of-sight; 7-hop cap covers a 5-acre site comfortably

### What Path B does NOT deliver

- **No web users on the mesh** — Web Bluetooth has no peripheral mode
- **No iOS until Apple Dev account ships** (per fGw alpha-bundle plan)
- **No background availability without a persistent notification** users will dismiss
- **No fix for the density paradox** — the offline scenarios where bitchat shines (festivals, protests) are anti-correlated with rural deployments where bitchat is needed

### Path B scope estimate

- Custom plugin × 5 platforms (Android first, iOS second, others optional)
- ~3–6 months for one engineer for Android-only
- License: **GPL-3.0 contagion risk if reusing bitchat-android Kotlin** — clean-room reimplementation against the spec is the only license-clean path
- ~30 BLE helper files in upstream bitchat (`BLEFanoutSelector`, `BLEDirectedRelaySpool`, `BLEFragmentAssemblyBuffer`, `BLEScanDutyPolicy`, `BLEAnnounceThrottle`, `BLEPacketFreshnessPolicy`, …) suggest months of subtle behavior tuning that a from-scratch port will get wrong on the first attempt

## The asymmetric value picture

Path A delivers little but costs little. Path B delivers what the thesis actually claims but costs a lot, and most of the cost is paid in the hardest, lowest-leverage parts of fGw (Android plugin code, foreground-service UX). Worse, Path B's value is gated by:

- **Density** — needs ≥2 fGw users in BLE range AND offline
- **Foreground service running** — Android user has not dismissed the notification
- **iOS shipping** — currently deferred per alpha-bundle plan
- **Battery acceptance** — phone losing 10–20%/hr while scanning + advertising

## Recommendation framework

If the question is "should fGw add bitchat?" the answer depends on:

1. **Is bitchat-app interop the goal?** Path A only, Phase-N optional feature.
2. **Is offline-coordination at pile-builds the goal?** Path B is the right shape but the wrong tool — see [bitchat-in-fgw.md](../topics/bitchat-in-fgw.md) for alternatives (strfry-on-Pi, NDK outbox queue).
3. **Is general resilience the goal?** Neither — invest in NDK outbox queueing + a chapter-steward Pi running strfry over Wi-Fi at events.

## Cross-references

- Reference: [bitchat-protocol.md](../references/bitchat-protocol.md)
- Synthesis: [bitchat-in-fgw.md](../topics/bitchat-in-fgw.md)
- Thesis: [bitchat-as-fgw-networking-stack.md](../theses/bitchat-as-fgw-networking-stack.md)
- Existing fGw networking: [pyramid-in-fgw.md](../topics/pyramid-in-fgw.md)
