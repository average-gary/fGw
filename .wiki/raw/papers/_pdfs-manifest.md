---
title: FGW Primary Source PDFs - Manifest
generated: 2026-06-09
phase: fgw-full-guide Phase 1
notes: |
  Primary Farming God's Way source PDFs downloaded into the wiki layer
  (.wiki/raw/papers/pdfs/) with parallel layout-preserving text extracts in
  .wiki/raw/papers/extracts/. PDFs intentionally live in the wiki layer, not
  in the repo's public/ directory.
---

# FGW Source PDFs Manifest

| key             | source_url                                                                                  | retrieved   | bytes    | sha256                                                             | page_count |
|-----------------|---------------------------------------------------------------------------------------------|-------------|----------|--------------------------------------------------------------------|------------|
| field-guide     | https://www.farming-gods-way.org/Resources/FGW_Field_Guide.pdf                              | 2026-06-09  | 2498133  | 6e1b457e9b7851b5310c2fe22298d3c8d84c2be414de2d86172ed343dfd6b155   | 48         |
| trainers-guide  | https://www.farming-gods-way.org/Resources/FGW_Trainers_Reference_Guide.pdf                 | 2026-06-09  | 10957508 | d5a7dd74c7e8a098820d41165774aff1d960115fc161f42dbd8fae9050aa8307   | 178        |
| vegetable-guide | https://www.farming-gods-way.org/Resources/FGW_Vegetable_Guide_2nd_Edition.pdf              | 2026-06-09  | 10071774 | a43b602668a33d5ff86627f9d183dec4a2e6a78781512d493302109a91ebbb47   | 90         |
| sequence-maize  | https://www.farming-gods-way.org/Resources/FGW_Master_Sequence_Maize.pdf                    | 2026-06-09  | 1505384  | 73f89749ef981914327bb30cc0ba30e64f5d4c3b26f10e426ad60b7848a3bd67   | 1          |
| sequence-beans  | https://www.farming-gods-way.org/Resources/FGW_Master_Sequence_Beans.pdf                    | 2026-06-09  | 4342159  | f6505d49c8523c8749ee2ab43e90da8cf67d68ad509a5afc1dfc1e32009161da   | 1          |

## File Layout

```
.wiki/raw/papers/
  pdfs/
    field-guide.pdf
    trainers-guide.pdf
    vegetable-guide.pdf
    sequence-maize.pdf
    sequence-beans.pdf
  extracts/
    field-guide.txt
    trainers-guide.txt
    vegetable-guide.txt
    sequence-maize.txt
    sequence-beans.txt
```

## Extraction Method

- Downloads: `curl -fsSL --max-time 60` (300s for trainers-guide).
- Text extraction: `pdftotext -layout` (poppler).
- Page counts: `pdfinfo`.
- Hashes: `shasum -a 256`; sizes: `stat -f%z`.

All five primary sources downloaded successfully on first attempt; no retries were needed and no entries are marked FAILED.
