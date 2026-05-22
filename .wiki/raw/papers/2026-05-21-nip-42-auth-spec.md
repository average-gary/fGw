---
title: "NIP-42 — Authentication of clients to relays (verbatim)"
type: source-paper
source_url: "https://github.com/nostr-protocol/nips/blob/master/42.md"
authors: ["nostr-protocol contributors"]
publisher: "github.com/nostr-protocol/nips"
ingested: 2026-05-21
quality: 5
credibility: high
confidence: high
authority: nip-spec
tags: [nip-42, auth, kind-22242, primary-source]
summary: "NIP-42 spec verbatim. Defines kind 22242 as the AUTH event for the WebSocket-level relay-authentication handshake (relay sends ['AUTH', challenge]; client replies ['AUTH', signed-event]). Required tags on the kind-22242 event: ['relay', '<relay-url>'] and ['challenge', '<challenge-string>']. There is NO provision for relays to publish kind 22242 for membership changes — it is exclusively a client→relay authentication payload. Settles the fGw TODO at src/lib/pyramid.ts: Pyramid's defensive listener for kind 22242 'membership-change events' would never fire because the kind isn't intended for that purpose."
---

# NIP-42 — Authentication of clients to relays

The NIP that defines kind 22242. The fGw codebase has been treating this kind as a defensive "membership-change push channel" for Pyramid; that interpretation is wrong, as confirmed by reading the spec directly.

## What kind 22242 actually is

Kind 22242 is **the WebSocket-level AUTH event**, exchanged once between a client and a relay during a connection's lifetime.

Wire flow:

1. Relay sends a frame: `["AUTH", "<challenge-string>"]`
2. Client constructs a kind-22242 event with two required tags:
   - `["relay", "<relay-url>"]`
   - `["challenge", "<challenge-string>"]`
   The event has no content (typically empty string) and is signed by the user's pubkey.
3. Client sends the signed event in an `["AUTH", <event>]` frame.
4. Relay validates (signature, challenge match, freshness) and responds with an `OK` frame.

After AUTH succeeds, the relay knows the connection's pubkey and can grant elevated permissions for the rest of the WebSocket session.

## Why the kind cannot be used for membership push

NIP-42 explicitly limits kind 22242 to:
- Client-originated (clients sign and send to the relay)
- Single-purpose (the challenge response)
- Connection-scoped (no broadcast)

There is no spec language allowing relays to publish kind 22242 events to subscribers. A relay that did so would be misusing the kind. Subscribers would receive the events but they wouldn't carry membership information — they'd be challenge-response payloads, possibly leaking authentication metadata.

## Implication for fGw

**The fGw `src/lib/pyramid.ts` has a defensive subscription on kind 22242 that will never fire and shouldn't.** The TODO at line ~373 ("Pyramid does not currently emit kind-22242; the listener is wired defensively so a future server-side push would Just Work") is correct in its observation but wrong in its prescription:

- Pyramid will *never* emit kind 22242 in this sense — doing so would violate NIP-42.
- Pyramid does *not currently* emit any other membership-change push event either; membership changes propagate by the JSONL log being rebuilt on the relay side.
- The right pattern for fGw to learn about membership changes is **polling NIP-86 `ListAllowedPubKeys` / `ListBannedPubKeys`** over the same WebSocket where AUTH already lives.

**Recommendation**: replace the kind-22242 subscription in `pyramid.ts` with a NIP-86 polling cycle (e.g., every 5 minutes, or on-demand when a publish fails with `restricted:`). The polling is cheap (Pyramid chapters are small) and authoritative.

## NIP-42 + Pyramid's cookie session

Pyramid's HTTP admin endpoints (e.g., `POST /action`) use a **cookie session** issued *after* a successful NIP-42 AUTH on the WebSocket. Khatru exposes the AUTH'd pubkey to HTTP handlers via `khatru.GetAuthed(ctx)`. So:

1. Client opens WebSocket, completes NIP-42 AUTH (sends a kind-22242 event with the relay's challenge).
2. Khatru sets a cookie tied to the AUTH'd pubkey for the same origin.
3. Client makes HTTP requests; Pyramid reads `global.GetLoggedUser(r)` from the cookie.

For a Tauri client (cross-origin to `chat.virginiafreedom.tech`), the cookie path is awkward. **Better path: use NIP-86 management calls over the WebSocket directly** — same origin, same AUTH, no cookie required.

## Cross-references

- Spec: https://github.com/nostr-protocol/nips/blob/master/42.md
- Companion (often confused): [NIP-98 HTTP-Auth](https://github.com/nostr-protocol/nips/blob/master/98.md) uses kind **27235**, not 22242.
- Pyramid handler that depends on this AUTH: [main.go + handler.go](2026-05-21-pyramid-handler-go.md).
- fGw code that needs the fix: `/Users/garykrause/repos/fGw/src/lib/pyramid.ts` (drop the kind-22242 subscription; add NIP-86 polling).
