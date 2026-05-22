---
title: "Pyramid pyramid/members.go — invite-tree data model + JSONL action log"
type: source-paper
source_url: "https://raw.githubusercontent.com/fiatjaf/pyramid/master/pyramid/members.go"
authors: ["fiatjaf (Giovanni Torres dos Santos)"]
publisher: "github.com/fiatjaf/pyramid"
license: "Unlicense (SPDX: Unlicense)"
last_commit_observed: "2026-05-11"
ingested: 2026-05-21
quality: 5
credibility: high
confidence: high
authority: source-code
tags: [pyramid, invite-tree, members, jsonl, go, primary-source]
summary: "Canonical Go source file for Pyramid's invite-tree data model. Defines Member { Parents []nostr.PubKey; Removed bool }, AbsoluteKey synthetic root, 5 Action types (invite/drop/leave/disable/enable — NOT 3 as the wiki spec.md previously claimed), JSONL action log at <DataPath>/management.jsonl, GetLevel walks Parents recursively returning minimum, multi-parent invites for 'safeguarding from despotic future drops', cascading delete via applyAction(ActionLeave). xsync.MapOf for lock-free concurrent state. Correction source for the round-2 wiki Pyramid description."
---

# pyramid/members.go — invite-tree data model

The Go file that *is* Pyramid's invite tree. Every claim the wiki makes about Pyramid traces here.

## Repo metadata

- **Repo**: github.com/fiatjaf/pyramid
- **Language**: Go
- **License**: Unlicense (SPDX `Unlicense`)
- **Stars / forks (observed 2026-05-21)**: 59 / 15
- **Last commit observed**: 2026-05-11 (`6000168` "nice display toggles on /database.")
- **Maintained by**: fiatjaf — author of Nostr; actively maintained
- **Built on**: `fiatjaf.com/nostr/khatru` relay framework (not the older `github.com/fiatjaf/khatru`)

## Verbatim core types

```go
var (
    AbsoluteKey nostr.PubKey
    Members     = xsync.NewMapOf[nostr.PubKey, Member]()
)

type Member struct {
    Parents []nostr.PubKey
    Removed bool
}

type Action string
const (
    ActionInvite  = "invite"
    ActionDrop    = "drop"
    ActionLeave   = "leave"
    ActionDisable = "disable"
    ActionEnable  = "enable"
)

type managementAction struct {
    Type   Action          `json:"type"`
    Author string          `json:"author"`
    Target string          `json:"target"`
    When   nostr.Timestamp `json:"when"`
}
```

## Key facts

- **`AbsoluteKey`** = `global.Settings.RelayInternalSecretKey.Public()` (set in `main.go`). It is a **synthetic super-root**; its *direct children* are root admins. Detected via `slices.Contains(member.Parents, AbsoluteKey)`.
- **`Members`** is an `xsync.MapOf` (lock-free concurrent map) keyed by `nostr.PubKey`.
- **Multi-parent invites are real.** A pubkey can have multiple parents (`Parents []nostr.PubKey`). This is the "safeguarding from despotic future drops" feature — drop only severs the ancestral subtree linking back to the dropper; another inviter's subtree keeps the member.
- **Five action types — not three.** The round-2 wiki summary said `invite | drop | leave`. The actual set is `invite | drop | leave | disable | enable`. `disable`/`enable` is reversible; `drop` is permanent for a subtree.
- **JSONL log file**: `<DataPath>/management.jsonl`. Each line is the `managementAction` struct above, written via `appendActionToFile` with `O_APPEND|O_CREATE|O_WRONLY 0644`. Field order produced by `json.Marshal` is `{"type","author","target","when"}` (hex pubkeys, unix-second timestamp).
- **Source of truth is the file.** After append, `LoadManagement()` is called to rebuild in-memory state — i.e., the in-memory map is a derived view of the file.
- **`MaxInvitesAtEachLevel` enforcement**: `GetLevel()` walks `Parents` recursively returning the *minimum* level (closest path to root wins). Root members (children of `AbsoluteKey`) return level 0 with **999999 invites** (effectively unlimited). For level N≥1, `MaxInvitesAtEachLevel[N-1]` applies; beyond array length → 0 invites. Falls back to flat `MaxInvitesPerPerson` if the array is empty.
- **Validation guards in `AddAction`**: invite rejects ancestor-of-author, duplicate parent, self-invite; drop/disable require `IsAncestorOf`; disable additionally requires `HasSingleRootAncestor` (so multi-parent members can only be `Drop`ped from one branch); leave is unconditional.
- **Cascading delete**: `applyAction(ActionLeave)` deletes the target, then recursively walks `Members.Range` removing references and orphaned descendants.

## What this corrects in the wiki

The round-2 wiki narrative was based on the round-1 explore agent's report, which got several details wrong:

| Wiki said | Source says |
|---|---|
| 3 actions: invite, drop, leave | **5 actions**: invite, drop, leave, disable, enable |
| `Member { Parents []nostr.PubKey; Removed bool }` (correct) | confirmed |
| Single-parent tree | **Multi-parent** — multiple inviters per member, per `Parents` slice |
| Level via parent path | Level = **minimum** depth across all parent paths (multi-parent makes this matter) |
| `MaxInvitesAtEachLevel` array | confirmed; root = 999999 (unlimited) |
| State persisted to "JSONL action log" | confirmed; file at `<DataPath>/management.jsonl`, 4 fields |

## Cross-references

- Source code: this file at https://github.com/fiatjaf/pyramid/blob/master/pyramid/members.go
- Companion: [Pyramid main.go + handler.go route registry](2026-05-21-pyramid-handler-go.md).
- Companion: [Pyramid member_page.templ](2026-05-21-pyramid-member-page-templ.md) for the HTML rendering of `Member`.
- fGw client: `/Users/garykrause/repos/fGw/src/lib/pyramid.ts` — should be audited against this data model.
