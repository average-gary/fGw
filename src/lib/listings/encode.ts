// NIP-99 encoder. Produces an unsigned event shape; caller wraps it in
// `new NDKEvent(ndk, raw)` for signing/publishing.

import { truncateGeohash } from '../../domain/geoPrecision';
import {
  CHAPTER_A_TAG_DEFAULTS,
  DEFAULT_GEO_PRECISION,
  LISTING_EVENT_KIND,
  LISTING_VERSION,
  type Listing,
} from './types';

export type RawListingEvent = {
  kind: typeof LISTING_EVENT_KIND;
  content: string;
  tags: string[][];
  created_at: number;
};

export type EncodeOptions = {
  dSlug?: string;
  chapter?: { pubkey: string; d: string };
  createdAt?: number;
};

export type EncodeResult = RawListingEvent & { dSlug: string };

/**
 * Encode a `Listing` into a NIP-99 raw event. Tag order is stable for
 * diff-friendliness: d, title, summary, t, a, g, quantity, location,
 * imeta, a (pile), client, version, expiration.
 */
export function encodeListing(
  listing: Listing,
  opts: EncodeOptions = {},
): EncodeResult {
  const createdAt = opts.createdAt ?? Math.floor(Date.now() / 1000);
  const dSlug = opts.dSlug ?? deriveDSlug(listing.title, createdAt);
  const chapter = opts.chapter ?? CHAPTER_A_TAG_DEFAULTS;
  const tags: string[][] = [
    ['d', dSlug],
    ['title', listing.title],
    ['summary', listing.description],
    ['t', listing.kind === 'need' ? 'compost-need' : 'compost-offer'],
    ['t', `material:${listing.material}`],
    ['a', `34550:${chapter.pubkey}:${chapter.d}`],
  ];
  if (listing.geohash !== undefined) {
    const precision = listing.geoPrecision ?? DEFAULT_GEO_PRECISION;
    tags.push([
      'g',
      precision >= listing.geohash.length
        ? listing.geohash
        : truncateGeohash(listing.geohash, precision),
    ]);
  }
  if (listing.quantity) {
    tags.push(['quantity', String(listing.quantity.value), listing.quantity.unit]);
  }
  if (listing.locationText !== undefined) tags.push(['location', listing.locationText]);
  for (const p of listing.photos) {
    tags.push([
      'imeta',
      `url ${p.url}`,
      `m ${p.mime}`,
      `x ${p.sha256}`,
      `dim ${p.dim.w}x${p.dim.h}`,
      `size ${p.sizeBytes}`,
    ]);
  }
  if (listing.pileRef) {
    tags.push(['a', `${listing.pileRef.kind}:${listing.pileRef.pubkey}:${listing.pileRef.d}`]);
  }
  tags.push(['client', 'compost-marketplace']);
  tags.push(['version', String(LISTING_VERSION)]);
  if (listing.expiresAt !== undefined) tags.push(['expiration', String(listing.expiresAt)]);
  return {
    kind: LISTING_EVENT_KIND,
    content: listing.description,
    tags,
    created_at: createdAt,
    dSlug,
  };
}

/** Kebab-case slug from `title` plus a short base-36 suffix from
 * `createdAt` to keep replaceable-event `d`-tags unique per listing. */
function deriveDSlug(title: string, createdAt: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = createdAt.toString(36).slice(-6);
  return base ? `${base}-${suffix}` : suffix;
}
