---
title: "BitChat Protocol Security Report — GitHub Issue #376 (BinaryProtocol.swift static analysis)"
type: article
source: https://github.com/permissionlesstech/bitchat/issues/376
authors: [Sunny Thakur]
date: 2025-08
captured: 2026-06-09
quality: 3
evidence_strength: maintainer-acknowledged-issue (static-analysis report)
relevance: direct
direction: opposes
tags: [bitchat, vulnerability, cvss, parser, binary-protocol, fgw]
summary: "Five vulnerabilities documented in BinaryProtocol.swift parser. VULN-01 CVSS 9.8 buffer overflow on signature decode. VULN-02 CVSS 7.5 integer truncation in payload length. VULN-03 CVSS 7.1 insecure null-byte trimming. Plus DoS via unbounded mention parsing and replay-enabling timestamp validation gap. Report acknowledged by maintainer ('thanks, will look into all'), silently closed 20 days later without confirmed patches. Other in-thread maintainer questioned whether the report was AI-fabricated."
---

# bitchat issue #376 — BinaryProtocol.swift security report

## Disclosure context

Author **Sunny Thakur** filed this report Aug 2025 against the bitchat iOS reference implementation's binary protocol parser. The report is STRIDE-framed and CVSS-scored. Maintainer `jackjackbits` replied "thanks! will look into all" and closed the issue 20 days later without committing visible patches. A second maintainer questioned in-thread whether the report was AI-assisted.

## The five vulnerabilities

### VULN-01 — Buffer overflow in signature handling
- **CVSS 9.8 (Critical)**
- `decode()` reads a 64-byte signature without bounds validation
- Out-of-bounds reads — "Swift's memory safety guarantees are bypassed"
- **Trigger**: any in-radio-range peer can send a crafted packet

### VULN-02 — Integer truncation in payload length
- **CVSS 7.5 (High)**
- Payload length cast to UInt16; payloads >65,535 bytes silently wrap
- Causes parser desynchronization

### VULN-03 — Insecure null-byte trimming
- **CVSS 7.1 (High)**
- Corrupts encrypted payloads
- Leaks null-byte positions in encrypted data — small information-leak primitive

### VULN-04 — Unbounded mention parsing
- **CVSS 6.5 (Medium)**
- 65 KB/message DoS amplification
- Memory exhaustion possible from a single peer

### VULN-05 — Timestamp validation gap
- **CVSS 5.9 (Medium)**
- No bounds-checking on packet timestamps
- Enables replay attacks and ordering disruption

## Provenance caveats

The report is plausibly AI-assisted; one maintainer flagged this in-thread. However:

- The bugs are in the **base packet parser**, not optional features
- Anyone in BLE radio range can send these inputs
- Even discounted as AI-assisted, the class of bugs (parser-level memory unsafety in Swift) is structurally real

## Why it matters for fGw

- fGw's **relay-only Nostr design currently has zero C-style memory-unsafety surface in the network path** (Rust + WebView, plus Pyramid's Go relay). Adopting bitchat introduces a Swift parser whose audit uncovered five CVSS-rated flaws in one file
- A Rust port of the wire format would partially mitigate (no Swift unsafe pointers) but is real engineering cost, not a drop-in
- The maintainer responsiveness pattern (silent close, no public post-mortem, no `SECURITY.md`) is the project-health signal that affects every integrator: fGw would be on its own to triage upstream regressions

## Status as of 2026-06-09

Issue closed without committed patches. No `SECURITY.md` (issue #1081 open since March 2026). 285 open issues on iOS repo, 255 on Android.
