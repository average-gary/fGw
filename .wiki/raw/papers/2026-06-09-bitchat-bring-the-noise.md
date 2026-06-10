---
title: "bitchat — BRING_THE_NOISE.md (Noise XX implementation guide and security model)"
type: paper
source: https://github.com/permissionlesstech/bitchat/blob/main/BRING_THE_NOISE.md
authors: [permissionlesstech]
captured: 2026-06-09
quality: 5
evidence_strength: spec/primary
relevance: direct
direction: explains-how
tags: [bitchat, noise-xx, security-model, identity, fgw]
summary: "bitchat's own Noise XX migration document — defines primitives (X25519 / ChaChaPoly / SHA-256 / HKDF), forward secrecy via per-handshake ephemerals, automatic rekey at 1h or 10k msgs, and the in-scope vs out-of-scope security claims. Out-of-scope items are the most important for an integrator: BLE-layer tracking, endpoint compromise, network-level traffic analysis, post-quantum readiness."
---

# bitchat — BRING_THE_NOISE.md

The post-Radocea-MITM migration document. bitchat's project-acknowledged security model after swapping in Noise XX.

## Primitives

`X25519` / `ChaChaPoly` / `SHA-256` / `HKDF-SHA256`. Standard Noise framework choices.

## In-scope security properties

- Message confidentiality + integrity
- Forward secrecy (per-handshake ephemerals; automatic rekey at **1 hour OR 10,000 messages**)
- Mutual peer authentication after handshake
- KCI resistance
- Identity hiding after handshake

## Out-of-scope (project-acknowledged)

This list is the most important section for any integrator:

- **BLE-layer tracking** — MAC-address-rotation behavior is OS-defined; bitchat does not defend metadata at the radio layer
- **Endpoint compromise** — keys live in OS keychain; if the device is rooted/jailbroken, all bets are off
- **Network-level traffic analysis** — padding to 256/512/1024/2048 helps but doesn't defeat a determined observer of BLE air traffic
- **Post-quantum readiness** — explicitly deferred to "Future Enhancements"

## Identity layer

```
NoiseIdentityAnnouncement {
  peerID,
  publicKey,
  nickname,
  previousPeerID?,
  signature
}
```

Sessions persist across **peer-ID rotation** by mapping fingerprints. This is how bitchat handles Bluetooth MAC randomization without losing session continuity.

## Components (Swift class names)

- `NoiseEncryptionService`
- `NoiseSession`
- `NoiseSessionManager` (DispatchQueue-protected)
- Version negotiation: `versionHello: 0x20`, `versionAck: 0x21`; legacy peers default to v1.

## Why it matters for fGw

- **Identity is X25519/Ed25519, NOT secp256k1**. A Powder Keg user's Nostr nsec cannot be the bitchat identity. fGw must generate and store a separate Noise identity in the Tauri keystore (e.g., `keyring` crate or platform Keychain plugin) alongside the existing nsec. This is the third key per user (after nsec + Pyramid AUTH pubkey).
- Aggressive rekey thresholds (**1h / 10k msgs**) interact badly with Android Doze / process kills — a phone in pocket forces frequent re-handshakes, costing latency and battery.
- The out-of-scope list disclaims metadata, BLE tracking, and traffic analysis — exactly the surveillance vectors a marketplace exposes (vendor-buyer pairing patterns).

## Key quotes

> "Forward secrecy is achieved through per-handshake ephemeral keys, with automatic rekey after one hour or 10,000 messages."

> "BLE-layer tracking is out of scope for this design. Defending against radio-layer metadata adversaries requires changes outside the Noise protocol."

## Relevance to fGw thesis

Confirms the cryptographic core is now defensible (Noise XX is industry-standard) but the **metadata + radio-link** layer is project-acknowledged as undefended. For Powder Keg's compost-marketplace use case where vendor-buyer transaction patterns are sensitive, "we encrypt the payload but the BLE MAC dance reveals who talked to whom" is a real, project-disclaimed gap.
