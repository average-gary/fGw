---
title: "greenart7c3/Citrine — Nostr relay for Android (samiz's hidden dependency)"
type: repo
source: https://github.com/greenart7c3/Citrine
captured: 2026-06-09
language: Kotlin
license: MIT
stars: 126
releases: 60
latest_release: v2.0.0 (2026-03)
last_push: 2026-06-03
quality: 4
evidence_strength: spec/primary
relevance: direct
direction: nuances
tags: [citrine, greenart7c3, nostr, relay, android, samiz, dependency, fgw]
summary: "Citrine is the Android-resident Nostr relay that samiz REQUIRES at ws://127.0.0.1:4869. By greenart7c3 (Amethyst contributor — fiatjaf also commits). 126 stars, 60 releases, latest v2.0.0 March 2026, last push 2026-06-03 — VERY actively maintained (unlike samiz). Manages port/icon/start-stop, persists events locally, rebroadcasts to upstream relays on reconnect. Has its own foreground service + ContentProvider IPC. Adopting samiz pulls Citrine in as a third APK on every phone. ALSO: Citrine alone (without samiz) gives a phone-as-LAN-relay model that may obviate samiz for planned events."
---

# Citrine — the third dependency samiz hides

## Project state (2026-06-09)

- **126 stars, 60 releases**
- Latest release: v2.0.0 (March 2026)
- **Last push: 2026-06-03** — actively maintained (vs samiz at 10 months dormant)
- Maintainer: **greenart7c3** (Amethyst contributor; fiatjaf also commits)
- License: MIT-equivalent permissive

## What Citrine is

A full Nostr relay running as an Android foreground service. Manages:

- Port (default 4869)
- Start/stop lifecycle
- Event persistence (Room DB)
- Internet rebroadcast on reconnect (its own outbox semantics)
- Database import/export
- Per-account export
- ContentProvider IPC for other Android apps

## Why this matters

samiz hard-codes `ws://127.0.0.1:4869` and crashes if Citrine isn't running. **samiz is one half of a two-app architecture; Citrine is the other half.**

For fGw to "add samiz" the actual installation footprint per phone is:

1. fGw (Tauri Android APK)
2. samiz (Kotlin standalone APK)
3. Citrine (Kotlin standalone APK from a different maintainer)

= 3 APKs, 3 foreground services, 3 persistent notifications, 3 sets of permission grants per user.

## The orthogonal trust signal

Citrine being maintained by a different Amethyst-team developer is actually **good news** for samiz's robustness model — it means samiz's local-relay assumption is upheld by an independently-maintained, deeply-trusted, more-active project. The KoalaSat-only bus factor doesn't extend to Citrine.

But: **adopting samiz means inheriting two upstream projects, not one.** fGw maintains a relationship with both KoalaSat (dormant) and greenart7c3 (active).

## The alternative architecture: Citrine alone

Without samiz, Citrine still solves a fraction of fGw's offline story:

- Steward brings phone with Citrine running on event-day Wi-Fi hotspot
- All fGw clients on the LAN add `ws://<steward-ip>:4869` as a relay
- Events propagate via Citrine while everyone's on the hotspot
- Citrine flushes to Pyramid when uplink returns

This is **Nostr-native, cross-platform, no BLE, no foreground-service-on-every-phone, no 3-app stack**. It's also a subset of the strfry-on-Pi pattern with even less hardware.

## Why it matters for fGw

- Adopting samiz means adopting Citrine. The integration footprint is 3x worse than the original thesis suggested.
- BUT: Citrine alone (without samiz) is a credible alternative for *planned* events at a fixed location. It gives the relay-on-LAN benefit without BLE.
- Citrine is maintained; samiz is not. If fGw is going to take a dependency on KoalaSat-ecosystem code, Citrine is the safer pick.

## Concerning signals

- Citrine is an Android Kotlin standalone APK — same library-shape problem as samiz for embedding inside fGw
- ContentProviders are an Android-only IPC mechanism — doesn't help fGw's web/desktop targets
- Citrine README does not mention samiz by name; the integration is implied by samiz docs only

## Cross-references

- Required-by: [samiz-main-repo.md](2026-06-09-samiz-main-repo.md)
- Local-relay subscription model: [samiz-nostrclient-source.md](../papers/2026-06-09-samiz-nostrclient-source.md)
- Alternative pattern: strfry on a Pi at events (cited in [bitchat-in-fgw.md](../../wiki/topics/bitchat-in-fgw.md))
