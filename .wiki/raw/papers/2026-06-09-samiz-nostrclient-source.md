---
title: "samiz NostrClient.kt — local-relay subscription, kind handling, identity model"
type: paper
source: https://github.com/KoalaSat/samiz/blob/main/mobile/app/src/main/java/com/koalasat/samiz/model/NostrClient.kt
captured: 2026-06-09
authors: [KoalaSat]
quality: 5
evidence_strength: source-code
relevance: direct
direction: explains-how
tags: [samiz, nostr, citrine, local-relay, ammolite, quartz, kind-filter, identity, fgw]
summary: "samiz hard-codes ws://127.0.0.1:4869 as its only relay. Subscribes locally to (a) samizSync — all kinds, last 1 hour, (b) samizPrivate — kind 1059 (NIP-17 gift-wrap), last 2 days, (c) samizMeta — kind 0 (profile metadata), unbounded. Uses Vitor Pamplona's ammolite (Amethyst's relay client) and quartz (event types) — Kotlin/JVM only, no Rust port. samiz NEVER signs events — user's Nostr client signs, samiz only relays signed events. BLE pairing UUID is per-install random, fully decoupled from Nostr identity."
---

# samiz NostrClient.kt — local-relay bridge

## Hard-coded relay list

```kotlin
val defaultRelayUrls = listOf("ws://127.0.0.1:4869")
```

**One relay URL only**, pointing at Citrine's default port. samiz never connects to any internet relay (including Pyramid) directly.

## Three subscriptions on the local relay

```kotlin
samizSync   = filter(common_feed_types, since = now - 1h, kinds = [])         // ALL kinds, 1 hour
samizPrivate = filter(common_feed_types, since = now - 2d, kinds = [1059])   // NIP-17 gift-wrap, 2 days
samizMeta   = filter(event_finder_types, kinds = [0])                          // kind 0, unbounded
```

**Kind handling answer**: samiz is largely kind-agnostic. The 1-hour sync window includes any kind. NIP-17 gift-wraps get a 2-day window (longer because they're DM-class). Profile metadata (kind 0) has no time bound.

For fGw's payloads:
- **NIP-99 listings** (kind 30402): carried as-is in the 1-hour window — no special handling
- **NIP-52 calendar events** (kinds 31922/31923/31924/31925): same
- **NIP-32 labels** (kind 1985): same
- **NIP-17 DMs** (kind 1059): explicit 2-day window
- **NIP-72 communities** (kind 34550): same

## Library dependencies (Kotlin/JVM-only)

- `com.vitorpamplona.ammolite.relays.{Client, RelayPool, Relay}` — Vitor Pamplona's relay client extracted from Amethyst
- `com.vitorpamplona.quartz.events.Event` — Amethyst's Nostr event types
- `com.vitorpamplona.negentropy.Negentropy` — Negentropy reconciliation in Kotlin

**No Rust port exists for any of these.** A Tauri-Rust integration would either (a) embed JNI calls to these libraries (deep dep tree), or (b) reimplement against Nostr spec (months of work).

## Identity model

samiz **never sees an nsec**. There is no signing code path. The user's Nostr client signs; samiz only relays signed events.

BLE pairing UUID is per-install random, stored in `SharedPreferences`, fully decoupled from the user's Nostr identity. This is **clean** in one direction (no key reuse risk) and **opaque** in the other (no way for a peer to verify "this BLE peer is npub X" — only the events that flow through carry signed pubkeys).

## User-Agent

```
samiz/<version> (Android)
```

fiatjaf's issue #17 is about Citrine treating samiz traffic specially based on user-agent — see [samiz-issue-17-fiatjaf-nip70-leak.md](../articles/2026-06-09-samiz-issue-17-fiatjaf-nip70-leak.md).

## Why it matters for fGw integration

- **fGw signs its own events** (Pyramid client, secp256k1 nsec). For fGw to use samiz's protocol, two paths:
  - **Path A (embedded local relay)**: stand up a local Nostr relay inside Tauri (e.g. embed nostr-rs-relay or write a minimal in-process relay). samiz's stack runs unchanged. Adds a relay process to fGw.
  - **Path B (skip the local relay)**: feed fGw events directly into the Negentropy reconciliation layer, bypass `ws://127.0.0.1:4869`. Cleaner but requires reimplementing the BLE peripheral + Negentropy state machine in Rust against samiz's wire spec.
- The `ammolite` + `quartz` Kotlin dependency tree is substantial (Amethyst-derived). Path A means absorbing a non-trivial JVM codebase into fGw's Android build.
- **Identity is decoupled**, which is ideal for fGw — no separate per-user Noise key like bitchat requires. The user's existing nsec signs events; samiz transports them.

## Cross-references

- Wire format: [samiz-reconciliation-source.md](2026-06-09-samiz-reconciliation-source.md)
- Required relay: [Citrine](../repos/2026-06-09-citrine-android-relay.md)
- BLE layer: [samiz-bluetoothble-source.md](2026-06-09-samiz-bluetoothble-source.md)
