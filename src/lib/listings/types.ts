// NIP-99 listing types for compost needs/offers (SPEC-011).

import type { MaterialKind } from '../../domain/materials';
import type { Quantity } from '../../domain/quantity';

export type AddressableRef = {
  kind: number;
  pubkey: string;
  d: string;
  relay?: string;
};

export type PhotoRef = {
  url: string;
  sha256: string;
  dim: { w: number; h: number };
  mime: 'image/jpeg' | 'image/png';
  sizeBytes: number;
};

/**
 * A listing before NIP-99 encoding. `geohash` is truncated to
 * `geoPrecision` chars before being emitted as a `g`-tag.
 */
export interface Listing {
  kind: 'need' | 'offer';
  material: MaterialKind;
  title: string;
  description: string;
  quantity?: Quantity;
  geohash?: string;
  geoPrecision?: number;
  locationText?: string;
  expiresAt?: number;
  photos: PhotoRef[];
  pileRef?: AddressableRef;
  version: 1;
}

/**
 * Placeholder pointers to the Powder Keg WV chapter community
 * (kind 34550). Pubkey is TBD until the chapter steward signs the
 * 34550 community event; `d` slug is stable.
 */
export const CHAPTER_A_TAG_DEFAULTS = {
  pubkey:
    '0000000000000000000000000000000000000000000000000000000000000000', // TBD
  d: 'powder-keg-wv',
} as const;

export const LISTING_VERSION = 1 as const;
export const LISTING_EVENT_KIND = 30402 as const;
export const DEFAULT_GEO_PRECISION = 5 as const;
