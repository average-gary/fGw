---
title: "KoalaSat/samiz — main repository (BLE mesh for Nostr notes)"
type: repo
source: https://github.com/KoalaSat/samiz
captured: 2026-06-09
language: Kotlin
license: MIT
stars: 78
forks: 1
open_issues: 1
contributors: 2
total_commits: 112
total_apk_downloads: ~775
created: 2024-11-09
last_push: 2025-08-11
latest_release: v0.0.7-alpha (2025-08-04)
quality: 5
evidence_strength: spec/primary
relevance: direct
direction: nuances
tags: [samiz, koalasat, ble, nostr, mesh, android, kotlin, citrine, fgw, alpha, dormant]
summary: "KoalaSat's BLE mesh for Nostr notes — Android-only Kotlin standalone application (not a library). 78 stars, 1 fork, 2 contributors (KoalaSat 111 + deerwhisper2310 1), 7 alpha releases (v0.0.1→v0.0.7) all in 2025. Last push 2025-08-11 — ~10 months dormant at this writing. Total APK downloads across all releases ≈775, latest release 268 downloads. MIT licensed. Funded in part by OpenSats. Designed as 'communication layer between local relays' — REQUIRES Citrine (greenart7c3/Citrine, separate APK) running on the device to function. Distribution: GitHub Releases / Obtainium / Zapstore. NOT on F-Droid."
---

# samiz — main repository

## Project state (snapshot 2026-06-09)

- **78 stars, 1 fork, 2 contributors (KoalaSat 111 commits + deerwhisper2310 1 commit), 1 open issue, 1 open PR (maintainer's own "Raspberry Pi app" branch unmerged since 2025-08-06)**
- 7 releases, all in 2025: v0.0.1-alpha (Mar 30) → v0.0.7-alpha (Aug 4)
- **Last push 2025-08-11 — approximately 10 months dormant** as of 2026-06-09
- Total lifetime APK downloads ≈775 across all releases; latest release v0.0.7-alpha = 268 downloads
- 98.3% Kotlin
- License: **MIT** (Copyright © 2024 KoalaSat) — fully permissive
- OpenSats grant cited in community references
- Bus factor = 1 (KoalaSat = 111/112 commits)

## What samiz is — verbatim from README

> "Samiz is just the communication layer between local relays."

It is **not** a chat app, **not** a Nostr client, and **not** a relay. It is a BLE bridge that gossips events between **local Nostr relays** running on each user's device.

Required architecture:

```
[Nostr client (Amethyst, etc.)] → publishes → [Local Relay (Citrine, ws://127.0.0.1:4869)] ← subscribes ← [samiz BLE bridge] ↔ BLE ↔ [other phone's samiz] ↔ local relay ↔ Nostr client
```

Three apps per phone. fGw cannot import samiz; users must install fGw + samiz + Citrine.

## Distribution

- GitHub Releases (raw APK)
- Obtainium
- Zap.Store
- **NOT on F-Droid** (verified by direct search 2026-06-09)
- No Google Play release

For an Android privacy/sovereignty app, F-Droid absence is a notable trust-pipeline gap (no reproducible-build verification).

## KoalaSat track record

KoalaSat ships single-author Nostr/Android utility apps:
- **RoboSats** (P2P BTC exchange, ~997 stars — flagship; KoalaSat is a contributor not owner)
- **Pokey** (Nostr push notifications for Android, 56 stars)
- **Nostros** (411-star RN Nostr client, **archived Feb 2025**)
- **samiz** (this repo, 78 stars, dormant since Aug 2025)

Pattern: builds Nostr-Android infra; ships to working alpha; maintains sporadically; redirects attention. Nostros archival is the precedent for a KoalaSat Nostr-Android project being mothballed.

**KoalaSat is NOT the Citrine maintainer.** Citrine is by greenart7c3 (Amethyst contributor). samiz merely *requires* Citrine.

## Use cases (per README)

1. **Individual offline note** — sign and queue a Nostr event while offline; flush when reconnected
2. **"Festival scenario"** — Alice's cookie-sale updates spread person-to-person at an event with no internet
3. **"Satellite backhaul"** — Faythe collects events at the festival, later uploads via satellite to global relays

Use Case 3 is the closest to fGw's Powder Keg scenario, but it requires a member with satellite connectivity to be present.

## Activity timeline

- 2024-11-09: repo created (initial commit + README)
- ~4.5 months silence
- 2025-03-30: v0.0.1-alpha — first real release (TESTING ONLY)
- 2025-04-20: v0.0.2-alpha — multi-device mesh + Negentropy added
- 2025-04-29: v0.0.3-alpha — "FIRST FULL VERSION"
- 2025-05-05: v0.0.4-alpha — broadcast 1-hour-back history + user metadata
- 2025-05-28: v0.0.5-alpha — Logs + Help views
- 2025-06-23: v0.0.6-alpha — Bluetooth-off crash fix
- 2025-08-04: v0.0.7-alpha — user-agent + armv7/v8 APKs
- **2025-08-11: last push** (10 months dormant)
- 2025-07-04: bitchat repo created → bitchat moment absorbs BLE-mesh mindshare

## Concerning signals

- 10-month dormancy with no commits since the bitchat surge
- Perpetual `*-alpha` versioning — no v1.0
- Bus factor 1
- Maintainer's own next-step PR (#22 "Raspberry Pi app") unmerged
- Single fork (deerwhisper2310, also dormant since April 2025)
- Crash on Pixel 9 / GrapheneOS / Android 15 in v0.0.5 (issue #14) — basic Android-12 runtime-permission bug shipped to users
- fiatjaf-flagged NIP-70 leak in samiz↔Citrine integration (issue #17)

## Cross-references

- See [samiz protocol reference](../../wiki/references/samiz-protocol.md) for wire format
- See [samiz integration paths](../../wiki/concepts/samiz-integration-paths.md) for Tauri 2 cost analysis
- Synthesis: [samiz-in-fgw](../../wiki/topics/samiz-in-fgw.md)
- Compare to: [bitchat-main-repo.md](2026-06-09-bitchat-main-repo.md)
- Required dependency: [Citrine](2026-06-09-citrine-android-relay.md)
- Sync algorithm spec: [NIP-77 Negentropy](../papers/2026-06-09-nip-77-negentropy.md)
