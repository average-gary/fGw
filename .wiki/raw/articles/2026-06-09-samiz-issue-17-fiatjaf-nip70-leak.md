---
title: "samiz Issue #17 — fiatjaf flags NIP-70 protected-event leak via BLE"
type: article
source: https://github.com/KoalaSat/samiz/issues/17
captured: 2026-06-09
authors: [fiatjaf]
date: 2025
quality: 5
evidence_strength: thread-with-named-experts
relevance: direct
direction: opposes
tags: [samiz, nip-70, fiatjaf, privacy-leak, citrine, fgw]
summary: "fiatjaf — the creator of Nostr — opened issue #17 flagging that samiz's interaction with Citrine is 'quite a special one' and currently breaks NIP-70 expectations. In testing fiatjaf had to PATCH Citrine locally to relax NIP-70 protection for localhost — a hack he himself called 'not too good.' Explicitly: 'events could be shared freely via BLE and not escape to the external world' — implying current samiz behavior risks LEAKING NIP-70 ('protected') events out via BLE. Also notes: 'I was going to open a pull request but then I was totally unable to find how' — even Nostr's creator hit contribution friction."
---

# samiz Issue #17 — NIP-70 leak (fiatjaf)

## Source quality

**fiatjaf** is the creator of the Nostr protocol. This is the canonical Nostr authority publicly evaluating samiz. Highest possible expert-aggregation evidence-strength.

## What NIP-70 is

[NIP-70](https://github.com/nostr-protocol/nips/blob/master/70.md) marks events as "protected" — the relay should not allow their distribution beyond the publishing user's intended audience. Marketplace listings (NIP-99) with private location/contact info would naturally carry NIP-70 protection for "this listing should only go to this relay's members."

## What fiatjaf identified

> "events could be shared freely via BLE and not escape to the external world"

Current samiz behavior: the user publishes an event to Citrine; samiz subscribes and reads everything; samiz gossips ALL events to BLE peers. NIP-70-protected events are **not filtered**. They escape via BLE to peers who may not be members of the original audience.

The fix fiatjaf prototyped: patch Citrine to **relax** NIP-70 protection for `localhost` user-agents (so samiz can read them) but rely on samiz to **enforce** protection on outgoing BLE traffic. Quote: "not too good" — fiatjaf himself characterizes the workaround as a hack.

## Status

- Issue opened by fiatjaf
- Maintainer responsiveness: low — fiatjaf says "I was going to open a pull request but then I was totally unable to find how"
- No fix shipped (samiz dormant since 2025-08-11)

## Why it matters for fGw

fGw's marketplace listings can carry sensitive coordinates: pickup location, vendor name, contact npub, transaction details. If fGw users mark their listings with NIP-70 expecting Pyramid to scope distribution to chapter members, samiz **bypasses that scoping** at the BLE edge:

1. Listing is published to local relay
2. samiz reads it (no NIP-70 check)
3. samiz gossips it to BLE peers
4. Peers store it in *their* local relays
5. Peers' fGw clients render it
6. Peers may flush it to *other* relays (not Pyramid)

Privacy regression on the exact threat model fGw should care about. The fix exists in design (samiz could read NIP-70 tags before broadcasting) but is unimplemented.

## Concerning signals

- Privacy regression on a current NIP, identified by Nostr's creator
- Maintainer responsiveness insufficient for fiatjaf to land a fix
- Fix is in samiz code, not Citrine — but samiz is dormant
- Compounds the Pyramid-AUTH-bypass finding from `samiz-reconciliation-source.md`: not only does samiz bypass membership filtering, it also bypasses event-level distribution scoping

## Cross-references

- Pyramid AUTH bypass: [samiz-reconciliation-source.md](../papers/2026-06-09-samiz-reconciliation-source.md)
- Project-health context: [samiz-main-repo.md](../repos/2026-06-09-samiz-main-repo.md)
- NIP-70 spec: https://github.com/nostr-protocol/nips/blob/master/70.md
