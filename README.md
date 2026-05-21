# fGw — Compost Marketplace for Farming God's Way Chapters

A Nostr-native app for Farming God's Way chapters to coordinate compost
building, labor events, and resource sharing. Built on a single chapter
relay for sovereignty and privacy. First chapter: Powder Keg Farms,
High View WV.

## Features
- Listings & offers for compost inputs, finished compost, seeds, labor
- Community labor events (pile builds, turn days, mulch drives) with RSVPs
- Compost pile lifecycle with FGW-spec turn schedule & local notifications
- Reputation reviews via NIP-32
- Invite-only chapter relay (Pyramid)
- Native iOS / Android / desktop (Tauri 2) + web
- Blossom photo uploads with EXIF strip + resize

## On-ramps
- **Project spec**: [SPEC.md](./SPEC.md) — every architectural decision
  and SPEC-001..035 work units
- **Knowledge base**: [.wiki/](./.wiki/) — FGW Field Guide reference,
  pile build/turn concepts, academic-standing topic, PFRP thesis,
  Pyramid integration
- **Quickstart**: `pnpm install && pnpm dev` for web; `pnpm tauri:dev`
  for native

Maintained by Ethan Tuttle. See SPEC § 8 for locked decisions.
