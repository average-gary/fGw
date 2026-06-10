---
title: "Estimation of the Path-Loss Exponent by Bayesian Filtering Method (Sensors / MDPI)"
type: paper
source: https://pmc.ncbi.nlm.nih.gov/articles/PMC7998977/
publication: Sensors (MDPI)
date: 2021
captured: 2026-06-09
quality: 5
evidence_strength: peer-reviewed-measurement
relevance: indirect (2.4 GHz 802.15.4 — same band as BLE, similar transmit class)
direction: nuances
tags: [path-loss, 2.4ghz, ble-range, outdoor, rssi, fgw]
summary: "Peer-reviewed propagation study at 2.4 GHz outdoor. XBee 802.15.4 @ 250 kbps, 60 measurements per distance at 1/5/10/15/20/25/35/50/75/100 m. Path-loss exponent ≈1.46 in flat outdoor field (free-space is 2.0). RSSI std deviation 4.26–6.04 dBm at receiver. Validates that 100 m line-of-sight at 2.4 GHz is achievable with BLE-class transmit power, but RSSI noise is too high to range-gate hops by signal strength alone."
---

# 2.4 GHz outdoor path-loss measurement

## What this paper is

Peer-reviewed measurement of 2.4 GHz radio propagation outdoors using XBee 802.15.4 modules. The radio class is analogous to BLE 5 LE 1M PHY at 0 dBm — same band, similar transmit power.

## Method

- Hardware: XBee 802.15.4 @ 2.4 GHz, 250 kbps
- 60 measurements per distance at 1, 5, 10, 15, 20, 25, 35, 50, 75, 100 m
- Conditions: 16 °C, 48% RH, **flat outdoor field, no foliage**

## Results

- **Path-loss exponent ~1.46** (very low — flat field; free-space is 2.0)
- **RSSI std deviation 4.26–6.04 dBm** at the receiver

## What this means for BLE on fGw

For a **flat WV pasture** (typical Powder Keg pile-build site) — 100 m line-of-sight at 2.4 GHz is empirically achievable with 802.15.4-class hardware; BLE 5 LE 1M PHY at 0 dBm sits near this regime.

With ~6 dBm RSSI noise, you cannot rely on signal strength to gate hops — you need actual delivery acks. (bitchat uses dedup + TTL, not RSSI gating, so this is consistent.)

## Concerning signals

- **Not BLE specifically** — XBee 802.15.4 has different MAC/PHY but same spectrum and similar power class
- **No foliage / forest measurements** — Powder Keg sites have tree lines, fence rows, hilltops; published BLE consumer-tests (S3 Semi) show 30–50 m phone-to-phone in line-of-sight, dropping to 10–20 m with bodies/trees
- **No packet-loss-vs-distance curve** in the paper — only RSSI

## Bottom-line empirical envelope for Powder Keg

For a 5-acre pile-build site (radius ~80 m):
- Line-of-sight: ~30–50 m phone-to-phone → 2 hops worst-case across the site
- Foliage / pockets / bodies: ~10–25 m → 3–4 hops needed
- bitchat's 7-hop cap is comfortable headroom for either case

But: **range alone is not the binding constraint**. Density (members within range) and Android background-execution rules are. See `bitchat-android.md` and the confounders agent's findings.
