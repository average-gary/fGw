---
title: "Pyramid member_page.templ — HTML landmark contract for /u/{pubkey}"
type: source-paper
source_url: "https://raw.githubusercontent.com/fiatjaf/pyramid/master/member_page.templ"
authors: ["fiatjaf"]
publisher: "github.com/fiatjaf/pyramid"
license: "Unlicense"
ingested: 2026-05-21
quality: 5
credibility: high
confidence: high
authority: source-code
tags: [pyramid, html, templ, screen-scraping, parser-contract, primary-source]
summary: "Verbatim Pyramid templ source for the /u/{pubkey} member-detail page that fGw's parseMemberPage screen-scrapes. The landmark contract is lowercase-with-colon: 'invited by:' and 'invited members:'. Pubkeys in HTML are HEX (not npub); URL redirects use npub. Empty invitee list renders literal 'none'. Status text distinguishes 'root member', 'member', 'not a member' — useful for membership detection without scraping the inviter list."
---

# Pyramid `member_page.templ` — HTML landmark contract

The templ source for `GET /u/{pubkey}` — the page fGw's `src/lib/pyramid.ts` `parseMemberPage` function screen-scrapes to extract inviter/invitee chains.

## The landmarks (verbatim)

The fGw client uses a "split-on-landmark" parser. The landmarks must match the templ output literally:

```html
<span class="text-sm font-medium light:text-stone-600 dark:text-stone-400">invited by:</span>
```

```html
<span class="text-sm font-medium light:text-stone-600 dark:text-stone-400">invited members:</span>
```

Both strings are:
- **lowercase** (`invited by:`, `invited members:`)
- **colon-suffixed** (the `:` is part of the landmark)
- followed by a sibling `<div class="ml-2 space-y-1">` containing per-entry `<div class="text-sm">` rows with `<a href="/u/{hex}">`

Each anchor is shaped:

```html
<a href="/u/{hex}" class="...">
  <nostr-name pubkey="{hex}">{hex}</nostr-name>
</a>
```

— so pubkeys appear three places per row: the URL, the `pubkey` attribute, and the inner text. **Pubkeys in HTML are hex** (`inviter.Hex()` / `invitee.Hex()`). URL redirects from `GET /u` use npub form; on the rendered detail page everything is hex.

## Empty-list shape

When a member has no invitees, the "invited members:" block renders the literal text `none`. The fGw parser should not panic on this — it should return an empty array.

## Status text branches

The page emits *distinct* status text in three branches:

| Branch | Text |
|---|---|
| Root member | `root member` `(level 0)` |
| Regular member | `member` `(level N)` (where N ≥ 1) |
| Not a member | `not a member` |

This is useful for membership detection **without** scraping the inviter list at all — the status text is a reliable signal on its own.

## Self-only POST surfaces (extra)

`member_page.templ` also includes self-only forms that aren't on the round-2 wiki endpoint table:

- `POST /u` with field `nip05_username` — set the user's NIP-05 username
- `POST /u/sync` with field `pubkey` — sync the user's metadata

Both require a session and operate only on the *self* (or the page being viewed if it's the logged-in user). Less critical for fGw than `/action` but worth noting.

## What this corrects / verifies in the wiki

The round-2 wiki narrative said the parser uses a "split-on-landmark" contract. **Confirmed.** This file is the source of truth for the parser:

- ✅ landmark text: `invited by:` / `invited members:` (lowercase, colon-suffixed)
- ✅ pubkey form in HTML: hex
- ✅ empty list renders as `none`

The wiki should add the **status-text shortcut**: rather than scraping the lists, `parseMemberPage` could detect membership solely from `'root member' | 'member' | 'not a member'`. Simpler and more robust.

## Brittleness flags

Any one of these changes upstream would break fGw's parser:
- fiatjaf changes the case of "invited by:" or "invited members:" (e.g., adds capitalization or tweaks the colon)
- fiatjaf wraps the lists in different CSS classes
- fiatjaf switches from `<nostr-name>` to a different element
- fiatjaf moves the inviter chain to a JSON endpoint (better!) and removes the templ block

The fGw parser should fail closed (return `{ inviters: [], invitees: [] }` on any structural mismatch), which the round-1 implementation already does.

## Recommendation for fGw

Either:
1. **Keep the parser**, but add a fallback that reads the status text first (`'root member'/'member'/'not a member'`) and only scrapes the lists when level > 0. Cheaper, more robust to template tweaks.
2. **Switch to NIP-86 over WebSocket** (preferred long-term). `ListAllowedPubKeys` returns a structured array with `reason: "invited by nostr:<npub>"` — no HTML parsing required.

## Cross-references

- Companion data model: [pyramid/members.go](2026-05-21-pyramid-members-go.md).
- Companion route registry: [main.go + handler.go](2026-05-21-pyramid-handler-go.md).
- fGw client: `/Users/garykrause/repos/fGw/src/lib/pyramid.ts` `parseMemberPage`.
