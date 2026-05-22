---
title: "Pyramid invite-tree semantics — multi-parent, 5 actions, JSONL log"
type: concept
confidence: high
status: stable
sources:
  - ../../raw/papers/2026-05-21-pyramid-members-go.md
  - ../../raw/papers/2026-05-21-pyramid-handler-go.md
created: 2026-05-21
updated: 2026-05-21
tags: [pyramid, invite-tree, members, jsonl, semantics]
---

# Pyramid invite-tree semantics

How the chapter membership tree actually works. fGw's chapter governance — who can invite, who can drop, what cascades — is shaped entirely by these rules.

## The data model

```go
type Member struct {
    Parents []nostr.PubKey   // multiple inviters allowed
    Removed bool              // soft-removed flag
}
```

Three observations:

1. **Members can have multiple parents.** A member invited by A and later co-invited by B has `Parents: [A, B]`. This is the **despotic-drop safeguard** — if A goes rogue and drops the member, B's branch keeps them in.
2. **`Removed bool`** is soft state — the entry stays in the map for audit purposes after a drop.
3. **`AbsoluteKey`** (`global.Settings.RelayInternalSecretKey.Public()`) is a synthetic super-root. **Root admins are direct children of `AbsoluteKey`**, detected via `slices.Contains(member.Parents, AbsoluteKey)`.

## Levels and quotas

`GetLevel(pubkey)` walks the `Parents` graph recursively and returns the **minimum** depth across all paths to root.

- Root members (children of `AbsoluteKey`): level 0, **999999 invites** (effectively unlimited).
- Level N≥1: invites limited by `MaxInvitesAtEachLevel[N-1]` (config array).
- Beyond array length: 0 invites.
- Fallback: flat `MaxInvitesPerPerson` if the array is empty.

Multi-parent makes "level" a tree-vs-DAG distinction: a member invited by both a level-0 root and a level-3 nephew is *level 0* (the minimum across paths). This benefits members in deep chains who get co-invited by an admin — they "promote" to a higher invite quota.

## The five actions

| Action | Author rule | Cascade behavior |
|---|---|---|
| `invite` | author has remaining invite quota at their level; rejects ancestor-of-author / duplicate / self-invite | adds `target` with `Parents: [author]`, or appends author to existing `target.Parents` |
| `drop` | `IsAncestorOf(author, target)` | removes the ancestral edge; cascade-removes the target's subtree if all parent edges are severed |
| `leave` | unconditional (target = author) | self-removal; cascade-removes orphaned descendants |
| `disable` | `IsAncestorOf` AND `HasSingleRootAncestor(target)` | sets `Removed: true` reversibly; multi-parent members can't be disabled |
| `enable` | `IsAncestorOf` | reverses `disable` |

Two operationally important nuances:

- **`drop` only severs the ancestor's edge.** If the target has another inviter elsewhere in the tree, they stay in. **`leave` is the only way to fully remove yourself**, and it cascades unconditionally.
- **`disable`/`enable` is reversible state.** Useful for temporary suspension (e.g., a member is travelling and shouldn't be receiving DMs); doesn't lose the membership history.

## The JSONL action log

Pyramid persists every action to `<DataPath>/management.jsonl` via:

```go
type managementAction struct {
    Type   Action          `json:"type"`
    Author string          `json:"author"`
    Target string          `json:"target"`
    When   nostr.Timestamp `json:"when"`
}
```

Written with `O_APPEND|O_CREATE|O_WRONLY 0644`. Pubkeys are hex; timestamp is unix-seconds.

**The file is the source of truth.** After every append, Pyramid calls `LoadManagement()` to rebuild the in-memory `xsync.MapOf` from scratch. The map is a derived view; the JSONL is canonical. This means:

- A crash before fsync can lose the *last* action but the map will simply not reflect it after restart — no torn state.
- Backup is trivial: `cp management.jsonl chapter-2026-05-21.bak`.
- Restoring a chapter from backup is `cat management.jsonl > <DataPath>/management.jsonl && restart pyramid`.

## What this means for chapter governance

For Powder Keg WV's chapter management:

- **Co-invite for resilience.** Critical chapter members (Gini and at least one other elder) should each invite each other so neither can be solo-dropped by a future rogue.
- **`disable` for travel/sabbatical.** When a member is offline for months, `disable` keeps their history intact without their pubkey publishing.
- **`leave` for permanent exit.** Members leaving the chapter (move away, change life-stage) should `leave` themselves rather than be dropped — preserves the history and cascades cleanly.
- **Backup the JSONL nightly.** It's the entire chapter membership history; offsite backup is essentially free.

## Cascading drop weaponization (open risk)

A high-level inviter being compromised could drop a whole subtree. Pyramid offers two partial mitigations:

- Multi-parent membership (covered above).
- Audit-trail visibility — the JSONL log records the author of every action, so post-hoc detection of a malicious drop is possible.

What Pyramid does *not* offer:
- Multi-sig / quorum drop (would require N admins to agree before a cascade triggers)
- Drop "review window" (delay before cascade takes effect, allowing community veto)
- Drop reversal as a first-class action (currently you'd have to re-invite each affected pubkey individually)

[Pyramid issue #29](https://github.com/fiatjaf/pyramid/issues/29) and Pyramid maintainership have not (as of mid-2026) modeled this attack surface in public. The wiki notes this as an *unmodeled* risk rather than a debunked one.

## Cross-references

- Source: [pyramid/members.go](../../raw/papers/2026-05-21-pyramid-members-go.md).
- HTTP API: [Pyramid relay HTTP + NIP-86 API](../references/pyramid-relay-api.md).
- Topic synthesis: [Pyramid in fGw](../topics/pyramid-in-fgw.md).
- fGw chapter governance code: `/Users/garykrause/repos/fGw/src/routes/admin/`.
