import ngeohash from 'ngeohash';

/** Mean Earth radius in statute miles, used for haversine distance. */
export const EARTH_RADIUS_MI = 3958.7613;

/** Default precision for encoded geohashes (~76 m cells at the equator). */
const DEFAULT_PRECISION = 7;

const MILES_PER_DEG_LAT = 69.0; // ~constant for any latitude

/**
 * Approximate geohash cell width in miles, indexed by precision.
 * Values are the longer of (lat-extent, lon-extent) at the equator, in miles.
 * Used by `prefixesForRadiusMiles` to choose a precision whose cell size is
 * comparable to the requested radius.
 */
const CELL_WIDTH_MI: Record<number, number> = {
  1: 3125,
  2: 781,
  3: 97.6,
  4: 24.4, // ~39 km
  5: 3.05, // ~4.9 km
  6: 0.76, // ~1.2 km
  7: 0.095,
  8: 0.024,
};

/** Encode a (lat, lon) coordinate to a geohash of the given precision. */
export function encode(lat: number, lon: number, precision = DEFAULT_PRECISION): string {
  return ngeohash.encode(lat, lon, precision);
}

/** Decode a geohash to its center coordinate. */
export function decode(hash: string): { lat: number; lon: number } {
  const { latitude, longitude } = ngeohash.decode(hash);
  return { lat: latitude, lon: longitude };
}

/**
 * Compute the set of geohash cell prefixes that cover a circle of `miles`
 * radius around (`lat`, `lon`).
 *
 * Heuristic: pick the largest precision whose cell width is at least the
 * radius. This keeps the returned set small (typically 4–9 cells) while
 * guaranteeing the bounding box of the circle is fully covered. Any longer
 * geohash that begins with one of the returned prefixes is "in the area";
 * callers can then refine with an exact distance check.
 */
export function prefixesForRadiusMiles(
  lat: number,
  lon: number,
  miles: number,
): string[] {
  const radius = Math.max(miles, 0);
  let precision = 4;
  for (let p = 1; p <= 8; p++) {
    const width = CELL_WIDTH_MI[p];
    if (width !== undefined && width >= radius) precision = p;
  }

  const dLat = radius / MILES_PER_DEG_LAT;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  // Guard against division by zero near the poles.
  const dLon = radius / (MILES_PER_DEG_LAT * Math.max(cosLat, 1e-6));

  const minLat = lat - dLat;
  const maxLat = lat + dLat;
  const minLon = lon - dLon;
  const maxLon = lon + dLon;

  const cells = ngeohash.bboxes(minLat, minLon, maxLat, maxLon, precision);
  return Array.from(new Set(cells));
}

/**
 * Great-circle distance in statute miles between the centers of two geohashes.
 */
export function distanceMiles(a: string, b: string): number {
  const pa = decode(a);
  const pb = decode(b);
  return haversineMiles(pa.lat, pa.lon, pb.lat, pb.lon);
}

function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinDLon * sinDLon;
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  return EARTH_RADIUS_MI * c;
}
