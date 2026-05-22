---
title: "Khatru relay framework — README + auth model"
type: source-paper
source_url: "https://github.com/fiatjaf/khatru"
authors: ["fiatjaf"]
publisher: "github.com/fiatjaf/khatru (canonical home: fiatjaf.com/nostr/khatru@master)"
license: "Unlicense"
last_commit_observed: "2025-09-22 (maintenance mode)"
ingested: 2026-05-21
quality: 5
credibility: high
confidence: high
authority: framework-source
tags: [khatru, relay-framework, go, plugin-model, nip-42, primary-source]
summary: "Khatru is fiatjaf's Go relay-construction-kit. Pyramid is built on it. Khatru is a LIBRARY (you instantiate khatru.NewRelay() and append handlers to slices) — not a relay itself. Provides StoreEvent / QueryEvents / DeleteEvent / RejectEvent / RejectFilter slices. Built-in NIP-42 AUTH plumbing exposes the AUTH'd pubkey via khatru.GetAuthed(ctx). Pluggable storage via fiatjaf/eventstore (sqlite3, badger, lmdb, postgres). Common policy bundle in khatru/policies. Now in maintenance mode; canonical home moved to fiatjaf.com/nostr/khatru."
---

# Khatru relay framework

Pyramid's parent. Without Khatru context, Pyramid behaviors look like magic; with it, every Pyramid hook maps to a Khatru extension point.

## What Khatru is

A **Go library** for assembling Nostr relays. Not a relay binary — you import it into your own Go program, instantiate `khatru.NewRelay()`, append your policy/storage handlers to the relay's slice fields, and run.

```go
relay := khatru.NewRelay()
relay.StoreEvent = append(relay.StoreEvent, myStorage.SaveEvent)
relay.QueryEvents = append(relay.QueryEvents, myStorage.QueryEvents)
relay.RejectEvent = append(relay.RejectEvent, myInviteTreeCheck)  // ← Pyramid's gate
http.ListenAndServe(":3334", relay)
```

Pyramid's invite-tree gate is essentially a function appended to `relay.RejectEvent` that calls `pyramid.IsAllowedToPublish(authedPubkey)`.

## Repo metadata

- **Stars / License / Activity**: 135 / Unlicense / last push 2025-09-22 (now in **maintenance mode**; canonical home moved to `fiatjaf.com/nostr/khatru@master`)

## Extension points (the slices)

| Slice | Purpose |
|---|---|
| `StoreEvent` | persistence write hook |
| `QueryEvents` | persistence read hook |
| `DeleteEvent` | persistence delete hook |
| `RejectEvent` | reject inbound events that violate policy (Pyramid uses this for invite-tree gating) |
| `RejectFilter` | reject inbound subscription filters |
| `OnEphemeralEvent` | handler for ephemeral events |
| `OverwriteResponseEvent` / `OverwriteFilter` | mutate before send |

## Storage adapters (`fiatjaf/eventstore`)

Pluggable backends:
- `sqlite3` (Pyramid's default path)
- `badger` (key-value)
- `lmdb` (issue #31 in Pyramid is about this adapter failing on ARM)
- `postgres`

You pass a configured adapter into Khatru's `StoreEvent`/`QueryEvents` slices. Backend choice is a per-deployment config knob.

## NIP-42 AUTH built in

Khatru handles the WebSocket-level AUTH dance. Handlers can:

- Reject events with the prefix `auth-required: <reason>` to trigger an AUTH challenge.
- Read the AUTH'd pubkey from any HTTP handler context via `khatru.GetAuthed(ctx)`.

This is how Pyramid's `global.GetLoggedUser(r)` works under the hood — it reads the connection-scoped AUTH session, exposed through a cookie tied to the WebSocket origin.

## Common policy bundle (`khatru/policies`)

Pre-baked policies you can plug in:
- `ValidateKind`
- `PreventLargeTags`
- `NoComplexFilters`
- `ApplySaneDefaults`

Pyramid bundles its own gate logic but uses these for the rest of its hardening.

## Router exposure

Khatru exposes a stdlib `http.ServeMux` via `relay.Router()`. This is the integration surface Pyramid's REST endpoints (`/action`, `/u/{pubkey}`, etc.) plug into. The relay binary serves both the WebSocket Nostr protocol and arbitrary HTTP endpoints from the same listener.

## Implications for fGw

- **The framework is in maintenance mode** as of late 2025. New features are unlikely. fGw should not assume aggressive evolution upstream.
- **Same-origin AUTH session**: Khatru's `GetAuthed` is tied to the WebSocket origin. A fGw Tauri client connecting to `wss://chat.virginiafreedom.tech` and then making HTTP requests to `https://chat.virginiafreedom.tech` from the same origin can share the cookie. A web-build PWA hosted elsewhere cannot. **NIP-86 over the WebSocket sidesteps this.**
- **The plugin slice model is the lever for chapter customization.** A future "Powder Keg WV" deployment that wants additional policy (e.g., compost-listing-only relay, or a kind-30078 storage quota) can fork Pyramid's main.go and prepend hooks without touching invite-tree code.

## Comparable architectures

- **strfry-policy** (hoytech/strfry): policy is an external subprocess in any language. Different paradigm; see [strfry plugin docs](https://github.com/hoytech/strfry/blob/master/docs/plugins.md). Inventory candidate; not yet ingested.
- **nostr-rs-relay** (scsibug): Rust + SQLite, supports a static config-file pubkey whitelist. Closest minimal alternative if Pyramid's complexity is unwarranted for a chapter.
- **CodyTseng/nostr-relay**: TypeScript Khatru analogue. Lower adoption.

## Cross-references

- Source: https://github.com/fiatjaf/khatru (canonical: https://fiatjaf.com/nostr/khatru)
- Pyramid uses Khatru: see [pyramid/members.go](2026-05-21-pyramid-members-go.md), [main.go + handler.go](2026-05-21-pyramid-handler-go.md).
- AUTH protocol: [NIP-42](2026-05-21-nip-42-auth-spec.md).
