---
title: "Why: alpha-bundle"
type: project-rationale
created: 2026-05-22
---

# Why ship an alpha bundle now?

After Wave 10 (commits 9feb6ec → efbe7aa) the codebase is the most-shippable
it has been: 287/287 tests, NIP-86 client verified end-to-end against
chat.virginiafreedom.tech, root-admin detection regression closed,
README + maintainer name in place, kind-22242 listener removed.

The Powder Keg chapter — the wiki's audience-of-one — needs the bundle
in their hands to start finding the bugs only humans find: copy that
reads wrong, taps that don't fire, photo-EXIF flows that crash on
specific iPhone models, NIP-46 bunker pairings that hang, etc. None of
that surfaces from a green test suite.

The alpha is **scoped to bundling and distribution only**. No new
features. The acceptance bar is "Gini installs the Android APK on her
phone and creates one real listing for the chapter, and one of us
installs the desktop build and creates one real pile."

iOS is deferred until Apple Developer enrollment makes TestFlight
viable. Web + Android + desktop covers the platforms the chapter
actually has access to today.
