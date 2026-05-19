/**
 * SPEC-013 — Nostr event encoder/decoder for piles (kind 30078).
 *
 * Encoded as parameterized-replaceable kind 30078 with `d:<slug>`. Content
 * is the JSON-stringified `Pile` object so consumers don't have to scrape
 * tags. Tags carry: `d`, `t:pile`, `a:34550:...` (chapter), optional
 * `g:<truncated geohash>`, `client`, and `version`.
 */
import { truncateGeohash } from '../../domain/geoPrecision';
import type { Pile } from './types';

export const PILE_EVENT_KIND = 30078 as const;
const CLIENT_TAG = 'compost-marketplace';

/** Default chapter `a`-tag — Powder Keg WV per SPEC. */
const DEFAULT_CHAPTER = {
  pubkey:
    '0000000000000000000000000000000000000000000000000000000000000000',
  d: 'powder-keg-wv',
};

/** Minimal Nostr event shape we accept on `parsePile`. */
export interface NostrEventLike {
  kind: number;
  content: string;
  tags: string[][];
  created_at?: number;
  pubkey?: string;
}

export function encodePile(
  pile: Pile,
  chapter?: { pubkey: string; d: string },
): {
  kind: typeof PILE_EVENT_KIND;
  content: string;
  tags: string[][];
  created_at: number;
} {
  const ch = chapter ?? DEFAULT_CHAPTER;
  const tags: string[][] = [
    ['d', pile.d],
    ['t', 'pile'],
    ['a', `34550:${ch.pubkey}:${ch.d}`],
  ];
  if (pile.geohash) {
    const truncated = pile.geoPrecision
      ? truncateGeohash(pile.geohash, pile.geoPrecision)
      : pile.geohash;
    tags.push(['g', truncated]);
  }
  tags.push(['client', CLIENT_TAG]);
  tags.push(['version', '1']);
  return {
    kind: PILE_EVENT_KIND,
    content: JSON.stringify(pile),
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Parse a Nostr event into a `Pile`. Returns `null` on:
 *   - wrong kind,
 *   - missing/empty `d` tag,
 *   - JSON parse failure,
 *   - version mismatch (must be `1`).
 */
export function parsePile(event: NostrEventLike): Pile | null {
  if (event.kind !== PILE_EVENT_KIND) return null;
  const dTag = event.tags.find((t) => t[0] === 'd');
  if (!dTag || !dTag[1]) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.content);
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as { version?: unknown }).version !== 1
  ) {
    return null;
  }
  const candidate = parsed as Pile;
  if (typeof candidate.d !== 'string' || candidate.d !== dTag[1]) return null;
  if (typeof candidate.builder !== 'string') return null;
  if (typeof candidate.timezone !== 'string') return null;
  return candidate;
}
