---
title: "Why: crash-reports"
type: project-rationale
created: 2026-05-22
---

# Why ship Nostr-DM crash reporting?

The alpha-bundle plan (output/projects/alpha-bundle/) flagged crash +
telemetry as Open Question #4: alpha runs blind on errors. Sentry-style
SaaS reporting violates the chapter sovereignty principle (see
wiki/topics/pyramid-in-fgw.md) — it sends crash payloads to a
third-party operator the user never consented to. Nostr DMs solve this
cleanly: end-to-end encrypted, infrastructure the user already trusts
(the chapter relay), no new accounts.

The original framing ("ephemeral key per report so the maintainer can't
see who sent it") collided with the chapter relay's allowlist gate —
unallowlisted ephemeral pubkeys can't publish to chat.virginiafreedom.tech.
That collapses the design to: real signer, existing NIP-17 pipeline,
opt-in per-report on next boot. The "ephemeral" language survives in the
sense that the existing kind-1059 outer wrap already generates an
ephemeral key per send (SPEC-030 / src/lib/dm.ts wrapForRecipient) and
discards it at scope exit; that's the only ephemeral-key surface area
the new feature interacts with.

Scope is **alpha-class diagnostic only**: catch JS errors and
unhandledrejections, redact PII, queue across boots, prompt the user
once per crash. Native Rust panics, OS-level tombstones, and signal
crashes are out of scope — they require platform-specific crash
reporters that aren't worth the complexity for ≤10 alpha testers.
