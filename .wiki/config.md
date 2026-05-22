---
title: "Compost Marketplace Wiki"
description: "Knowledge base for fGw — the Powder Keg WV Farming God's Way compost marketplace on Nostr. Captures FGW invariants, app architecture, decision log, post-MVP follow-ups, and reference research (Pyramid relay, Blossom media, NIP-99/52/17/32)."
scope: |
  In-scope:
    - Farming God's Way (FGW) practice — compost recipe, turn schedule, planting station, mulch, management keys.
    - Powder Keg Farms (High View, WV) chapter context.
    - The fGw app's domain model, architecture, every SPEC, decision log, build/deploy process.
    - Nostr ecosystem references the app depends on: Pyramid relay, Blossom server, NIP-99/52/17/32/72/57.
    - Lessons learned and operational notes from real chapter use.
  Out-of-scope:
    - General Nostr development unrelated to this app.
    - Other FGW chapters' practices — link out, don't duplicate.
created: 2026-05-20
---

# Compost Marketplace Wiki Configuration

This wiki is the canonical knowledge base for the **fGw** repository — a Tauri 2 + Vite + React + TS application that lets the Powder Keg WV chapter of Farming God's Way coordinate compost-pile builds, listings, and labor events over a single invite-only Nostr relay (`wss://chat.virginiafreedom.tech`).

The wiki ships *with* the repo (`.wiki/` is committed, not gitignored) so any chapter steward forking this codebase gets the full design history, architecture decisions, and operational playbook in one place.
