---
title: "tauri-plugin-blec — Tauri 2 Bluetooth LE client plugin"
type: repo
source: https://github.com/mnlphlp/tauri-plugin-blec
captured: 2026-06-09
language: Rust + Kotlin (Android plugin)
license: MIT OR Apache-2.0
stars: 223
commits: 172
latest_version: 0.12+
quality: 4
evidence_strength: spec/primary (well-maintained tooling)
relevance: direct (defines the BLE ceiling for fGw on Tauri 2)
direction: nuances (gives client-side BLE; not enough for mesh participation)
tags: [tauri, ble, btleplug, android, bluest, fgw, plugin, central-only]
summary: "Tauri 2 BLE-client plugin. Cross-platform (Win/macOS/Linux/iOS/Android) via btleplug on desktop and a native Tauri-Android implementation. CENTRAL-ONLY — no peripheral/advertising mode. This is the killer constraint for native bitchat participation: a fGw node can DISCOVER bitchat peers but cannot BE DISCOVERED by other bitchat nodes via advertisement. Real mesh participation requires a custom Tauri plugin per platform (Kotlin + Nordic BLE Library on Android, Swift + CoreBluetooth on iOS, bluster on Linux, WinRT on Windows)."
---

# tauri-plugin-blec

## Project state (2026-06-09)

- 223 stars, 172 commits, ≥ v0.12
- License: dual MIT / Apache-2.0
- Single maintainer (mnlphlp)

## Capability

| Platform | Backend | Central (client) | Peripheral (advertise) |
|---|---|---|---|
| Windows | btleplug | ✅ | ❌ |
| macOS | btleplug | ✅ | ❌ |
| Linux | btleplug | ✅ | ❌ |
| iOS | btleplug | ✅ | ❌ |
| Android | native Tauri-Android impl | ✅ | ❌ |
| Web | n/a | n/a | n/a |

Central/client only. **No peripheral/advertising mode** — confirmed in README and tracked as an open feature request.

## Why this is the killer constraint

bitchat requires **every node to advertise** so peers can find it. Pure central mode means:

- A fGw user's device **cannot be discovered** by other bitchat nodes
- A fGw user **cannot relay** packets in the mesh
- A fGw user can only **passively scan** and connect to peers it has already discovered

For a mesh of N bitchat-native phones plus 1 fGw client, the fGw client is a leaf — it consumes mesh traffic but contributes nothing. With multiple fGw clients in the same area, **none of them can find each other** (no advertiser).

## What it would take to fix

The README points to `bluster` for Linux peripheral mode (BlueZ-only). For Android, the path is:

1. Write a **custom Tauri 2 Kotlin plugin** wrapping the Nordic BLE Library (the same dependency bitchat-android uses)
2. Add ~10 manifest permissions including `BLUETOOTH_ADVERTISE` + `FOREGROUND_SERVICE_CONNECTED_DEVICE`
3. Implement a `MeshForegroundService` to keep advertising alive when the app is backgrounded
4. Bridge received packets to JS via Tauri `Channel`

For iOS: Swift plugin wrapping `CBPeripheralManager`. For desktop: bluster (Linux), Swift bridge (macOS), WinRT (Windows). All three desktop branches are separate codebases.

## Other Tauri BLE plugins surveyed

| Plugin | Stars | Status |
|---|---|---|
| 26F-Studio/tauri-plugin-bluetooth | <5 | abandoned |
| ParticleG/tauri-plugin-bluetooth-le | <5 | early |
| empathic-ai/tauri-plugin-ble | <5 | early |

**None offer peripheral mode.** btleplug itself disclaims peripheral mode in its README and points to `bluster` (Linux/BlueZ only).

## Relevance to fGw

`tauri-plugin-blec` is sufficient for **Path A** (Nostr-tunneled bitchat interop with no BLE) — it isn't even needed there. For **Path B** (native BLE mesh), it gets fGw the central side; the peripheral side is greenfield work per platform.

The most defensible fGw approach if BLE mesh is actually wanted:

1. Use `tauri-plugin-blec` as-is for the central side
2. Build a custom Kotlin + Nordic BLE Library plugin for Android peripheral
3. Defer iOS until the Apple Developer account is sorted (per alpha-bundle plan)
4. Skip Web target entirely (Web Bluetooth is central-only, no background, no mesh)
5. Skip desktop peripheral until/unless a Powder Keg use case demands it

## Concerning signals

- Single maintainer
- Central-only is the structural gap, not a bug
- No off-the-shelf cross-platform Rust BLE peripheral exists in 2026

## Cross-references

- See `bitchat-main-repo.md` for the BLE GATT UUIDs and the dual-role requirement
- See `bitchat-android.md` for the manifest permissions and foreground-service template
