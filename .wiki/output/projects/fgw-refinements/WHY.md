# FGW Refinements

Land the round-2 + round-3 wiki findings as code: PFRP-compliance badge on `PileDetail`, climate-disclaimer banner on the Learn page, `TurnRecord` temperatureMethod discriminator, Pyramid client surgery (replace `/allow` + `/ban` + `/allowed` + `/banned` with NIP-86 over WebSocket; drop the kind-22242 listener; add `disable`/`enable` actions), README.md at repo root, and the SPEC § 2.2 honesty patch.

## Context

Two prior research rounds built up enough wiki knowledge to act on:

- **`/wiki:assess --local --retardmax`** (round 2, `output/assess-fGw-2026-05-20-r2.md`) confirmed 11 alignments, surfaced 14 build opportunities, and flagged 4 documentation-drift findings. Top-3 build moves: PFRP-compliance badge, climate-disclaimer banner, TurnRecord temperatureMethod.
- **`/wiki:research "fiatjaf pyramid invite-only relay HTTP API kind-22242"`** (round 3, `wiki/topics/pyramid-in-fgw.md`) revealed that `src/lib/pyramid.ts` is partially broken against current Pyramid: it calls endpoints (`/allow`, `/ban`, `/allowed`, `/banned`) that don't exist, uses NIP-98 auth that Pyramid doesn't accept, and subscribes to kind-22242 as a "membership-change push" channel that NIP-42 reserves for AUTH only.

Both findings are anchored in primary-source articles (FGW Field Guide, EPA 40 CFR § 503 PFRP, NIP-42 spec, Pyramid Go source) so the implementation work has clear citations and acceptance criteria.

This project gives the work a single home: WHY here, the implementation plan and any per-SPEC playbooks land alongside as additional members.

## Current state

- **Wiki**: 21 raw sources + 10 compiled articles. Two `output/` reports already in flat `output/`: `assess-fGw-2026-05-20.md` (round 1) and `assess-fGw-2026-05-20-r2.md` (round 2). They stay where they are — they're chapter-wide, not project-scoped.
- **Code**: 267/267 tests passing (waves 0–9 + post-MVP SPEC-030..035). The Pyramid client is the only known regression surface; the FGW/PFRP/climate items are additive.
- **Next step**: run `/wiki:plan --project fgw-refinements --local "implementation plan to refine fGw per round-2 + round-3 wiki findings"` to generate the implementation plan, then iterate per SPEC.
- **Outstanding question**: NIP-86 wire format and NDK 2.18 support depth — flagged as a research gap in round 3; may need a targeted `/wiki:research` before SPEC-049 (Pyramid surgery) is fully grounded.
