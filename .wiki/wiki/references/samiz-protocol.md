---
title: "samiz protocol — wire format, Negentropy sync, identity, transport"
type: reference
confidence: high
status: stable
sources:
  - ../../raw/repos/2026-06-09-samiz-main-repo.md
  - ../../raw/papers/2026-06-09-samiz-readme.md
  - ../../raw/papers/2026-06-09-samiz-bluetoothble-source.md
  - ../../raw/papers/2026-06-09-samiz-reconciliation-source.md
  - ../../raw/papers/2026-06-09-samiz-nostrclient-source.md
  - ../../raw/papers/2026-06-09-samiz-android-manifest.md
  - ../../raw/papers/2026-06-09-nip-77-negentropy.md
  - ../../raw/repos/2026-06-09-citrine-android-relay.md
created: 2026-06-09
updated: 2026-06-09
tags: [samiz, protocol, ble, negentropy, nostr, citrine, reference, fgw]
---

# samiz protocol — reference

Authoritative summary of samiz (KoalaSat/samiz) for fGw integration decisions. All claims sourced from primary code, README, and the project's own AndroidManifest.

## Project identity

- **Name**: samiz
- **Author**: KoalaSat (Nostr npub `npub1yjxerh4msvgqf230ej3648a28xhvxjstqr2rhpjt2eelf538e70scnl9d0`)
- **Description**: "BLE mesh for nostr notes when the internet is down"
- **Repo**: `KoalaSat/samiz`, Kotlin Android standalone application
- **Stars**: 78 · forks: 1 · contributors: 2 · open issues: 1 · open PRs: 1
- **Releases**: 7 alpha tags, v0.0.1-alpha (2025-03-30) → v0.0.7-alpha (2025-08-04)
- **Last push**: 2025-08-11 (~10 months dormant as of 2026-06-09)
- **License**: MIT
- **Funding**: OpenSats (cited in community references)
- **Distribution**: GitHub Releases, Obtainium, Zap.Store · NOT on F-Droid · ~775 lifetime APK downloads
- **Bus factor**: 1 (KoalaSat = 111/112 commits)

## Architectural shape (load-bearing)

> "Samiz is just the communication layer between local relays."

samiz is **NOT** a chat app, NOT a Nostr client, NOT a relay. It is a BLE bridge between two **local Nostr relays** running on each peer's phone. Required architecture per phone:

```
[Nostr client (fGw, Amethyst, etc.)]
        ↓ publishes signed events
[Local Relay (Citrine, ws://127.0.0.1:4869)]
        ↑ samiz subscribes
        ↓ samiz Negentropy-syncs over BLE
        ↑ peer's samiz delivers EVENT messages
[peer's Local Relay] → [peer's Nostr client]
```

**Three apps per phone**: client (fGw) + samiz + Citrine. fGw cannot import samiz — see [samiz integration paths](../concepts/samiz-integration-paths.md).

## BLE GATT layer (`BluetoothBle.kt`)

```
Service UUID:     0000180f-0000-1000-8000-00805f9b34fb   ← squats SIG Battery Service 0x180F
Read char UUID:   12345678-0000-1000-8000-00805f9b34fb
Write char UUID:  87654321-0000-1000-8000-00805f9b34fb
CCCD descriptor:  00002902-0000-1000-8000-00805f9b34fb   ← standard
MTU requested:    512
```

**UUID squatting**: samiz uses the SIG-assigned 16-bit Battery Service short-form `0x180F` as a 128-bit Service UUID. Non-conformant; can collide with real battery services.

### Role selection (literal, from source)

```kotlin
if (remoteUuid > getDeviceUuid()) "I AM CLIENT" else "I AM SERVER"
```

Each device generates a per-install random UUID stored in `SharedPreferences["advertiser_uuid"]`. NOT the user's Nostr pubkey — samiz has zero Nostr identity awareness at the BLE layer.

### Encryption — NONE at link layer

No `setEncrypted`, no `setAuthRequired`, no bonding. Anyone in BLE range can connect. Confidentiality is whatever the Nostr event already carries (NIP-17 gift-wrap = encrypted; NIP-99 listings = signed plaintext).

## Wire format / fragmentation (`Compression.kt`)

- Application message → `Deflater` compressed
- Compressed payload → split into ≤500-byte chunks
- Per-chunk header: `[chunk_index_byte][payload][num_chunks_byte]`
- Index single byte → caps at 256 chunks × 500 bytes = ~125 KB per message (comfortable for any single Nostr event)

## Application-layer protocol (`BluetoothReconciliation.kt`)

Five message types — JSON arrays modeled after Nostr relay wire protocol:

| Message | Shape |
|---|---|
| `NEG-OPEN` | `["NEG-OPEN", subId, "{}", initialMsgHex]` ← **3rd slot is empty filter — ALL kinds reconciled** |
| `NEG-MSG` | `["NEG-MSG", subId, reconciliationHex]` |
| `EVENT` | `["EVENT", subId, eventJson]` ← full Nostr event JSON, **untouched, signature preserved** |
| `REQ` | `["REQ", subId, filtersJson]` |
| `EOSE` | `["EOSE", subId]` |

`subId` = peer's BLE MAC with colons stripped.

### Sync algorithm — Negentropy

Doug Hoyte's range-based set reconciliation (NIP-77 algorithm). Same primitive strfry, nostr.wine, and nostrdb use for relay-to-relay catch-up.

- Library: `com.vitorpamplona.negentropy.Negentropy`
- Frame size: 50 KB
- Storage: `(createdAt, eventIdHex)` pairs
- Bandwidth proportional to **set difference**, not union

### Event flow on receipt

```kotlin
if (db.exists(event.id)) return                    // dedup by Nostr id (content hash)
db.insert(EventEntity(event, local=1))
nostrClient.publishEvent(event, context)           // → ws://127.0.0.1:4869 (Citrine)
regenerateNegentropy()
broadcastEvent(event, originPeer = null)           // flood to BLE peers EXCEPT origin
```

### Critical absences

- **No TTL or hop limit** — dedup by Nostr id only
- **No store-and-forward window** — `db.applicationDao().deleteAll()` runs on every service start; cold-boot devices forget mesh history
- **No NIP-42 AUTH handling** — flush goes to local Citrine (no auth); to bridge to Pyramid, fGw would need a custom NIP-42 stage
- **No event acceptance filter** — any signed event from any pubkey is accepted, republished, broadcast — **Pyramid AUTH bypass**
- **No NIP-70 enforcement** — protected events leak through the mesh (see fiatjaf's issue #17)

## Identity model

- **fGw user keeps their nsec** — samiz never sees it, never signs
- **BLE peer UUID is per-install random** — decoupled from Nostr identity
- **Same identity model as today**: secp256k1 nsec, no separate Noise key like bitchat

This is the cleanest dimension of samiz vs bitchat: **no third per-user key class**.

## Local-relay subscriptions (`NostrClient.kt`)

```
defaultRelayUrls = ["ws://127.0.0.1:4869"]   ← Citrine default port

samizSync   : all kinds, since = now - 1h
samizPrivate: kind 1059 (NIP-17 gift-wrap), since = now - 2d
samizMeta   : kind 0 (profile metadata), unbounded
```

**Kind handling**: samiz is largely kind-agnostic. NIP-99 (kind 30402), NIP-52, NIP-32, NIP-72 all carried as-is in the 1-hour window — no special handling.

## Library dependencies

- `com.vitorpamplona.ammolite.relays` — Vitor Pamplona's relay client (Amethyst-extracted)
- `com.vitorpamplona.quartz.events.Event` — Amethyst's event types
- `com.vitorpamplona.negentropy.Negentropy` — Negentropy in Kotlin
- Nordic BLE Library (Android BLE)

**No Rust port of any of these libraries exists in 2026.** A Tauri-Rust integration must either embed JNI calls or reimplement.

## Android manifest requirements (`AndroidManifest.xml`)

12 permissions:

`BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `INTERNET`, `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`, `RECEIVE_BOOT_COMPLETED`

Plus `<uses-feature android:name="android.hardware.bluetooth_le" required="true"/>`, plus a `SynchronizationService` declared as `foregroundServiceType="specialUse"` (Google Play policy review required), plus `usesCleartextTraffic="true"` (for Citrine's `ws://127.0.0.1`).

**Application class**: samiz declares `<application android:name=".Samiz">` — its own `class Samiz : Application()` subclass. **Two Application classes cannot coexist in one APK.**

## Use cases (per README)

1. **Individual offline note** — sign + queue while offline, flush on reconnect
2. **Festival scenario** — high-density crowd, internet down, person-to-person spread
3. **Satellite backhaul** — collector-then-publisher pattern (closest to fGw's Powder Keg pattern)

## Empirical envelope (carries from BLE physics)

- Phone-to-phone line-of-sight outdoors: ~30–50 m at 0 dBm BT 4.2/5.x
- Foliage / bodies / pockets: ~10–25 m
- Throughput: ~128 kbps Android theoretical (Punchthrough); higher with 512-MTU in practice; tens-of-kbps real-world
- Per-encounter sync time: connect (~1–3 s) + Negentropy handshake + transfer = **seconds per pair**
- 7-hop cap is more than enough for a Powder Keg site (~80 m radius, 2–3 hops)

## Cross-references

- Required dependency: [Citrine](../../raw/repos/2026-06-09-citrine-android-relay.md)
- Sync algorithm: [NIP-77 Negentropy](../../raw/papers/2026-06-09-nip-77-negentropy.md)
- Tauri 2 integration cost: [samiz integration paths](../concepts/samiz-integration-paths.md)
- Synthesis + verdict: [samiz in fGw](../topics/samiz-in-fgw.md)
- Thesis: [samiz-as-fgw-networking-stack](../theses/samiz-as-fgw-networking-stack.md)
- Compare to: [bitchat-protocol.md](bitchat-protocol.md)
