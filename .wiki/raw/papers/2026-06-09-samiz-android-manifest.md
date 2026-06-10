---
title: "samiz AndroidManifest.xml — exact permissions + foreground service declaration"
type: paper
source: https://github.com/KoalaSat/samiz/blob/main/mobile/app/src/main/AndroidManifest.xml
captured: 2026-06-09
authors: [KoalaSat]
quality: 5
evidence_strength: source-code
relevance: direct
direction: explains-how
tags: [samiz, android, manifest, permissions, foreground-service, special-use, fgw]
summary: "Definitive Android-side integration cost. samiz declares 8 BLE/location permissions, 5 service-related permissions, plus FOREGROUND_SERVICE_SPECIAL_USE (which Google Play requires policy review for). SynchronizationService runs as foregroundServiceType='specialUse' with subtype text 'Run a foreground service to check for notes and keep the connection to the relays active'. usesCleartextTraffic='true' because Citrine is ws://127.0.0.1:4869. Application is com.koalasat.samiz with its own Application class — incompatible with embedding inside another app's process."
---

# samiz AndroidManifest.xml — Android integration cost

## Required runtime permissions (12)

| Permission | Why |
|---|---|
| `BLUETOOTH` | Legacy BLE basics |
| `BLUETOOTH_ADMIN` | Legacy BLE admin |
| `BLUETOOTH_SCAN` | Android 12+ runtime: scan for peers |
| `BLUETOOTH_CONNECT` | Android 12+ runtime: connect to GATT |
| `BLUETOOTH_ADVERTISE` | Android 12+ runtime: advertise as peripheral |
| `ACCESS_FINE_LOCATION` | Required for BLE-scan results pre-S |
| `ACCESS_COARSE_LOCATION` | Same |
| `INTERNET` | Republish to internet relays when reconnected |
| `POST_NOTIFICATIONS` | Foreground-service notification |
| `FOREGROUND_SERVICE` | Run a foreground service |
| `FOREGROUND_SERVICE_SPECIAL_USE` | Android 14+ explicit FGS subtype |
| `RECEIVE_BOOT_COMPLETED` | Restart mesh after device reboot |

User-facing prompts: minimum 3 BT runtime grants + persistent FGS notification + battery-optimization opt-out (per OEM, often manual).

## Foreground service declaration

```xml
<service
    android:name=".service.SynchronizationService"
    android:foregroundServiceType="specialUse"
    android:exported="false">
    <property
        android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
        android:value="Run a foreground service to check for notes and keep the connection to the relays active"/>
</service>
```

`FOREGROUND_SERVICE_SPECIAL_USE` is the Android 14+ declaration for foreground services that don't fit the standard categories. **Google Play requires policy review** for this type — the publisher (i.e. fGw) must justify it at submission. samiz's existing justification text is mesh-relay-specific.

`connectedDevice` would be more idiomatic for BLE mesh — but samiz uses `specialUse`, presumably because the bridge-to-local-relay-and-internet pattern doesn't fit `connectedDevice`'s "single peripheral" assumption.

## Application class

```xml
<application
    android:name=".Samiz"
    android:label="@string/app_name"
    android:usesCleartextTraffic="true"
    ...>
```

samiz owns its own `class Samiz : Application()` subclass. This is the **single most important integration blocker**: an Android APK can have only one `Application` class. fGw's Tauri 2 Android target also has one. **Two Application classes cannot coexist in one APK.**

`usesCleartextTraffic="true"` is required because Citrine runs as `ws://127.0.0.1:4869` (no TLS for localhost). fGw would have to enable cleartext traffic for the localhost domain, which Tauri 2 does not do by default.

## Why it matters for fGw integration

This manifest is the integration-shape ceiling. Three options:

1. **Bundle samiz as a separate APK** — ships fGw + samiz + Citrine (3 APKs per phone). UX disaster: 3 install prompts, 3 persistent notifications, ~12 runtime permission grants.
2. **Fork samiz, strip Application class, expose as AAR library** — months of work for a single-author maintainer. Fork carries lifetime maintenance.
3. **Reimplement samiz's protocol in Rust** as a Tauri plugin — the only path that respects fGw's Tauri-host-architecture. Loses interop with existing samiz Android user base.

There is no Tauri 2 plugin slot for hosting a foreign Application class. The Tauri runtime owns `Application`, `MainActivity`, and webview lifecycle.

## fGw alpha-bundle implications

fGw's `BUILD-ANDROID.md` already warns that `tauri android init` clobbers signing config. Adding samiz's 12 manifest permissions + FGS_SPECIAL_USE + custom service makes the scaffold even more sensitive to regeneration. Each `tauri android init` would have to be followed by manual manifest re-merge.

## Cross-references

- Application class blocker context: [samiz-main-repo.md](../repos/2026-06-09-samiz-main-repo.md)
- Compare to bitchat-android manifest: [bitchat-android.md](../repos/2026-06-09-bitchat-android.md)
- Tauri 2 plugin model: [tauri-plugin-blec.md](../repos/2026-06-09-tauri-plugin-blec.md)
- fGw alpha-bundle Android: see `BUILD-ANDROID.md` in repo root (warning about `tauri android init` clobbering)
