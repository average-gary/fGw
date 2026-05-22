---
title: "Pyramid relay HTTP + NIP-86 API — verbatim reference"
type: reference
confidence: high
status: stable
sources:
  - ../../raw/papers/2026-05-21-pyramid-handler-go.md
  - ../../raw/papers/2026-05-21-pyramid-member-page-templ.md
  - ../../raw/papers/2026-05-21-nip-42-auth-spec.md
  - ../../raw/papers/2026-05-21-khatru-framework-readme.md
created: 2026-05-21
updated: 2026-05-21
tags: [pyramid, reference, http-api, nip-86, nip-42, primary-source]
---

# Pyramid relay HTTP + NIP-86 API — verbatim reference

The endpoint and admin-action surface fGw integrates with on `chat.virginiafreedom.tech`. **This article corrects three load-bearing inaccuracies** in the round-2 wiki summary; see [§ Corrections to round-2 wiki](#corrections-to-round-2-wiki) below.

Closes round-2 assess research gap #1 (Pyramid integration).

## Authentication model

Pyramid does **not** use NIP-98 HTTP-Auth. The model is:

1. Client opens a WebSocket to `wss://chat.virginiafreedom.tech`.
2. Relay sends an `["AUTH", "<challenge>"]` frame ([NIP-42](../../raw/papers/2026-05-21-nip-42-auth-spec.md)).
3. Client signs a kind-22242 event with `["relay", "<wss-url>"]` and `["challenge", "<challenge>"]` tags and sends `["AUTH", <event>]` back.
4. Khatru ([framework reference](../../raw/papers/2026-05-21-khatru-framework-readme.md)) sets a same-origin cookie tied to the AUTH'd pubkey.
5. Subsequent HTTP requests on the same origin read the AUTH'd pubkey via `global.GetLoggedUser(r)` (Pyramid) or `khatru.GetAuthed(ctx)` (framework-level).

Two consequences for fGw:

- A **Tauri client connecting cross-origin** to the Pyramid HTTPS endpoint cannot share the cookie. The clean path for cross-origin clients is **NIP-86 management calls over the same WebSocket** (covered below).
- A **same-origin web build** can ride the cookie. The Pyramid web UI (browser-rendered) does this.

## HTTP route registry

From `main.go` ~L107–L130. Auth tier matters per row.

| Path | Method | Handler | Auth tier |
|---|---|---|---|
| `/setup/domain` | GET/POST | `domainSetupHandler` | one-shot, only when domain unset |
| `/setup/root` | GET/POST | `rootUserSetupHandler` | one-shot, only when no root users |
| **`/action`** | **POST** | **`actionHandler`** | **session (cookie)** |
| `/settings` | GET/POST | `settingsHandler` | root only |
| `/clients`, `/clients/{clientId}` | GET | `detailsHandler`, `clientDetailsHandler` | session |
| `/database` | GET | `databaseHandler` | session |
| `/log` | GET | `logHandler` | session |
| `/search/reindex` | GET | `search.StreamingReindexHTML` | session |
| `/u`, `/u/{pubkey}` | GET | `memberPageHandler` | public read |
| `/u`, `/u/{pubkey}` | POST | `memberPageHandler` | session (self-only `nip05_username`) |
| `/u/sync` | POST | `syncHandler` | session (self-only `pubkey` resync) |
| `/stats` | GET | `statsHandler` | public |
| `/update`, `/restart` | POST | `updateHandler`, `restartHandler` | root |
| `/icon/{relayId}` | GET | `iconHandler` | public |
| `/forum/` | GET | `forumHandler` | public |
| `/.well-known/nostr.json` | GET | `nip05Handler` | public |
| `/static/`, `/favicon.ico` | GET | static | public |
| `/{$}` (root) | GET | `inviteTreeHandler` | public |

**There is no `/allowed` and no `/banned` endpoint.** The round-2 wiki described both as separate URLs; they don't exist. The closest equivalent is the public root page `/` (`inviteTreeHandler`) which renders the entire tree at once.

## The `POST /action` mutation endpoint

The single mutation endpoint for the entire whitelist:

```
POST /action
Content-Type: application/x-www-form-urlencoded
Cookie: <session>

type=invite&target=<hex-or-npub>
```

`type` accepts five values:

| Value | Effect | Author requirement |
|---|---|---|
| `invite` | Add `target` to inviter's subtree | author has remaining invite quota at their level |
| `drop` | Remove `target` and cascade-drop their descendants | `IsAncestorOf(author, target)` |
| `leave` | Self-removal | unconditional (target = author) |
| `disable` | Soft-deactivate without cascade | `IsAncestorOf` AND `HasSingleRootAncestor(target)` |
| `enable` | Reverse `disable` | `IsAncestorOf` |

`target` accepts hex or bech32 (`npub1...`) — Pyramid normalizes via `global.PubKeyFromInput`.

After a successful action, Pyramid `302`-redirects to `/`. There is no JSON response shape — Pyramid is an HTML-form admin UI, not a REST API.

## NIP-86 management API (the right path for Tauri clients)

NIP-86 ("relay management") is the **canonical programmatic invite/drop interface**. **Transport: HTTP POST** to the relay's HTTPS root (e.g. `https://chat.virginiafreedom.tech/`, transformed from the `wss://` URL), authenticated via a **NIP-98** event in `Authorization: Nostr <base64-signed-event>`. It is *not* WebSocket-multiplexed.

The round-3 wiki article incorrectly described NIP-86 as WebSocket-borne; per the [NIP-86 spec verbatim](https://github.com/nostr-protocol/nips/blob/master/86.md) it's HTTP+NIP-98. The `payload` tag (sha256 of request body) is **mandatory** for NIP-86 even though stock NIP-98 marks it optional — Pyramid's go-nostr validator enforces this.

### Wire format

- **URL**: `wss://...` → `https://...` (same path).
- **Method**: `POST`
- **Content-Type**: `application/nostr+json+rpc`
- **Authorization header**: `Nostr <base64(NIP-98 event JSON)>` where the event is kind 27235 with required tags `['u', <httpUrl>], ['method', 'POST'], ['payload', <sha256-of-body-hex>]`.
- **Request body**: `{ "method": "<lowercase-name>", "params": [<positional args>] }`
- **Response body**: `{ "result": <value>, "error": "<optional message>" }`. HTTP 401 on auth failure.

### Method signatures fGw needs

| NIP-86 method (lowercase, no separator) | Pyramid wrapper | Params | Result |
|---|---|---|---|
| `allowpubkey` | `pyramid.AddAction("invite", caller, pubkey)` | `[hexPubkey, reason?]` | `true` |
| `banpubkey` | `pyramid.AddAction("drop", caller, pubkey)` | `[hexPubkey, reason?]` | `true` |
| `listallowedpubkeys` | members where `len(Parents)>0 && !Removed` | `[]` | `[{pubkey, reason?}, ...]` |
| `listbannedpubkeys` | `Removed==true` members | `[]` | `[{pubkey, reason?}, ...]` |
| `banevent` | gates on root OR event author | `[hexEventId, reason?]` | `true` |
| `listbannedevents` | | `[]` | `[{id, reason?}, ...]` |

Additional methods Pyramid surfaces but fGw does not need this wave: `allowevent`, `listallowedevents`, `listeventsneedingmoderation`, `changerelayname`, `changerelaydescription`, `changerelayicon`, `allowkind`, `disallowkind`, `listallowedkinds`, `listdisallowedkinds`, `blockip`, `unblockip`, `listblockedips`, `grantadmin`, `revokeadmin`, `stats`, `supportedmethods`. See `https://github.com/nbd-wtf/go-nostr/blob/master/nip86/methods.go`.

### NIP-86 reference implementation

NDK 2.18.1 ships **no** NIP-86 helper. Neither does nostr-tools. fGw must hand-roll the call:

```ts
import { NDKEvent, type NDK } from '@nostr-dev-kit/ndk';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

async function nip86Call<T = unknown>(
  ndk: NDK,
  relayWsUrl: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const httpUrl = relayWsUrl.replace(/^ws(s?):\/\//, 'http$1://');
  const body = JSON.stringify({ method, params });
  const payloadHash = bytesToHex(sha256(new TextEncoder().encode(body)));

  const auth = new NDKEvent(ndk);
  auth.kind = 27235; // NIP-98
  auth.created_at = Math.floor(Date.now() / 1000);
  auth.content = '';
  auth.tags = [
    ['u', httpUrl],
    ['method', 'POST'],
    ['payload', payloadHash],     // MANDATORY for NIP-86 (NIP-98 normally optional)
  ];
  await auth.sign(); // requires ndk.signer

  const token = btoa(JSON.stringify(await auth.toNostrEvent()));
  const res = await fetch(httpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/nostr+json+rpc',
      Authorization: `Nostr ${token}`,
    },
    body,
  });
  if (res.status === 401) throw new Error('NIP-86: unauthorized');
  const json = await res.json();
  if (json.error) throw new Error(`NIP-86 ${method}: ${json.error}`);
  return json.result as T;
}
```

The signing key must be in Pyramid's admin allowlist or all calls 401. Method names are lowercase with no separator (`listallowedpubkeys`, not camelCase).

**fGw integration recommendation**: replace `inviteByNpub`, `dropMember`, `listMembers`, `listBanned` in `src/lib/pyramid.ts` with `nip86Call(...)` invocations. The Tauri cross-origin cookie problem disappears (HTTP+NIP-98 doesn't need cookies), and the API is structured (no HTML scraping for membership queries).

## The `/u/{pubkey}` HTML contract

For backward compatibility — fGw's existing `parseMemberPage` screen-scrapes this page. See [member_page.templ source](../../raw/papers/2026-05-21-pyramid-member-page-templ.md). Key facts:

- Landmarks: lowercase `invited by:` and `invited members:`, each followed by `<div class="ml-2 space-y-1">` of `<a href="/u/{hex}">` rows.
- Pubkeys in HTML are **hex** (not npub). URL redirects from `/u` use npub.
- Empty-list shape: literal text `none`.
- Status text branches: `root member` `(level 0)` | `member` `(level N)` | `not a member` — useful for membership detection without scraping.

## Sub-relay constellation

Pyramid mounts multiple Khatru relays at different paths under one binary. From `run()` in main.go ~L350+:

`/blossom`, `/grasp`, `/groups`, `/.well-known/nip29/`, `/stream`, `/paywall`, plus configurable base paths for `internal`, `personal`, `favorites`, `inbox`, `popular`, `uppermost`, `moderated`.

`chat.virginiafreedom.tech` is therefore not just a relay — it's a *constellation* of relays (chat, blossom, groups, forums, paywall, etc.) sharing one invite-tree gate. fGw's Blossom integration on the same FQDN rides the `/blossom` mount.

## NIPs Pyramid advertises

`OverwriteRelayInformation` in `main.go`: always 43; conditionally 50 (search), 29 (groups), 16 (scheduled), 63 (paywall), 77 (negentropy except for flotilla UA). README never mentions disabling NIP-11; Khatru serves it by default.

**Pyramid does not advertise its invite-only mode in NIP-11.** Per [issue #29](https://github.com/fiatjaf/pyramid/issues/29), fiatjaf considers `restricted_writes` "useless." Clients can't tell from the relay info that the relay is invite-only — they discover this only by trying to publish and receiving an `auth-required:` rejection.

## Corrections to round-2 wiki

The round-2 wiki Pyramid summary said:

| Round-2 wiki claimed | Source says |
|---|---|
| `GET /allowed` lists active members | **No such endpoint.** Use NIP-86 `ListAllowedPubKeys` over WebSocket. |
| `GET /banned` lists removed members | **No such endpoint.** Use NIP-86 `ListBannedPubKeys`. |
| `POST /allow?type=invite&target=<hex>` | **Endpoint is `/action`** (not `/allow`); form-encoded body, not query string. |
| `POST /ban?type=drop&target=<hex>` | **Endpoint is `/action`** (not `/ban`). |
| Auth via NIP-98 HTTP-Auth | **Auth via cookie session** (Khatru `GetAuthed` over WebSocket → cookie). NIP-98 is unused. |
| 3 actions: invite/drop/leave | **5 actions**: invite/drop/leave/disable/enable. |
| Single-parent invite tree | **Multi-parent** — `Parents []nostr.PubKey`, member can be invited by multiple admins for despotic-drop safeguarding. |
| kind 22242 is "membership-change push" | **kind 22242 is NIP-42 AUTH only.** Pyramid emits no membership-change push events. |

**This means fGw's `src/lib/pyramid.ts` is partially broken against current Pyramid.** The fix is documented in [the topic article](../topics/pyramid-in-fgw.md).

## Cross-references

- Source code: [pyramid/members.go](../../raw/papers/2026-05-21-pyramid-members-go.md), [main.go + handler.go](../../raw/papers/2026-05-21-pyramid-handler-go.md), [member_page.templ](../../raw/papers/2026-05-21-pyramid-member-page-templ.md).
- AUTH spec: [NIP-42](../../raw/papers/2026-05-21-nip-42-auth-spec.md).
- Framework: [Khatru](../../raw/papers/2026-05-21-khatru-framework-readme.md).
- Concept: [Pyramid invite-tree semantics](../concepts/pyramid-invite-tree-semantics.md).
- Topic: [Pyramid in fGw — corrections + remediation](../topics/pyramid-in-fgw.md).
- fGw client: `/Users/garykrause/repos/fGw/src/lib/pyramid.ts` (needs surgery — see topic article).
