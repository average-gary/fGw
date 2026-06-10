---
title: "bitchat — Protocol Whitepaper (permissionlesstech/bitchat WHITEPAPER.md)"
type: paper
source: https://github.com/permissionlesstech/bitchat/blob/main/WHITEPAPER.md
authors: [permissionlesstech, jackjackbits]
captured: 2026-06-09
license: Unlicense (public domain) on iOS reference impl
quality: 5
evidence_strength: spec/primary
relevance: direct
direction: explains-how
tags: [bitchat, ble-mesh, protocol, noise-xx, packet-format, fgw]
summary: "Canonical bitchat protocol specification — four-layer architecture (Application / Session / Encryption / Transport), Noise_XX_25519_ChaChaPoly_SHA256 encryption, 13-byte fixed packet header with PKCS#7 padding, TTL-bounded gossip flooding, Bloom-filter dedup, separate Curve25519 + Ed25519 identity keys."
---

# bitchat — Protocol Whitepaper

## What this source is

The protocol specification authored by the bitchat maintainers, hosted at the canonical `permissionlesstech/bitchat` repository. Defines wire format, encryption, identity, and routing semantics. Silent on Nostr bridging, store-and-forward windows, BLE GATT UUIDs (those live in the source).

## Architecture (verbatim layers)

1. **Application Layer** — chat semantics, channels, mentions
2. **Session Layer** — Noise XX handshakes, peer state
3. **Encryption Layer** — Curve25519 + ChaCha20-Poly1305 + SHA-256
4. **Transport Layer** — abstracted; BLE GATT today, Wi-Fi Direct mentioned but not shipped

The transport abstraction is load-bearing for any port: a Rust/Tauri implementation does not have to fork the protocol to swap the radio.

## Wire format — `BitchatPacket`

**Fixed 13-byte header**:

| Field | Size | Notes |
|---|---|---|
| Version | 1 byte | currently `0x01` |
| Type | 1 byte | message-type discriminator |
| TTL | 1 byte | decremented per relay hop, max 7 in app |
| Timestamp | 8 bytes | UInt64 ms since epoch |
| Flags | 1 byte | bit 0 = hasRecipient, bit 1 = hasSignature, bit 2 = isCompressed |
| PayloadLength | 2 bytes | UInt16 |

**Variable**: SenderID (8) | RecipientID (8, optional) | Payload (variable) | Signature (64 bytes Ed25519, optional).

**Padding**: PKCS#7-style padding to nearest of 256 / 512 / 1024 / 2048 bytes. **Privacy/traffic-analysis defense, not just framing** — the wire reveals no length information beyond the bucket.

## Encryption

- Pattern: `Noise_XX_25519_ChaChaPoly_SHA256` (3-message handshake with `ee, es, se` DHs)
- Identity = **Curve25519** static keypair + **Ed25519** signing keypair (two keys per peer)
- Fingerprint = SHA-256 of static pubkey for OOB verification
- Sliding-window nonce anti-replay; DoS rate-limiting on handshakes; fixed-size padding for traffic-analysis resistance
- Forward secrecy via per-handshake ephemerals; automatic rekey at 1 hour OR 10,000 messages

## Routing

- Gossip flooding with TTL (max 7 in-app, 8-bit field)
- Deduplication via `OptimizedBloomFilter` over packet IDs
- Relays forward the encrypted Noise payload **without decrypting** — privacy-preserving for relayers
- Recipient still processes packets that arrive at TTL=0

## Message types (selected)

`noiseHandshakeInit`, `noiseEncrypted`, `deliveryAck`, `readReceipt`, `fragmentStart/Continue/End`. The `noiseEncrypted` slot is what carries application content (chat, ack, etc.) and is also the slot fGw would tunnel signed Nostr events through.

## Concerning signals

- Whitepaper is silent on Nostr bridging (lives in `bitchat/Nostr/` source, not the spec)
- No BLE GATT UUIDs in the whitepaper — must read `BLEService.swift`
- No store-and-forward window definition — protocol is fundamentally real-time / opportunistic
- No security audit cited

## Key quotes

> "The protocol is transport-agnostic above the Transport Layer. Implementations are free to plug in alternative radios."

> "Noise_XX_25519_ChaChaPoly_SHA256 provides mutual authentication, forward secrecy, KCI resistance, and identity hiding after handshake."

## Relevance to fGw

This is the foundation document any Rust port must conform to. The `noiseEncrypted` payload type plus the `MessageType` enum define the slot fGw would use to tunnel signed Nostr events through bitchat. The Curve25519+Ed25519 identity is **incompatible with Nostr's secp256k1** — fGw users adopting bitchat get a separate identity with no key derivation shortcut.
