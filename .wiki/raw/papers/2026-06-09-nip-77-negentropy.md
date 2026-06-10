---
title: "NIP-77 — Negentropy Syncing (validates samiz's sync algorithm choice)"
type: paper
source: https://github.com/nostr-protocol/nips/blob/master/77.md
captured: 2026-06-09
authors: [Doug Hoyte, Nostr NIPs]
quality: 5
evidence_strength: spec/primary
relevance: indirect (validates samiz design)
direction: supports
tags: [nip-77, negentropy, set-reconciliation, doug-hoyte, strfry, samiz, fgw]
summary: "Nostr Implementation Possibility 77 — Negentropy syncing protocol. Range-based set reconciliation by Doug Hoyte. Two parties learn which event IDs each side is missing using bandwidth proportional to the SET DIFFERENCE, not the union. Same algorithm strfry, nostr.wine, nostrdb use for relay-to-relay sync — production-proven primitive in the Nostr stack. samiz reuses this exact algorithm over BLE; protocol-layer 'Nostr-native' claim is genuine. Rust implementation: rust-negentropy by yukibtc."
---

# NIP-77 — Negentropy Syncing

## What it is

> "Range-based set reconciliation. Two parties learn which event IDs each side is missing using bandwidth proportional to the difference, not the union, of their sets."

Author: **Doug Hoyte** ([github.com/hoytech/negentropy](https://github.com/hoytech/negentropy)).

## Why it's the right primitive for mesh/intermittent connectivity

- Bandwidth proportional to **delta**, not full set
- Once two devices are synchronized, only NEW events move
- Ideal for "channel time" measured in seconds (e.g., two phones meeting briefly at a pile-build)
- Production-deployed: strfry, nostr.wine, nostrdb all use this for relay-to-relay catch-up

## Library availability

- **Kotlin/JVM**: `com.vitorpamplona.negentropy.Negentropy` (Vitor Pamplona, used by samiz and Amethyst)
- **C++**: hoytech/negentropy reference
- **Rust**: [yukibtc/rust-negentropy](https://github.com/yukibtc/rust-negentropy) — exists, in production use
- **TypeScript**: yukibtc and others

A Rust port of samiz's protocol can use rust-negentropy directly — no need to reimplement the algorithm.

## Why samiz's choice of Negentropy is correct

samiz's "Nostr-native" claim rests partly on this choice. By using the **same sync primitive Nostr relays use over WebSocket** but reframing it to BLE, samiz preserves the protocol model: signed Nostr events flow through the mesh as standard `["EVENT", subId, eventJson]` messages, exactly as a relay would emit them.

This is in contrast to bitchat, where Nostr is a fallback transport for an otherwise-bespoke chat protocol. samiz IS Negentropy-over-BLE; bitchat IS BLE-mesh-with-Nostr-bolt-on.

## Caveats

- NIP-77 itself assumes a stateful WebSocket session. samiz reuses the algorithm but not the transport.
- The "spirit of the spec" alignment is strong but the literal compliance claim doesn't apply (samiz is not a NIP-77-implementing relay).
- Negentropy alone doesn't solve identity, encryption, allowlisting, store-and-forward windows, or rate limiting — those live above the algorithm.

## Why it matters for fGw integration

- **Algorithm portability**: rust-negentropy means a Tauri-Rust port of samiz's wire protocol does NOT have to reimplement the hard sync math
- **Protocol stability**: NIP-77 is a published spec; samiz's wire format implementing it is reasonably stable as a target for re-implementation
- **Validation of Nostr-native claim**: samiz's signed events stay signed end-to-end through the mesh, valid for re-publication to Pyramid

## Cross-references

- samiz Negentropy use: [samiz-reconciliation-source.md](2026-06-09-samiz-reconciliation-source.md)
- Algorithm origin: https://github.com/hoytech/negentropy
- Rust implementation: https://github.com/yukibtc/rust-negentropy
- strfry (Negentropy reference deployment): cited in [bitchat-in-fgw.md](../../wiki/topics/bitchat-in-fgw.md)
