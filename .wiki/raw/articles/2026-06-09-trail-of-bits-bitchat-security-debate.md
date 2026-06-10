---
title: "Building Secure Messaging is Hard: A Nuanced Take on the Bitchat Security Debate (Trail of Bits)"
type: article
source: https://blog.trailofbits.com/2025/07/18/building-secure-messaging-is-hard-a-nuanced-take-on-the-bitchat-security-debate/
authors: [Trail of Bits]
publication: Trail of Bits Blog
date: 2025-07-18
captured: 2026-06-09
quality: 5
evidence_strength: expert-aggregation
relevance: direct
direction: opposes (technically — labels itself nuanced)
tags: [bitchat, security, audit, mitm, forward-secrecy, key-verification, trail-of-bits]
summary: "Trail of Bits assesses bitchat's pre-Noise security posture. Confirms Alex Radocea's MITM via broken identity authentication; documents session-level static keys (no Double Ratchet); states 'Authentication and key verification remain unsolved at scale.' Verdict: 'Users should absolutely not rely on Bitchat for sensitive communications in its current state.' Frames Dorsey's Noise migration as a fix-in-flight, not a shipped guarantee."
---

# Trail of Bits — Bitchat security debate

## Source quality

Trail of Bits is a tier-1 security firm. This is a blog assessment (not a formal audit) but synthesizes the Radocea PoC, Franceschi-Bicchierai TechCrunch reporting, and contemporaneous engineering discussion.

## Findings

### Two fundamental design flaws

> "Two fundamental design flaws, not surface bugs."

1. **Broken identity authentication enabling MITM/impersonation** — working PoC by Alex Radocea
2. **No per-message forward secrecy** — static keys per session, no Double Ratchet

### Authentication remains unsolved

> "Authentication and key verification remain unsolved at scale."

bitchat's TOFU + QR fingerprint model relies on users actually verifying. Signal data shows almost no one does. Decentralized key transparency for serverless apps "has not been deployed at scale."

### Maintainer admission

Dorsey told TechCrunch the app "had not been reviewed or tested for security issues prior to its launch" and was a weekend project.

### Verdict (verbatim)

> "Users should absolutely not rely on Bitchat for sensitive communications in its current state."

## What changed after this post

bitchat adopted the Noise Protocol Framework (Noise XX) — see `bitchat-bring-the-noise.md`. Trail of Bits framed the migration positively but emphasized the original threat model was inadequate.

## Why it matters for fGw

Even after the Noise migration:

- The **engineering culture** that ships unaudited cryptography on a celebrity-driven project is what an integrator inherits, not just the code
- Even fixed-up bitchat ships a threat model that explicitly excludes metadata, BLE tracking, and traffic analysis (per BRING_THE_NOISE.md) — categories that matter for a Powder Keg WV compost-marketplace's vendor/buyer privacy
- The pattern of "ship hyped, audit later" continued past v1 — issue #376 with no triage, no SECURITY.md (#1081 open since March 2026)

## Concerning signals from Trail of Bits' framing

- Trail of Bits commissioned no audit themselves — this is contextualization of Radocea's findings, not new evidence
- Acknowledgment that decentralized KT remains unsolved at scale means **bitchat's identity story will be weak even after Noise** unless users actively verify fingerprints

## Relevance to fGw

Two takeaways:

1. fGw's existing Nostr-only posture (Rust core, Pyramid relay, secp256k1 pubkey identity validated by NIP-42 AUTH) is materially stronger on identity than bitchat's TOFU-based Noise XX, because the relay enforces who's a member
2. Adopting bitchat means tracking a project that ship-then-fixed its core crypto and continues to publish features faster than reviews — that posture is not compatible with fGw's "small, single-protocol, deliberate" engineering culture
