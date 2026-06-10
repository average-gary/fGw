---
title: "bitchat — main iOS/macOS repository (permissionlesstech/bitchat)"
type: repo
source: https://github.com/permissionlesstech/bitchat
captured: 2026-06-09
language: Swift
license: Unlicense (public domain)
stars: 26010
forks: 2490
open_issues: 285
latest_release: 2026-01-28
quality: 5
evidence_strength: spec/primary
relevance: direct
direction: explains-how
tags: [bitchat, ios, macos, swift, repo, nostr-bridge, message-router]
summary: "Reference iOS/macOS implementation. Dual transport built in: BLE mesh first, Nostr fallback. NIP-17 gift-wrapped DMs over Nostr; geohash channels; NostrIdentityBridge derives unlinkable Nostr identities per geohash. Multi-hop BLE relay capped at 7 hops. Critical Swift files for any port: BLEService.swift (BLE GATT), NostrEmbeddedBitChat.swift / NostrTransport.swift / MessageRouter.swift (transport-agnostic routing)."
---

# bitchat — main repo (iOS/macOS)

## Project state (snapshot 2026-06-09)

- **26,010 stars, 2,490 forks, 285 open issues**
- 14 releases; latest **Jan 28 2026**
- Swift only; license **Unlicense** (public domain — maximally permissive for embedding)

## Critical architectural finding — dual transport already built in

bitchat is **not BLE-only**. The repo ships:

- **BLE mesh transport** (`BLEService.swift` + ~30 helpers in `Services/BLE/`)
- **Nostr fallback transport** (`bitchat/Nostr/` directory + `Services/NostrTransport.swift`)
- **Transport-agnostic priority routing** (`MessageRouter.swift`):
  ```swift
  transports.first { $0.isPeerReachable(peerID) }
  ```
  Outbox holds 100 msgs/peer, 24h TTL.

## The Nostr bridge (decisive for fGw)

`NostrEmbeddedBitChat.encodePMForNostr()` and `encodeAckForNostr()` produce `bitchat1:` + base64url(`packet.toBinaryData()`) content strings.

**The whole `BitchatPacket` (with `MessageType.noiseEncrypted`, TTL=7, Noise-encrypted payload) becomes the content of a Nostr gift-wrapped event (NIP-17/59).**

The inner Noise payload starts with a `NoisePayloadType` discriminator byte (`privateMessage` etc.), then TLV-encoded body.

`NostrIdentityBridge` derives **unlinkable Nostr identities per geohash channel** — privacy-preserving location-tagged channels. Connects to ~290+ public Nostr relays as fallback when no BLE peers are reachable.

## What this means

bitchat itself reached the conclusion that BLE-only is insufficient and bolted on a Nostr layer (~6 weeks after launch, v1.3.0 Aug 20 2025). **The architecture is converging on what fGw already has**, not the other way around.

## BLE specifics (from BLEService.swift)

- **GATT Service UUID** (mainnet): `F47B5E2D-4A9E-4C5A-9B3F-8E1D2C3A4B5C` (testnet ends `5A`)
- **Single characteristic UUID**: `A1B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D`
- Properties: `notify | write | writeWithoutResponse | read`
- **Advertising contains only the service UUID** (no local name — privacy)
- **MTU**: 512 max, fragmentation negotiated via `peripheral.maximumWriteValueLength(for:)`
- **Both central and peripheral roles run concurrently** (this is the killer constraint for Rust integration)
- ~30 BLE helper files: `BLEFanoutSelector`, `BLEDirectedRelaySpool`, `BLEFragmentAssemblyBuffer`, `BLEScanDutyPolicy`, `BLEAnnounceThrottle`, `BLEPacketFreshnessPolicy`, …

## Adoption signal

- Madagascar protests Sept 2025: ~70k downloads in a week
- Nepal Sept 2025: ~50k downloads in a single day after a 26-platform social-media ban
- Total cumulative downloads ~360k by late Sept 2025
- April 2026: removed from Apple App Store in China (signals real censorship-resistance value)

## Concerning signals

- 285 open issues, including **issue #376** (5 vulnerabilities in `BinaryProtocol.swift`, one CVSS 9.8) — closed without confirmed patches; in-thread debate over whether the report was AI-fabricated, but the parser-level concerns remain unanswered publicly
- No `SECURITY.md` (issue #1081 has been open since March 2026)
- Maintainer responsiveness pattern on critical issues = "thanks, will look into" + silent close
- iOS/macOS only on the official side; Android is a separate community port

## Relevance to fGw

The single most important mechanistic finding in this entire research session:

> **fGw already speaks the half of bitchat that travels over Nostr.** Implementing only `NostrTransport` semantics (parse `bitchat1:` envelopes from gift-wrapped events) gives fGw partial bitchat interop **without ever touching BLE**. BLE mesh becomes an additive transport, not a prerequisite.

Path A (Nostr-tunneled bitchat interop) is weeks of work. Path B (native BLE mesh on Tauri Android) is months and requires a custom Tauri plugin.
