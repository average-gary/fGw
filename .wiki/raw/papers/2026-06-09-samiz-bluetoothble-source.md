---
title: "samiz BluetoothBle.kt — exact GATT service definition + role-selection"
type: paper
source: https://github.com/KoalaSat/samiz/blob/main/mobile/app/src/main/java/com/koalasat/samiz/bluethooth/BluetoothBle.kt
captured: 2026-06-09
authors: [KoalaSat]
quality: 5
evidence_strength: source-code
relevance: direct
direction: explains-how
tags: [samiz, ble, gatt, uuid, kotlin, source, fgw, integration-spec]
summary: "Source-level ground truth for samiz BLE protocol. Service UUID is 0000180f-0000-1000-8000-00805f9b34fb — the Bluetooth SIG-assigned 'Battery Service' short-form (0x180F) expressed as 128-bit. samiz IS SQUATTING ON THE BATTERY SERVICE UUID, which can collide with real battery services on phones. Read characteristic 12345678-... write characteristic 87654321-... CCCD descriptor 00002902-... MTU requested 512. Role selection: SERVER UUID > CLIENT UUID literal comparison. Per-device random UUID stored in SharedPreferences (not Nostr pubkey). NO link-layer encryption, NO bonding, NO setEncrypted, NO setAuthRequired — anyone in BLE range can connect to the GATT server."
---

# samiz BluetoothBle.kt — protocol ground truth

## Exact UUIDs (these are the bytes on the wire)

```kotlin
serviceUUID         = 0000180f-0000-1000-8000-00805f9b34fb  // SIG Battery Service short-form 0x180F (squatted)
descriptorUUID      = 00002902-0000-1000-8000-00805f9b34fb  // standard CCCD
readCharacteristic  = 12345678-0000-1000-8000-00805f9b34fb
writeCharacteristic = 87654321-0000-1000-8000-00805f9b34fb
```

**Critical finding — UUID squatting**: samiz uses `0x180F` (Battery Service) as its Service UUID. This is non-conformant: the Bluetooth SIG reserves 16-bit short UUIDs for assigned services. Phones scanning for samiz peers will surface them mixed with real battery devices; some BLE stacks may treat them oddly.

## MTU

```kotlin
gatt.requestMtu(bluetoothBle.mtuSize)  // 512
```

Combined with the chunking layer's 500-byte chunks, this requires every peer to grant 512-byte MTU. If a peer can't, writes fail.

## Role selection

```kotlin
fun connectToDevice(...) {
    if (remoteUuid == null || remoteUuid > getDeviceUuid()) {
        // I AM CLIENT
        device.connectGatt(...)
    } else {
        // I AM SERVER, wait
    }
}
```

Literal `BigInteger > BigInteger` comparison on the per-device random UUID. README's "SERVER UUID > CLIENT UUID" rule is implemented faithfully.

## Per-device identity

```kotlin
val savedUuid = sharedPrefs.getString("advertiser_uuid", null)
val deviceUuid = savedUuid ?: UUID.randomUUID().toString().also {
    sharedPrefs.edit().putString("advertiser_uuid", it).apply()
}
```

Per-install random UUID. **Not** the user's Nostr pubkey. samiz has zero Nostr identity awareness at the BLE layer — that's the local relay's job.

## Six callbacks (the entire BLE surface)

- `onConnection(device, isConnected)`
- `onReadResponse(device, value)`
- `onReadRequest(device): ByteArray?`
- `onWriteRequest(device, value)`
- `onWriteSuccess(device)`
- `onCharacteristicChanged(device, value)` — notify-driven incoming

## Encryption / pairing — NONE

No `setEncrypted(true)`, no `setAuthRequired`, no bonding logic, no pairing. **Anyone in BLE range can connect to the GATT server and exchange events.** Confidentiality at the application layer is whatever the Nostr event already provides (NIP-17 gift-wrap: yes; NIP-99 listing: no, plaintext-but-signed).

## Why it matters for fGw integration

- **The integration spec is small enough to port to Rust**: one custom service + 2 characteristics + CCCD. The Rust crate `btleplug` provides central; **peripheral support is the killer constraint** (same as bitchat) — needs custom Tauri Kotlin plugin on Android, Swift on iOS, `bluster` on Linux desktop.
- **UUID squatting must be fixed** if fGw participates — but doing so breaks interop with existing samiz Android user base (~775 lifetime APK installs)
- **Zero link-layer security** is design-as-intended — fGw must trust the Nostr signature alone for authenticity

## Cross-references

- README: [samiz-readme.md](2026-06-09-samiz-readme.md)
- Application-layer protocol: [samiz-reconciliation-source.md](2026-06-09-samiz-reconciliation-source.md)
- Manifest permissions: [samiz-android-manifest.md](2026-06-09-samiz-android-manifest.md)
- Tauri BLE peripheral gap: [tauri-plugin-blec.md](../repos/2026-06-09-tauri-plugin-blec.md) (already in wiki)
