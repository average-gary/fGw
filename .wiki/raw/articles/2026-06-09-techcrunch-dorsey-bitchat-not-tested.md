---
title: "Jack Dorsey says his 'secure' new Bitchat app has not been tested for security (TechCrunch)"
type: article
source: https://techcrunch.com/2025/07/09/jack-dorsey-says-his-secure-new-bitchat-app-has-not-been-tested-for-security/
authors: [Lorenzo Franceschi-Bicchierai]
publication: TechCrunch
date: 2025-07-09
captured: 2026-06-09
quality: 4
evidence_strength: tier-1-tech-press primary maintainer admission
relevance: direct
direction: opposes
tags: [bitchat, dorsey, security-disclaimer, weekend-project, fgw, project-health]
summary: "Three days after bitchat launch, Dorsey added a GitHub disclaimer: 'This software has not received external security review and may contain vulnerabilities.' Independent researcher Alex Radocea's verbatim verdict: 'I'd argue it has received external security review, and it's not looking good.' Establishes bitchat's engineering culture — viral marketing first, security review second."
---

# TechCrunch — Dorsey admits bitchat not security-tested

## Source quality

Lorenzo Franceschi-Bicchierai is the convergence anchor that Trail of Bits, Supernetworks, and the GitHub security issues all reference downstream. Tier-1 tech press with primary quotes from Dorsey and the named security researcher.

## Key admissions

### Post-hoc disclaimer

After researchers shamed the project, Dorsey added a GitHub README disclaimer:

> "This software has not received external security review and may contain vulnerabilities. Do not rely on it for sensitive communications."

Plus a "Work in progress" tag.

### Radocea's response

> "I'd argue it has received external security review, and it's not looking good."

Radocea's MITM PoC was filed; Dorsey initially closed it as "completed" without explanation. Later allowed structured GitHub bug reports.

### Buffer-overflow corroboration

A separate contributor flagged a buffer overflow independently of issue #376 — corroborates the binary-protocol class of bugs documented later.

## Project-health signals

- **Disclaimer added AFTER launch** — only after researchers shamed the project
- **First response to vulnerability disclosure was to mark it resolved without explanation**
- The article frames bitchat as "a viral marketing object first, a secure messenger second"
- Built over a single weekend — origin is the cause of the flaws

## Why it matters for fGw

Adopting bitchat means **inheriting that engineering posture**, not just the code.

fGw's existing posture is the opposite:
- Rust core (memory-safe)
- Single protocol (Nostr) over a permissioned relay (Pyramid)
- Deliberate, small, with comprehensive SPECs and a wiki audit trail
- Ship-then-test does not match how fGw operates

If fGw integrates bitchat, the upstream cadence (ship features, fix flaws after disclosure) will leak into fGw's release process. Either fGw forks and freezes a known-good revision (then carries the maintenance burden) or tracks upstream and inherits the cadence.

## Concerning signals

- Pattern of denial-then-fix on disclosure (closed PoC as "completed")
- Disclaimer was reactive, not proactive
- Even after Noise XX adoption, the ship-then-fix cadence continued (issue #376 closed silently, no SECURITY.md as of 2026-03)
