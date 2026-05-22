---
title: "Pyramid main.go + handler.go — HTTP route registry + /action mutation endpoint"
type: source-paper
source_url: "https://raw.githubusercontent.com/fiatjaf/pyramid/master/handler.go"
authors: ["fiatjaf"]
publisher: "github.com/fiatjaf/pyramid"
license: "Unlicense"
ingested: 2026-05-21
quality: 5
credibility: high
confidence: high
authority: source-code
tags: [pyramid, http-routes, action-handler, cookie-auth, nip-42, nip-86, primary-source]
summary: "Pyramid HTTP route registry verbatim from main.go + the /action mutation endpoint from handler.go. CRITICAL CORRECTION to the round-2 wiki: there is NO /allowed and NO /banned endpoint. The single mutation endpoint is POST /action with 5 type values (invite/drop/leave/disable/enable). Auth is cookie-session via global.GetLoggedUser(r), NOT NIP-98 HTTP-Auth. The fGw client's pyramid.ts likely targets endpoints that don't exist."
---

# Pyramid HTTP route registry — main.go + handler.go

The actual HTTP surface Pyramid exposes. **Critical to fGw integration**: the route table corrects the round-2 wiki summary in three load-bearing ways.

## Route table (from `main.go` ~L107–L130)

| Path | Handler | Auth tier |
|---|---|---|
| `/setup/domain` | `domainSetupHandler` | one-shot, only when domain unset |
| `/setup/root` | `rootUserSetupHandler` | one-shot, only when no root users |
| **`POST /action`** | `actionHandler` | **cookie session (logged-in user)** |
| `/settings` | `settingsHandler` | root only |
| `/clients`, `/clients/{clientId}` | `detailsHandler`, `clientDetailsHandler` | session |
| `/database` | `databaseHandler` | session |
| `/log` | `logHandler` | session |
| `/search/reindex` | `search.StreamingReindexHTML` | session |
| `/u`, `/u/{pubkey}` | `memberPageHandler` | public read |
| `/u/sync` | `syncHandler` | session |
| `/stats` | `statsHandler` | public |
| `/update`, `/restart` | `updateHandler`, `restartHandler` | root |
| `/icon/{relayId}` | `iconHandler` | public |
| `/forum/` | `forumHandler` | public |
| `/.well-known/nostr.json` | `nip05Handler` | public |
| `/static/`, `/favicon.ico` | static | public |
| `/{$}` (root) | `inviteTreeHandler` | public |

## The `/action` mutation endpoint (handler.go:59–86)

```go
switch r.PostFormValue("type") { /* invite | drop | leave | disable | enable */ }
author, _ := global.GetLoggedUser(r)              // cookie session, NOT NIP-98
target := global.PubKeyFromInput(r.PostFormValue("target"))
pyramid.AddAction(type_, author, target)
http.Redirect(w, r, "/", 302)
```

- **`POST /action`** is the **single mutation endpoint** for the entire whitelist. Form-encoded.
- Required form fields: `type` (one of 5 values), `target` (pubkey, accepts hex or npub via `global.PubKeyFromInput`).
- Author derived from cookie session via `global.GetLoggedUser(r)`. This is **Khatru's connection-scoped AUTH session**, set when a NIP-42 AUTH event is sent over the relay's WebSocket and a cookie is issued.
- **Pyramid does NOT accept NIP-98 HTTP-Auth headers.** It uses cookie session.

## Sub-relay mounts (`run()` in main.go ~L350+)

Pyramid is *not just* a single relay — it ships with sub-relays mounted at:
`/blossom`, `/grasp`, `/groups`, `/.well-known/nip29/`, `/stream`, `/paywall`, plus configurable base paths for `internal`, `personal`, `favorites`, `inbox`, `popular`, `uppermost`, `moderated`.

This means `chat.virginiafreedom.tech` is a *constellation* of relays, not just one. Blossom (media), groups (NIP-29), and forums all share the invite-tree gate.

## NIP-86 management API (`management.go`)

NIP-86 is the **canonical programmatic invite/drop interface** — i.e., the API a *client* (not a logged-in browser) should use:

- `relay.ManagementAPI.AllowPubKey` → wraps `pyramid.AddAction("invite", caller, pubkey)`
- `relay.ManagementAPI.BanPubKey` → wraps `pyramid.AddAction("drop", caller, pubkey)`
- `ListAllowedPubKeys` returns members where `len(Parents)>0 && !Removed`, with `reason: "invited by nostr:<npub>, ..."`
- `ListBannedPubKeys` returns `Removed==true` members
- `BanEvent` requires root OR event author; root-only: `ChangeRelayName/Description/Icon`, `AllowKind/DisallowKind`, `BlockIP/UnblockIP`
- All authenticated via **`khatru.GetAuthed(ctx)`** (NIP-42 AUTH on the WebSocket; **not** NIP-98).

NIP-86 traffic flows over the WebSocket as JSON-RPC-style messages, not as REST. So programmatic invite is `["REQ", ..., {nip86 management call}]` over the same socket where AUTH happened.

## NIPs advertised

`OverwriteRelayInformation` in `main.go`: always 43; conditionally 50 (search), 29 (groups), 16 (scheduled), 63 (paywall), 77 (negentropy except for flotilla UA). README never mentions NIP-11 disable; it's served by khatru by default.

## What this corrects in the wiki

The round-2 wiki summary said:

| Wiki said | Source says |
|---|---|
| `GET /allowed` lists active members | **No such endpoint.** Use NIP-86 `ListAllowedPubKeys` over WebSocket. |
| `GET /banned` lists removed members | **No such endpoint.** Use NIP-86 `ListBannedPubKeys`. |
| `POST /allow?type=invite&target=<hex>` | **Endpoint is `/action`**, not `/allow`. |
| `POST /ban?type=drop&target=<hex>` | **Endpoint is `/action`**, not `/ban`. |
| Auth via NIP-98 HTTP-Auth | **Auth via cookie session** (Khatru `GetAuthed` over WebSocket → cookie). |

**This means fGw's `src/lib/pyramid.ts` is partially broken.** Calls to `/allow`, `/ban`, `/allowed`, `/banned` will 404 against current Pyramid. The fix has two paths:

1. **HTTP cookie path**: switch to `POST /action` with form-encoded `type` and `target`, and handle the cookie session (which requires the user to have already AUTH'd on the WebSocket — non-trivial to do in a Tauri client without same-origin cookie sharing).
2. **NIP-86 over WebSocket path**: build NIP-86 management calls into the same NDK connection that's already AUTH'd. **This is the native API and probably the cleaner fix.**

## Cross-references

- Source files: https://github.com/fiatjaf/pyramid/blob/master/main.go and `/handler.go`
- Companion data model: [pyramid/members.go](2026-05-21-pyramid-members-go.md).
- Companion templ contract: [member_page.templ](2026-05-21-pyramid-member-page-templ.md).
- NIP-42 (the AUTH protocol that grants the cookie): [NIP-42 verbatim](2026-05-21-nip-42-auth-spec.md).
- fGw client to audit: `/Users/garykrause/repos/fGw/src/lib/pyramid.ts`.
