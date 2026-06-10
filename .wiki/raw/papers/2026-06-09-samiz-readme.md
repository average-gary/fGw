---
title: "samiz README — architecture, use cases, BLE handshake, and Negentropy choice"
type: paper
source: https://raw.githubusercontent.com/KoalaSat/samiz/main/README.md
captured: 2026-06-09
authors: [KoalaSat]
quality: 5
evidence_strength: spec/primary
relevance: direct
direction: explains-how
tags: [samiz, readme, architecture, ble, negentropy, citrine, fgw]
summary: "samiz README is the project's primary spec. Establishes that samiz is 'just the communication layer between local relays' — not a Nostr client, not a relay, not a chat app. Defines BLE handshake (per-device random UUID; SERVER UUID > CLIENT UUID role rule), wire format (Deflater compression → 512-byte chunks with [chunk_index][chunk][is_last] framing), sync algorithm (Negentropy / NIP-77-style set reconciliation), and three use cases (individual offline note, festival mesh, satellite backhaul). Distribution: GitHub Releases / Obtainium / Zap.Store. F-Droid conspicuously absent."
---

# samiz README — primary spec

## What samiz is (verbatim)

> "Samiz is just the communication layer between local relays … in order to have a full experience you'll require to install your own local relay and use it with your own nostr client."

This is the architectural disclaimer that decides every integration question downstream. samiz does NOT:

- Author Nostr events (the user's Nostr client does)
- Sign events (the Nostr client's nsec does)
- Store events long-term (the local relay does)
- Bridge to internet relays directly (the local relay does that when reconnected)

samiz IS:

- A BLE bridge that gossips events between two local relays running on different phones

## BLE handshake

Each device:

1. Generates a per-install random UUID
2. Persists it in `SharedPreferences` under key `advertiser_uuid`
3. Broadcasts it in BLE service-data
4. On encounter, compares its UUID to the peer's:
   - If `peer UUID > own UUID` → "I am CLIENT"; calls `device.connectGatt(...)`
   - Else → "I am SERVER"; waits for incoming connection

Symmetric, no central coordinator. Per-device UUID is **not** the user's Nostr pubkey — samiz has no Nostr identity awareness at the BLE layer.

## Wire format (per README)

- Application message → `Deflater` compression
- Compressed payload → chunked at **512-byte BLE MTU**
- Chunk header: `[chunk_index (byte)][chunk_payload][is_last (boolean)]`
- Reassembly + decompress on receive

**Note**: source code (`Compression.kt`) shows actual framing is `[index][payload][numChunks]` (last byte is total chunks, not boolean — README is slightly inaccurate). Index is single-byte, capping mesh messages at 256 chunks × 500 bytes ≈ 125 KB per Nostr event — comfortable headroom.

## Sync algorithm

**Negentropy** (Doug Hoyte, [github.com/hoytech/negentropy](https://github.com/hoytech/negentropy)) — range-based set reconciliation. Same algorithm as NIP-77 / strfry. Bandwidth proportional to the *set difference*, not the union.

Quote: "two fully synchronized devices continuously broadcast new events" — once both peers have caught up, only deltas move.

**Architectural significance for fGw**: this is the core "Nostr-native" claim. samiz reuses Nostr's blessed sync algorithm and shuttles signed `EVENT` JSON between local relays. fGw's signed events stay signed, valid, and re-publishable to Pyramid downstream.

## Use cases (verbatim)

### Use Case A — Individual offline note
Bob writes a note while offline. Once he regains internet, the note flushes to his configured relays.

### Use Case B — Festival scenario
At a festival without internet, Alice posts updates about her cookie sale. Other attendees running samiz pick up Alice's note via BLE, store it in their local relay, and forward to other attendees they meet.

### Use Case C — Satellite backhaul
Bob attended a festival and collected notes from many participants via samiz. Faythe later publishes Bob's collected notes to global relays (e.g. via satellite). All events arrive at global relays as **standard signed Nostr events** — no envelope, no transformation.

## Distribution channels

- GitHub Releases
- Obtainium
- Zap.Store
- **F-Droid: NOT present** (verified by direct search 2026-06-09)

## Local-relay requirement

samiz hard-codes `defaultRelayUrls = listOf("ws://127.0.0.1:4869")` — Citrine's default port. If Citrine (or another local Android Nostr relay) isn't running, samiz crashes its own service: `relayError() { stopService(); Toast(...local_relay_not_found...) }`. There is no embedded fallback relay.

## Concerning signals (project-acknowledged)

- README explicitly labels samiz "alpha"
- Use Case B (festival, high-density crowds) is exactly the BLE-mesh sweet spot — and exactly NOT Powder Keg's rural / sparse / persistent-relationship context
- README is silent on encryption, identity, kind filters, AUTH-gated relays, iOS/desktop targets, threat model, rate limiting, eclipse-attack mitigation

## Why it matters for fGw

- Nostr-native end-to-end sync algorithm IS philosophically the right shape for fGw (vs bitchat's chat-first protocol)
- BUT: the three-app architecture (fGw + samiz + Citrine) collapses any "drop-in stack" framing
- AND: requiring users to install Citrine separately is a UX cliff for a 100-member compost marketplace
- AND: fGw's Pyramid AUTH-gated relay model has no hook in samiz's flush stage — events flow into Pyramid only after a custom NIP-42 AUTH bridge fGw would have to build itself

## Cross-references

- Code-level details: [BluetoothBle.kt](2026-06-09-samiz-bluetoothble-source.md), [BluetoothReconciliation.kt](2026-06-09-samiz-reconciliation-source.md), [NostrClient.kt](2026-06-09-samiz-nostrclient-source.md), [AndroidManifest.xml](2026-06-09-samiz-android-manifest.md)
- Required companion: [Citrine](../repos/2026-06-09-citrine-android-relay.md)
- Sync spec: [NIP-77 Negentropy](2026-06-09-nip-77-negentropy.md)
