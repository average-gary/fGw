---
title: "samiz BluetoothReconciliation.kt — Negentropy wire format + event flow"
type: paper
source: https://github.com/KoalaSat/samiz/blob/main/mobile/app/src/main/java/com/koalasat/samiz/bluethooth/BluetoothReconciliation.kt
captured: 2026-06-09
authors: [KoalaSat]
quality: 5
evidence_strength: source-code
relevance: direct
direction: explains-how
tags: [samiz, negentropy, wire-format, source, gossip, fgw, pyramid-bypass]
summary: "Application-layer protocol on top of BLE GATT. Five Nostr-relay-shaped JSON messages: NEG-OPEN/NEG-MSG/EVENT/REQ/EOSE. Negentropy session opens with EMPTY filter ('{}') — samiz reconciles ALL events in the local relay's session, no kind filtering at the BLE layer. EVENT messages carry full Nostr event JSON UNTOUCHED — signature preserved end-to-end. NO TTL or hop limit (Nostr-id dedup is intrinsic). NO store-and-forward window — db.applicationDao().deleteAll() on every service start. NO special handling for AUTH-gated relays like Pyramid. NO event acceptance filtering: any well-formed signed event is accepted and republished to local relay."
---

# samiz BluetoothReconciliation.kt — application-layer protocol

## Wire messages (5 types, JSON-array-shaped)

All messages are UTF-8 byte arrays of JSON arrays, modeled after Nostr relay wire protocol:

| Message | Shape | Purpose |
|---|---|---|
| `NEG-OPEN` | `["NEG-OPEN", subId, "{}", initialMsgHex]` | Opens a Negentropy session. **3rd slot is literal "{}" — empty filter, ALL kinds reconciled.** |
| `NEG-MSG` | `["NEG-MSG", subId, reconciliationHex]` | Hash-range reconciliation step |
| `EVENT` | `["EVENT", subId, eventJson]` | Full Nostr event JSON, **untouched** — signature preserved |
| `REQ` | `["REQ", subId, filtersJson]` | Fetches specific events by id |
| `EOSE` | `["EOSE", subId]` | End of stored events |

`subId` = peer's BLE MAC address with colons stripped.

## Negentropy library

```kotlin
val negentropy = com.vitorpamplona.negentropy.Negentropy(
    storage = StorageVector(events.map { (createdAt, eventIdHex) -> ... }),
    frameSize = 50_000
)
```

Frame size 50 KB. Storage is `(createdAt, eventIdHex)` pairs. This is Doug Hoyte's Negentropy via Vitor Pamplona's Kotlin wrapper.

## Event flow on receiving foreign event

```kotlin
fun newExternalEvent(event: Event) {
    if (db.applicationDao().exists(event.id)) return  // dedup by Nostr id (content hash)
    db.applicationDao().insert(EventEntity(event, local = 1))
    nostrClient.publishEvent(event, context)  // publish to ws://127.0.0.1:4869
    regenerateNegentropy()
    broadcastEvent(event, originPeer = null)  // flood to all connected BLE peers EXCEPT origin
}
```

Five steps: dedup → store local → publish to local relay (Citrine) → rebuild Negentropy state → flood to peers.

## What's NOT here (decisive absences)

- **No TTL or hop limit field**. Dedup is purely by Nostr event id (content hash → intrinsic dedup), but there's no traffic-amplification limit beyond Bloom-style avoidance.
- **No store-and-forward window**: `db.applicationDao().deleteAll()` runs on every `BluetoothReconciliation.start()`. Each foreground-service restart starts Negentropy from an empty set — cold-boot devices forget what they've seen historically. Local relay (Citrine) holds longer history; samiz only sees events that arrive during the current service lifetime.
- **No NIP-42 AUTH handling**. samiz republishes received events to a hard-coded `ws://127.0.0.1:4869` Citrine relay (no auth). There is **no flush stage to Pyramid** (or any AUTH-gated relay). To bridge mesh-collected events into Pyramid, fGw would have to add a separate post-mesh stage that does NIP-42 AUTH on samiz's behalf.
- **No event acceptance filter**. Any well-formed signed Nostr event from any pubkey is accepted, republished, and broadcast. Pyramid's allow/ban model is bypassed at the BLE edge.
- **No encryption added on top**. Bytes on the wire are `event.toJson()` plaintext. NIP-17 kind 1059 traverses encrypted (inner payload pre-encrypted); NIP-99 listings (kind 30402) traverse as **plaintext signed JSON readable by any BLE peer in range**.

## Pyramid bypass — the critical security finding

fGw's allow/ban model is enforced at Pyramid (NIP-42 AUTH at relay edge). samiz mesh delivers signed events that:

- Are **valid** Nostr events (signature passes)
- Carry **any pubkey** including non-Powder-Keg-members
- Get **rendered by fGw** before any Pyramid filter runs (the local relay accepts them; fGw subscribes to the local relay; UI displays)

A non-member with a Nostr keypair walking past a pile-build can inject a kind-30402 listing or a kind-1 reply into the local mesh. fGw users see it. Pyramid never had a chance to reject it.

This is **not a samiz bug** — it's a category mismatch between Pyramid's edge-AUTH model and any BLE peer-to-peer transport. Adopting samiz silently erases fGw's moderation gate during exactly the events (offline, in-person) where bad actors are hardest to identify.

## Why it matters for fGw integration

- **Rust port is feasible**: 5 message types, JSON envelopes, `rust-negentropy` (yukibtc) provides the algorithm. The wire is small.
- **NOT feasible without rebuilding moderation**: any "samiz on fGw" path must add a NIP-42 AUTH bridge for flush-to-Pyramid AND add allowlist/denylist filtering at the local relay edge AND surface UI that distinguishes mesh-delivered events from Pyramid-validated events.
- **Cold-boot amnesia** + **session-only memory** means samiz is a real-time gossip transport, not a durable store-and-forward layer. fGw cannot rely on samiz to deliver "the listing Alice posted yesterday."

## Cross-references

- BLE GATT layer: [samiz-bluetoothble-source.md](2026-06-09-samiz-bluetoothble-source.md)
- Local-relay subscription model: [samiz-nostrclient-source.md](2026-06-09-samiz-nostrclient-source.md)
- Pyramid AUTH model that gets bypassed: [pyramid-relay-api.md](../../wiki/references/pyramid-relay-api.md)
- Sync algorithm: [NIP-77 Negentropy](2026-06-09-nip-77-negentropy.md)
