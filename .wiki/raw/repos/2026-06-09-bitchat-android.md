---
title: "bitchat-android — official Android port (permissionlesstech/bitchat-android)"
type: repo
source: https://github.com/permissionlesstech/bitchat-android
captured: 2026-06-09
language: Kotlin
license: GPL-3.0
stars: 5500
releases: 33
latest_release: 2026-03-30
quality: 5
evidence_strength: spec/primary
relevance: direct
direction: explains-how
tags: [bitchat, android, kotlin, nordic-ble-library, foreground-service, fgw, gpl-tension]
summary: "Official Android port of bitchat. Kotlin/Java + Jetpack Compose + Nordic BLE Library. Claims 100% wire-protocol compatibility with iOS. GPL-3.0 license — viral if linked into fGw, forcing fGw into separate-process IPC, clean-room Rust impl, or going GPL itself. AndroidManifest requires ~10 permissions plus a foreground service plus BootCompletedReceiver."
---

# bitchat-android

## Project state (2026-06-09)

- **5,500 stars, 33 releases, latest 1.7.2 (Mar 30 2026)** — actively maintained
- Kotlin / Java / Jetpack Compose
- Uses the **Nordic BLE Library** (not raw Android APIs)
- License: **GPL-3.0** (note tension with iOS Unlicense — see below)
- Distributed via Play Store, F-Droid, and APK

## Architectural shape

- `BluetoothMeshService.kt` + `BluetoothConnectionManager.kt` handle dual roles (central + peripheral)
- **No Rust / no JNI** — pure Kotlin against Nordic BLE Library
- 100% binary protocol compatibility with iOS (same 13-byte header, same UUIDs, same fragmentation, same crypto)

## AndroidManifest required permissions

Runtime / permission-prompt block:

- `BLUETOOTH_ADVERTISE` (Android 12+)
- `BLUETOOTH_CONNECT`
- `BLUETOOTH_SCAN` (with `neverForLocation` flag possible but filters some BLE beacons)
- `ACCESS_FINE_LOCATION` (BLE-scan dependency on Android ≤11)
- `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_CONNECTED_DEVICE` (Android 14+ requires this declared specifically)
- `FOREGROUND_SERVICE_LOCATION`
- `FOREGROUND_SERVICE_DATA_SYNC`
- `POST_NOTIFICATIONS`
- `RECEIVE_BOOT_COMPLETED`
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (user must accept battery-opt opt-out)

Hardware: `<uses-feature android:name="android.hardware.bluetooth_le" required="true"/>`

## Background-service architecture

- `MeshForegroundService` runs the mesh
- `BootCompletedReceiver` restarts after reboot
- **No background mesh without a foreground service** — Android 14+ structurally enforces a persistent user-visible notification

## License tension

The iOS reference is **Unlicense** (public domain). The Android port is **GPL-3.0**. If fGw statically links bitchat-android code, fGw becomes GPL-3.0. Three options:

1. **Separate process / IPC**: bitchat-android runs as a separate app, fGw talks to it via Intents — preserves license isolation, doubles install footprint
2. **Clean-room Rust impl** against the Whitepaper + BLE GATT spec — months of work, no GPL exposure
3. **Go GPL-3.0** for fGw itself — affects redistribution rights for chapter forks

## Concerning signals

- Standalone-app shape, **not packaged as an Android library** — there's no `bitchat.aar` to drop into another app
- 255+ open issues
- Foreground-service requirements increasingly scrutinized at Play Store submission (Google reviews `FOREGROUND_SERVICE_*` types)
- Battery optimization opt-out adds a UX prompt that materially reduces real-world adoption

## Relevance to fGw

This is the **template** for fGw's Android target if Path B (native BLE mesh) is pursued:

- fGw's existing `BUILD-ANDROID.md` and signing scaffold already grapple with `tauri android init` clobbering the manifest
- Adding bitchat means the fGw `AndroidManifest.xml` grows ~10 permissions + a foreground service + a `BootCompletedReceiver`
- Tauri's plugin model would need a custom Kotlin plugin (calling Nordic BLE Library) bridged via `@tauri-apps/api`'s `Channel` to push received packets to React
- **Doing this in pure Rust is not viable on Android** — peripheral-mode BLE on Android requires Java/Kotlin platform APIs

The license + manifest + foreground-service triad makes the Android integration a project, not a dependency add.
