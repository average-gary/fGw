---
title: "Mesh Messaging in Large-scale Protests: Breaking Bridgefy (CT-RSA 2021 / IACR ePrint 2021/214)"
type: paper
source: https://eprint.iacr.org/2021/214
authors: [Martin R. Albrecht, Jorge Blasco, Rikke Bjerg Jensen, Lenka Mareková]
publication: CT-RSA 2021 / IACR ePrint
date: 2021-02
captured: 2026-06-09
quality: 5
evidence_strength: peer-reviewed-measurement
relevance: direct (closest analog — what happened to the previous "BLE-mesh saves protests" app)
direction: opposes (cautionary)
tags: [bridgefy, ble-mesh, security-audit, deanonymization, mitm, protest, fgw]
summary: "Royal Holloway team reverse-engineered Bridgefy at v2.1.28 / SDK 1.0.6. Voided claims of confidentiality, authentication, and resilience. Demonstrated deanonymization, social-graph reconstruction from BLE advertisements, MITM at key exchange, message decryption (~131,000 chosen ciphertexts), message forgery, and DoS. Published at CT-RSA 2021. Disclosed to Bridgefy April 2020; fixes not shipped per Ars Technica Aug 2020. Same authors broke Bridgefy AGAIN in USENIX Security 2022 after the libsignal retrofit — the lesson that 'using Signal-class crypto' does not save BLE-mesh chat."
---

# Breaking Bridgefy (CT-RSA 2021)

## What this paper is

Peer-reviewed teardown of Bridgefy by Albrecht, Blasco, Jensen, and Mareková (Royal Holloway / Information Security Group). Bridgefy was the BLE-mesh chat app virally adopted by protesters in Hong Kong, Belarus, Thailand, India, and US BLM rallies 2019–2020. The paper voided every security claim Bridgefy made.

## Findings

| Claim | Result |
|---|---|
| Confidentiality | Broken — full message decryption with ~2¹⁷ (~131,000) chosen ciphertexts |
| Authentication | Broken — message forgery, identity spoofing |
| Resilience | Broken — DoS via crafted messages |
| Privacy | Broken — deanonymization + social-graph reconstruction from BLE advertisements |

Specific vulnerability classes:

- **No MAC** on encrypted messages (chosen-ciphertext attacks practical)
- **MITM at key exchange** (TOFU pattern with no out-of-band verification)
- **Downgrade attack** — clients accept legacy unencrypted mode
- **Key Compromise Impersonation (KCI)**
- **Replay**
- **BLE-advertisement leakage** allowing passive social-graph reconstruction

## Adoption arc (relevant to bitchat)

- Bridgefy at peak: **1.7M downloads by Aug 2020**
- **Hong Kong 2019**: 60,000 installs in 7 days, +3,685% spike
- Recommended to protesters under names of foundations, NGOs, journalists
- Disclosure April 2020; fixes "not yet shipped" per Ars Technica Aug 2020

## The follow-up (USENIX Security 2022)

The same team published "Breaking Bridgefy, Again: Adopting libsignal is not enough" in USENIX Security 2022:

- After 2020, Bridgefy adopted libsignal — the same group broke it again in 2021
- ~50% practical confidentiality break on encrypted messages
- User tracking still intact
- Unauthenticated broadcasts allow impersonation
- MITM at initial TOFU exchange
- DoS via crafted messages
- Verbatim: "This attack in no way threatens Signal or libsignal" — it attacks how Bridgefy *uses* it

## The lesson for bitchat

> The framing/identity/store-and-forward layer is where mesh chat dies, and adopting Signal-class crypto does not save you from a broken identity binding.

bitchat uses Noise (a real upgrade over Bridgefy's homebrew). But:

- bitchat's **identity binding** is exactly what Alex Radocea broke in the July 2025 MITM PoC
- bitchat's **BLE advertisement** is service-UUID + nothing else — better than Bridgefy but the active-discovery dance is still observable
- bitchat's **store-and-forward** is the 100-msg-per-peer × 24-hour outbox in MessageRouter — substantially weaker than what production e2ee messengers offer

## Relevance to fGw

The Bridgefy literature is the canonical reference any "should we adopt a BLE mesh chat protocol" decision must engage with. It's a 12-year arc (FireChat 2014 → Bridgefy 2019 → bitchat 2025) where:

1. Every BLE-mesh-chat app adopted at scale has been broken
2. Every fix-in-flight has subsequently been broken again
3. The pattern is **viral protest adoption → late audit → late patch → next-generation app repeats the pattern**

For Powder Keg, the relevant question is not "did the bugs in Bridgefy 1.0 carry to bitchat?" — they didn't, the crypto choices are different — but **"is this category mature enough to bet a small chapter's coordination on?"** The Bridgefy literature is the primary reason the answer is "not yet."

## Concerning signals

- Bridgefy's CEO publicly disputed the paper before the second teardown — pattern of denial-then-fix
- Same researchers haven't yet published a bitchat audit, but Trail of Bits' 2025-07-18 commentary explicitly invokes their methodology
- The "ship hyped, audit later" cycle continues
