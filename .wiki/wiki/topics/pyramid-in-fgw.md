---
title: "Pyramid in fGw — corrections, NIP-86 migration, remediation plan"
type: topic
confidence: high
status: stable
sources:
  - ../../raw/papers/2026-05-21-pyramid-members-go.md
  - ../../raw/papers/2026-05-21-pyramid-handler-go.md
  - ../../raw/papers/2026-05-21-pyramid-member-page-templ.md
  - ../../raw/papers/2026-05-21-nip-42-auth-spec.md
  - ../../raw/papers/2026-05-21-khatru-framework-readme.md
created: 2026-05-21
updated: 2026-05-21
tags: [pyramid, fgw, integration, remediation, nip-86, refactor]
---

# Pyramid in fGw — corrections, NIP-86 migration, remediation plan

The synthesis: how fGw's `src/lib/pyramid.ts` actually integrates with Pyramid, what's wrong, and how to fix it.

This is the article round-2 assess research gap #1 was asking for. It supersedes the round-2 wiki Pyramid description in three load-bearing ways.

## What fGw believes today

The fGw codebase (specifically `src/lib/pyramid.ts`, 476 LOC) was built against a Pyramid model that's mostly wrong:

- Calls `POST /allow?type=invite&target=<hex>` and `POST /ban?type=drop&target=<hex>` with **NIP-98 HTTP-Auth headers**.
- Subscribes to **kind 22242 events as "membership-change pushes"**.
- Screen-scrapes `GET /u/{pubkey}` HTML for inviter/invitee chains.
- Reads `GET /allowed` and `GET /banned` (HTML pages) for member rosters.

## What's actually true (per primary sources)

| Belief | Reality |
|---|---|
| `/allow` and `/ban` endpoints exist | **They don't.** Single mutation endpoint is `POST /action` with `type` ∈ `{invite, drop, leave, disable, enable}`. |
| NIP-98 HTTP-Auth is the auth path | **No.** Auth is cookie-session via Khatru's `GetAuthed`, set when the client completes NIP-42 AUTH on the WebSocket. NIP-98 is unused. |
| Kind 22242 carries membership-change pushes | **No.** Kind 22242 is exclusively the NIP-42 AUTH event (client→relay challenge-response). NIP-42 specifies no relay-broadcast use. Pyramid emits zero membership-change push events. |
| `/allowed` and `/banned` HTML list pages exist | **They don't.** The closest equivalent is the public root `/` page (`inviteTreeHandler`) showing the whole tree, plus the NIP-86 `ListAllowedPubKeys` / `ListBannedPubKeys` calls over WebSocket. |
| Invites form a tree | **Multi-parent DAG.** A member can have multiple inviters (`Parents []nostr.PubKey`), per the despotic-drop safeguard. |
| There are 3 actions: invite, drop, leave | **5 actions**: invite, drop, leave, **disable, enable**. |

The fGw client is partially broken against current Pyramid. Calls to nonexistent endpoints will 404. The kind-22242 listener will never fire. The `parseMemberPage` HTML scraper still works (the templ contract holds), but `listMembers()` and `listBanned()` will fail because they hit nonexistent pages.

## What Pyramid actually wants from clients

fGw should integrate via **two paths**:

### Path A — NIP-86 management calls (HTTP POST + NIP-98 auth)

This is the **clean, structured, no-cookie-needed** path. Recommended for all programmatic invite/drop/list operations.

**Transport correction (2026-05-21 stage-3 grounding)**: NIP-86 is **HTTP POST** to the relay's HTTPS root (e.g. `https://chat.virginiafreedom.tech/`, transformed from the `wss://` URL), authenticated via a **NIP-98 event** in an `Authorization: Nostr <base64-signed-event>` header. It is *not* WebSocket-multiplexed despite the round-3 wiki article's earlier claim. The NIP-98 event must include a mandatory `payload` tag (sha256 of the request body) — NIP-86 makes this required even though stock NIP-98 marks it optional.

Neither **NDK 2.18.1** nor **nostr-tools** ship a NIP-86 helper as of mid-2026. fGw must hand-roll the HTTP POST. See [pyramid-relay-api.md § Path A reference implementation](../references/pyramid-relay-api.md#nip-86-reference-implementation) for the exact code shape.

| Operation | NIP-86 method | Auth |
|---|---|---|
| Invite npub | `AllowPubKey(pubkey, reason)` | session |
| Drop pubkey | `BanPubKey(pubkey, reason)` | session |
| List members | `ListAllowedPubKeys()` | public |
| List banned | `ListBannedPubKeys()` | public |
| Ban a specific event | `BanEvent(eventId, reason)` | session |
| List banned events | `ListBannedEvents()` | public |

### Path B — Read `GET /u/{pubkey}` HTML for the per-member tree view

NIP-86 doesn't expose the *tree* (inviter/invitee chains for a specific pubkey). The HTML page is the only source. fGw's `parseMemberPage` already handles this; the contract holds (lowercase landmarks, hex pubkeys, "none" for empty list, status text branches).

**Optimization**: parse the status text first (`root member` | `member` | `not a member`) before scraping the lists. Cheaper and more robust to template tweaks.

## Recommended remediation (SPEC-XXX candidates)

Six concrete code changes for `src/lib/pyramid.ts`:

| # | Change | Why |
|---|---|---|
| 1 | Replace `inviteByNpub(npub)` with NIP-86 `allowpubkey` (HTTP POST + NIP-98) | Removes the broken `/allow?type=invite` HTTP path; structured response; works in Tauri |
| 2 | Replace `dropMember(pubkey)` with NIP-86 `banpubkey` (HTTP POST + NIP-98) | Same reasons |
| 3 | Replace `listMembers()` and `listBanned()` with NIP-86 `listallowedpubkeys` / `listbannedpubkeys` | The HTTP `/allowed` and `/banned` endpoints don't exist |
| 4 | Drop the kind-22242 subscription entirely | NIP-42 reserves the kind for AUTH only; Pyramid never broadcasts it; the listener fires zero times |
| 5 | Add a NIP-86 polling cycle for membership status | Replaces the (nonexistent) push channel; fire on app-resume + every 5 min while in foreground; bust on chapter switch |
| 6 | Keep `parseMemberPage` for `/u/{pubkey}` *but* gate it on the `'root member' / 'member' / 'not a member'` status text | Faster path for membership detection; fallback to list-scraping only when level > 0 |

Two **new actions** the app could expose to chapter elders:

| Action | UI surface | Notes |
|---|---|---|
| `disable` | "Pause member" button on `Members.tsx` | Reversible suspension; useful for sabbaticals |
| `enable` | "Resume member" button on `Members.tsx` | Pair with `disable` |

## Operational notes for Powder Keg

Beyond code, two governance practices the wiki recommends:

1. **Co-invite chapter elders.** Gini and at least one other elder should `invite` each other so neither can be solo-dropped. Multi-parent membership protects against rogue drops.
2. **Backup `management.jsonl` nightly.** It's the entire chapter membership history. Offsite backup is essentially free; restoring a chapter is `cat management.jsonl > <DataPath>/management.jsonl && restart pyramid`.

## Known limitations (consolidated from issue tracker)

From the contrarian agent's GitHub-issue review:

- **NIP-11 advertisement gap** ([issue #29](https://github.com/fiatjaf/pyramid/issues/29)): Pyramid does not advertise `restricted_writes` or any rate-limit fields. Clients can't tell from `relay.info` that the relay is invite-only — they discover this by trying to publish and receiving `auth-required:` rejection. fiatjaf considers the NIP-11 fields "useless." The fGw client should treat `auth-required:` as the membership-status truth.
- **`mmmm.lock` crash recovery** ([issue #12](https://github.com/fiatjaf/pyramid/issues/12)): A crash mid-write leaves a lock file blocking restart; a community-supplied systemd `ExecStartPre=rm` workaround exists but isn't bundled. Operations runbook for `chat.virginiafreedom.tech` should include this.
- **Memory + CPU runaway** ([issue #24](https://github.com/fiatjaf/pyramid/issues/24)): Sustained kind-20001 ephemeral-event floods bypass rate limits. Real-world deployments (`nestr.nedao.ch`) hit ~4.5 GB RAM. fGw chapters are small (Powder Keg ~100 members realistic ceiling) so unlikely to hit this — but log monitoring is prudent.
- **LMDB on ARM** ([issue #31](https://github.com/fiatjaf/pyramid/issues/31)): Ubuntu ARM hosts can fail to allocate memory for the LMDB event store. Pin to amd64 hosts for now; revisit when fiatjaf or community produce an ARM fix.

## Open security/threat-model questions (no public modeling)

The wiki has not found public discussion of:

- **Root-key concentration.** `AbsoluteKey` is a single keypair held by the relay process. Compromise of that key compromises the entire chapter. No multi-sig, no quorum, no recovery. Powder Keg's ops should consider how the root secret is protected (HSM? threshold split among elders?).
- **Cascading-drop weaponization.** A compromised inviter could drop their entire subtree. Multi-parent helps; multi-sig / quorum / review-window do not exist.
- **EU DSA / KYC posture.** Invite-only relays are still relays; an EU-resident chapter operator is potentially under DSA. No public analysis.

These are flagged as inventory candidates for future research rounds.

## Cross-references

- Reference: [Pyramid relay HTTP + NIP-86 API](../references/pyramid-relay-api.md).
- Concept: [Pyramid invite-tree semantics](../concepts/pyramid-invite-tree-semantics.md).
- AUTH spec: [NIP-42](../../raw/papers/2026-05-21-nip-42-auth-spec.md).
- Source code: [pyramid/members.go](../../raw/papers/2026-05-21-pyramid-members-go.md), [main.go + handler.go](../../raw/papers/2026-05-21-pyramid-handler-go.md), [member_page.templ](../../raw/papers/2026-05-21-pyramid-member-page-templ.md), [Khatru framework](../../raw/papers/2026-05-21-khatru-framework-readme.md).
- Project code that needs surgery: `/Users/garykrause/repos/fGw/src/lib/pyramid.ts`.
- SPEC sections affected: SPEC § 4 SPEC-025 (Pyramid client), SPEC § 4 SPEC-026 (Admin routes — Members.tsx, Banned.tsx, RequestInvite.tsx).
