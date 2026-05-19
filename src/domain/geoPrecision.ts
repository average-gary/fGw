// Geo precision labels and geohash-truncation helper.
// Mirrors SPEC.md § 3.4 verbatim.

export type GeoPrecisionLabel = {
  chars: number;
  label: string;
  accuracy: string;
  defaultFor?: string[];
};

export const GEO_PRECISION_LABELS: Array<GeoPrecisionLabel> = [
  { chars: 4, label: 'Region', accuracy: '±20 km' },
  { chars: 5, label: 'Town', accuracy: '±2.4 km', defaultFor: ['listings', 'piles'] },
  { chars: 6, label: 'Neighborhood', accuracy: '±610 m' },
  { chars: 7, label: 'Street', accuracy: '±76 m', defaultFor: ['labor-events'] },
  { chars: 8, label: 'Address', accuracy: '±19 m' },
];

/**
 * Truncate a geohash to the requested character count. Returns the first
 * `chars` characters. Throws if `chars` exceeds the length of the input
 * (which would silently expand precision and is almost always a caller bug).
 */
export function truncateGeohash(hash: string, chars: number): string {
  if (chars > hash.length) {
    throw new Error(
      `truncateGeohash: requested ${chars} chars but input is only ${hash.length}`,
    );
  }
  return hash.slice(0, chars);
}
