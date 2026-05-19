import { describe, expect, it } from 'vitest';
import { encodeListing } from './encode';
import { parseListing } from './parse';
import {
  CHAPTER_A_TAG_DEFAULTS,
  LISTING_EVENT_KIND,
  type Listing,
} from './types';

const fullListing: Listing = {
  kind: 'offer',
  material: 'compost-finished',
  title: 'Aged compost — pickup in High View',
  description: '4 wheelbarrows of finished compost, screened. BYO bags.',
  quantity: { value: 4, unit: 'wheelbarrow' },
  geohash: 'dqbnd',
  geoPrecision: 5,
  locationText: 'High View, WV',
  expiresAt: 1_900_000_000,
  photos: [
    {
      url: 'https://blossom.example/abc.jpg',
      sha256:
        'a'.repeat(64),
      dim: { w: 1024, h: 768 },
      mime: 'image/jpeg',
      sizeBytes: 234567,
    },
  ],
  pileRef: {
    kind: 30078,
    pubkey: 'b'.repeat(64),
    d: 'pile-2026-spring',
  },
  version: 1,
};

describe('encodeListing / parseListing round trip', () => {
  it('preserves all fields end-to-end', () => {
    const encoded = encodeListing(fullListing, {
      dSlug: 'aged-compost-pickup-test',
      createdAt: 1_700_000_000,
    });
    const parsed = parseListing(encoded);
    expect(parsed).toEqual(fullListing);
  });

  it('emits kind 30402', () => {
    const encoded = encodeListing(fullListing);
    expect(encoded.kind).toBe(LISTING_EVENT_KIND);
  });

  it('puts description into content for compatibility', () => {
    const encoded = encodeListing(fullListing);
    expect(encoded.content).toBe(fullListing.description);
  });

  it('round-trips a minimal need with no optional fields', () => {
    const minimal: Listing = {
      kind: 'need',
      material: 'dry-leaves',
      title: 'Need leaves',
      description: 'Anyone bagging leaves this fall?',
      photos: [],
      version: 1,
    };
    const encoded = encodeListing(minimal, {
      dSlug: 'need-leaves-test',
      createdAt: 1_700_000_000,
    });
    const parsed = parseListing(encoded);
    expect(parsed).toEqual(minimal);
  });
});

describe('encodeListing tag emission', () => {
  it('truncates geohash to geoPrecision chars', () => {
    const encoded = encodeListing(
      { ...fullListing, geohash: 'dnv5xyz', geoPrecision: 5 },
      { dSlug: 'gh-test', createdAt: 1 },
    );
    const gTag = encoded.tags.find((t) => t[0] === 'g');
    expect(gTag?.[1]).toBe('dnv5x');
    expect(gTag?.[1]).toHaveLength(5);
  });

  it('emits d before title', () => {
    const encoded = encodeListing(fullListing, {
      dSlug: 'order-test',
      createdAt: 1,
    });
    const dIdx = encoded.tags.findIndex((t) => t[0] === 'd');
    const titleIdx = encoded.tags.findIndex((t) => t[0] === 'title');
    expect(dIdx).toBeGreaterThanOrEqual(0);
    expect(dIdx).toBeLessThan(titleIdx);
  });

  it('emits the chapter `a`-tag with the placeholder defaults when none is supplied', () => {
    const encoded = encodeListing(fullListing, {
      dSlug: 'chap-test',
      createdAt: 1,
    });
    const aTags = encoded.tags.filter((t) => t[0] === 'a');
    const expected = `34550:${CHAPTER_A_TAG_DEFAULTS.pubkey}:${CHAPTER_A_TAG_DEFAULTS.d}`;
    expect(aTags.some((t) => t[1] === expected)).toBe(true);
  });

  it('emits one imeta tag per photo with all required fields', () => {
    const encoded = encodeListing(fullListing, {
      dSlug: 'photo-test',
      createdAt: 1,
    });
    const imeta = encoded.tags.filter((t) => t[0] === 'imeta');
    expect(imeta).toHaveLength(1);
    const tag = imeta[0]!;
    expect(tag).toContain('url https://blossom.example/abc.jpg');
    expect(tag).toContain('m image/jpeg');
    expect(tag).toContain(`x ${'a'.repeat(64)}`);
    expect(tag).toContain('dim 1024x768');
    expect(tag).toContain('size 234567');
  });

  it('auto-derives a kebab-case dSlug when not provided', () => {
    const encoded = encodeListing(fullListing, { createdAt: 1_700_000_000 });
    expect(encoded.dSlug.startsWith('aged-compost-pickup-in-high-view-')).toBe(
      true,
    );
  });
});

describe('parseListing rejection', () => {
  it('returns null for the wrong event kind', () => {
    const encoded = encodeListing(fullListing, {
      dSlug: 'wrong-kind',
      createdAt: 1,
    });
    expect(parseListing({ ...encoded, kind: 1 })).toBeNull();
  });

  it('returns null when version is not 1', () => {
    const encoded = encodeListing(fullListing, {
      dSlug: 'wrong-version',
      createdAt: 1,
    });
    const tampered = {
      ...encoded,
      tags: encoded.tags.map((t) =>
        t[0] === 'version' ? ['version', '2'] : t,
      ),
    };
    expect(parseListing(tampered)).toBeNull();
  });

  it('returns null when material is unknown', () => {
    const encoded = encodeListing(fullListing, {
      dSlug: 'bad-material',
      createdAt: 1,
    });
    const tampered = {
      ...encoded,
      tags: encoded.tags.map((t) =>
        t[0] === 't' && t[1]?.startsWith('material:')
          ? ['t', 'material:pixie-dust']
          : t,
      ),
    };
    expect(parseListing(tampered)).toBeNull();
  });

  it('returns null when the need/offer t-tag is missing', () => {
    const encoded = encodeListing(fullListing, {
      dSlug: 'no-need-offer',
      createdAt: 1,
    });
    const tampered = {
      ...encoded,
      tags: encoded.tags.filter(
        (t) => !(t[0] === 't' && (t[1] === 'compost-need' || t[1] === 'compost-offer')),
      ),
    };
    expect(parseListing(tampered)).toBeNull();
  });

  it('tolerates unknown extra tags without breaking', () => {
    const encoded = encodeListing(fullListing, {
      dSlug: 'extra-tag',
      createdAt: 1_700_000_000,
    });
    const augmented = {
      ...encoded,
      tags: [...encoded.tags, ['some-future-tag', 'whatever']],
    };
    expect(parseListing(augmented)).not.toBeNull();
  });
});
