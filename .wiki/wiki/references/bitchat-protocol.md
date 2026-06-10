---
title: "bitchat protocol — wire format, encryption, identity, transport"
type: reference
confidence: high
status: stable
sources:
  - ../../raw/papers/2026-06-09-bitchat-whitepaper.md
  - ../../raw/papers/2026-06-09-bitchat-bring-the-noise.md
  - ../../raw/repos/2026-06-09-bitchat-main-repo.md
  - ../../raw/repos/2026-06-09-bitchat-android.md
  - ../../raw/repos/2026-06-09-tauri-plugin-blec.md
created: 2026-06-09
updated: 2026-06-09
tags: [bitchat, ble-mesh, noise-xx, protocol, reference]
---

# bitchat protocol — reference

Authoritative summary of the bitchat protocol for fGw integration decisions. All claims are sourced from primary specs (whitepaper, BRING_THE_NOISE.md) and source code.

## Project identity

- **Name**: bitchat
- **Origin**: weekend project announced 2025-07-06 by Jack Dorsey; whitepaper 2025-07-08
- **Reference impl**: `permissionlesstech/bitchat` (Swift, iOS/macOS, Unlicense)
- **Android port**: `permissionlesstech/bitchat-android` (Kotlin, GPL-3.0)
- **Repo state 2026-06-09**: 26k stars, 285 open issues, latest release 2026-01-28
- **Cumulative downloads (Sept 2025)**: ~360k
- **License tension**: iOS Unlicense (public domain), Android GPL-3.0 → integrators must isolate Android via separate-process IPC, clean-room reimplementation, or accept GPL-3.0

## Layers (verbatim, from whitepaper §2)

1. **Application** — chat semantics, channels, mentions
2. **Session** — Noise XX handshakes, peer state
3. **Encryption** — Curve25519 + ChaCha20-Poly1305 + SHA-256
4. **Transport** — abstracted; BLE GATT today, Wi-Fi Direct mentioned but not shipped, Nostr added in v1.3.0 (Aug 2025)

The transport abstraction matters: a Rust port can swap radios without touching protocol internals.

## Wire format — `BitchatPacket`

**13-byte fixed header**:

| Field | Size | Notes |
|---|---|---|
| Version | 1 | currently `0x01` |
| Type | 1 | `MessageType` discriminator |
| TTL | 1 | decremented per relay hop, max 7 in app |
| Timestamp | 8 | UInt64 ms since epoch |
| Flags | 1 | bit 0 = hasRecipient, bit 1 = hasSignature, bit 2 = isCompressed |
| PayloadLength | 2 | UInt16 |

**Variable**: SenderID (8) | RecipientID (8, optional) | Payload (variable) | Signature (64 Ed25519, optional).

**Padding**: PKCS#7-style to nearest of 256 / 512 / 1024 / 2048 bytes — privacy/traffic-analysis defense.

## Encryption (Noise_XX_25519_ChaChaPoly_SHA256)

- 3-message handshake with `ee, es, se` Diffie-Hellmans
- Identity = **Curve25519** static keypair + **Ed25519** signing keypair (two keys per peer, separate from Nostr secp256k1)
- Fingerprint = SHA-256(static pubkey) for OOB verification
- Forward secrecy via per-handshake ephemerals
- **Automatic rekey at 1 hour OR 10,000 messages** — interacts badly with Android Doze / process kills
- KCI resistance, identity hiding after handshake
- Sliding-window nonce anti-replay; DoS rate-limiting on handshakes
- ChaCha20-Poly1305 AEAD; SHA-256 / HKDF-SHA256

### In-scope security properties (per BRING_THE_NOISE.md)

Confidentiality, integrity, forward secrecy, mutual peer auth, KCI resistance, identity hiding after handshake.

### Out-of-scope (project-acknowledged)

- **BLE-layer tracking** — MAC-randomization is OS-defined; bitchat does not defend metadata at the radio layer
- **Endpoint compromise** — keys live in OS keychain
- **Network-level traffic analysis** — padding helps but does not defeat a determined air-layer observer
- **Post-quantum readiness** — explicitly deferred

## Routing

- Gossip flooding with 8-bit TTL field, capped at **7 in-app**
- Recipient still processes packets that arrive at TTL=0
- Deduplication via `OptimizedBloomFilter` over packet IDs
- Relays forward encrypted Noise payloads **without decrypting** — privacy-preserving for relayers
- Outbox: 100 msgs/peer, 24h TTL (`MessageRouter.swift`)

## BLE GATT specifics (from `BLEService.swift`)

- **Service UUID** (mainnet): `F47B5E2D-4A9E-4C5A-9B3F-8E1D2C3A4B5C`
- **Service UUID** (testnet): ends `5A`
- **Characteristic UUID**: `A1B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D`
- Properties: `notify | write | writeWithoutResponse | read`
- **Advertising contains only the service UUID** (no local name — privacy)
- **MTU 512 max**, fragmentation negotiated
- **Both central and peripheral roles run concurrently**

The dual-role requirement is the killer constraint for any Tauri-Rust integration: `btleplug` and `tauri-plugin-blec` are **central-only**. Real mesh participation needs a custom platform plugin per OS.

## Nostr fallback (v1.3.0+, the decisive finding)

bitchat itself ships a Nostr fallback. From `NostrEmbeddedBitChat.swift`:

```
encodePMForNostr() / encodeAckForNostr()
  → "bitchat1:" + base64url(packet.toBinaryData())
  → wrapped in NIP-17 gift-wrap
```

The whole `BitchatPacket` (with `MessageType.noiseEncrypted`, TTL=7, Noise-encrypted payload) becomes the **content** of a Nostr gift-wrapped event. `NostrIdentityBridge` derives unlinkable Nostr identities per geohash channel. ~290+ public Nostr relays used as fallback.

`MessageRouter.swift` does transport-agnostic priority routing:

```swift
transports.first { $0.isPeerReachable(peerID) }
```

— BLE mesh and `NostrTransport` are siblings.

**This is the half of bitchat fGw could speak today without writing any BLE code.**

## Message types (selected)

`noiseHandshakeInit`, `noiseEncrypted`, `deliveryAck`, `readReceipt`, `fragmentStart/Continue/End`. The `noiseEncrypted` slot is the application-payload tunnel.

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

Sessions persist across peer-ID rotation by mapping fingerprints. Components: `NoiseEncryptionService`, `NoiseSession`, `NoiseSessionManager`.

## Android manifest requirements (per bitchat-android)

For native BLE peripheral participation on Android, an integrator must declare:

- `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`
- `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CONNECTED_DEVICE`, `FOREGROUND_SERVICE_LOCATION`, `FOREGROUND_SERVICE_DATA_SYNC`
- `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`
- `<uses-feature android:name="android.hardware.bluetooth_le" required="true"/>`

Plus a `MeshForegroundService` and a `BootCompletedReceiver`. **No background mesh without a foreground service** on Android 14+.

## Empirical envelope (range / hops)

From the 2.4 GHz path-loss measurement (Sensors / MDPI 2021) and consumer BLE field tests:

- **Phone-to-phone line-of-sight outdoors**: ~30–50 m at 0 dBm, BT 4.2/5.x
- **With bodies / trees / pockets**: ~10–25 m
- **Path-loss exponent 1.46** in flat outdoor field (better than free-space 2.0)
- **RSSI std dev**: 4.26–6.04 dBm — too noisy for range gating; bitchat uses dedup + TTL not RSSI
- For a 5-acre Powder Keg pile-build site (~80 m radius): 2 hops covers it line-of-sight, 3–4 hops with foliage. **7-hop cap is comfortable headroom.**

Range is **not** the binding constraint. Density and Android background-execution rules are.

## Cross-references

- Mechanism / integration paths: [bitchat-integration-paths.md](../concepts/bitchat-integration-paths.md)
- Synthesis / verdict context: [bitchat-in-fgw.md](../topics/bitchat-in-fgw.md)
- Thesis: [bitchat-as-fgw-networking-stack.md](../theses/bitchat-as-fgw-networking-stack.md)
- Sources: [whitepaper](../../raw/papers/2026-06-09-bitchat-whitepaper.md), [BRING_THE_NOISE.md](../../raw/papers/2026-06-09-bitchat-bring-the-noise.md), [iOS repo](../../raw/repos/2026-06-09-bitchat-main-repo.md), [Android port](../../raw/repos/2026-06-09-bitchat-android.md), [tauri-plugin-blec](../../raw/repos/2026-06-09-tauri-plugin-blec.md)
