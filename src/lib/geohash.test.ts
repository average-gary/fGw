import { describe, expect, it } from 'vitest';
import {
  decode,
  distanceMiles,
  encode,
  prefixesForRadiusMiles,
} from './geohash';

// High View, WV — the canonical reference point from SPEC-001.
const HV_LAT = 39.118;
const HV_LON = -78.66;

describe('encode / decode', () => {
  // Note: SPEC-003 references the "dnv" cell, but ngeohash places
  // (39.118, -78.66) inside the "dqb" cell at precision 3 (dqbnd at p5).
  // The "dnv" cell decodes to ~38.67°N, -82.27°W (Ohio/KY), so the spec's
  // letters are off; "dqb" is the true High View, WV prefix.
  it('encodes High View, WV at precision 5 inside the dqb cell', () => {
    const h = encode(HV_LAT, HV_LON, 5);
    expect(h).toHaveLength(5);
    expect(h.startsWith('dqb')).toBe(true);
  });

  it('round-trips within ~76 m at precision 7', () => {
    const { lat, lon } = decode(encode(HV_LAT, HV_LON, 7));
    expect(Math.abs(lat - HV_LAT)).toBeLessThan(0.001);
    expect(Math.abs(lon - HV_LON)).toBeLessThan(0.001);
  });
});

describe('distanceMiles', () => {
  it('is zero between identical hashes', () => {
    const h = encode(HV_LAT, HV_LON, 7);
    expect(distanceMiles(h, h)).toBe(0);
  });

  // SPEC-003 quotes "~38–42 mi" but the true haversine distance between
  // (39.118, -78.66) and (39.0, -78.0) is ~36.3 mi; widened accordingly.
  it('measures ~35–42 mi between High View and (39.0, -78.0)', () => {
    const a = encode(HV_LAT, HV_LON, 7);
    const b = encode(39.0, -78.0, 7);
    const d = distanceMiles(a, b);
    expect(d).toBeGreaterThan(35);
    expect(d).toBeLessThan(42);
  });
});

describe('prefixesForRadiusMiles', () => {
  it('covers a nearby point and excludes a far one', () => {
    const prefixes = prefixesForRadiusMiles(HV_LAT, HV_LON, 15);
    expect(prefixes.length).toBeGreaterThan(0);

    // ~7 mi north — should be inside the radius coverage.
    const nearHash = encode(HV_LAT + 0.1, HV_LON, 7);
    expect(prefixes.some((p) => nearHash.startsWith(p))).toBe(true);

    // ~69 mi north — should be outside.
    const farHash = encode(HV_LAT + 1.0, HV_LON, 7);
    expect(prefixes.some((p) => farHash.startsWith(p))).toBe(false);
  });

  it('returns unique prefixes', () => {
    const prefixes = prefixesForRadiusMiles(HV_LAT, HV_LON, 15);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
