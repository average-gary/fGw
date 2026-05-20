/**
 * SPEC-023 — Map route tests.
 *
 * react-leaflet is mocked because the actual Leaflet renderer needs a real
 * DOM (offsetWidth, etc) which happy-dom does not provide reliably. We swap
 * `MapContainer`, `TileLayer`, `Marker`, `Popup` with thin div stubs that
 * surface their props as `data-*` attributes for assertion.
 *
 * The relay layer reuses the in-memory mock pattern from `Feed.test.tsx`.
 * We seed three NIP-99 listings at three known geohashes (`dnv5x`,
 * `dqfg7`, `9q8yy`) plus one geo-less listing, then assert exactly three
 * `data-testid="marker"` nodes render and their decoded positions match
 * the geohash centers within 0.01°.
 */
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// localStorage shim — required because zustand-persist tries to read it on
// import. Hoisted so it lands before any imports.
// ---------------------------------------------------------------------------
const memStore = vi.hoisted(() => {
  class MemoryStorage {
    private m = new Map<string, string>();
    get length(): number {
      return this.m.size;
    }
    clear(): void {
      this.m.clear();
    }
    getItem(k: string): string | null {
      return this.m.has(k) ? (this.m.get(k) as string) : null;
    }
    key(i: number): string | null {
      return Array.from(this.m.keys())[i] ?? null;
    }
    removeItem(k: string): void {
      this.m.delete(k);
    }
    setItem(k: string, v: string): void {
      this.m.set(k, String(v));
    }
  }
  const s = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: s,
    configurable: true,
    writable: true,
  });
  return s;
});

// ---------------------------------------------------------------------------
// Mock the leaflet CSS import — vitest can't resolve CSS without a plugin.
// ---------------------------------------------------------------------------
vi.mock('leaflet/dist/leaflet.css', () => ({}));

// ---------------------------------------------------------------------------
// Mock leaflet itself — the real lib reaches for `window` / `document`
// internals that aren't kind to happy-dom in headless tests. The route
// only uses `L.divIcon()`, so a thin stub is enough.
// ---------------------------------------------------------------------------
vi.mock('leaflet', () => {
  const divIcon = (opts: unknown) => ({ __divIcon: true, opts });
  return {
    default: { divIcon },
    divIcon,
  };
});

// ---------------------------------------------------------------------------
// Mock react-leaflet — render plain divs that capture the props we care
// about (center, position) as `data-*` attrs for assertion.
// ---------------------------------------------------------------------------
vi.mock('react-leaflet', () => {
  type Pos = [number, number];
  return {
    MapContainer: ({
      children,
      center,
    }: {
      children?: ReactNode;
      center?: Pos;
    }) => (
      <div data-testid="map" data-center={JSON.stringify(center)}>
        {children}
      </div>
    ),
    TileLayer: ({ url, attribution }: { url?: string; attribution?: string }) => (
      <div data-testid="tile-layer" data-url={url} data-attribution={attribution} />
    ),
    Marker: ({
      children,
      position,
    }: {
      children?: ReactNode;
      position?: Pos;
    }) => (
      <div data-testid="marker" data-position={JSON.stringify(position)}>
        {children}
      </div>
    ),
    Popup: ({ children }: { children?: ReactNode }) => (
      <div data-testid="popup">{children}</div>
    ),
  };
});

// ---------------------------------------------------------------------------
// In-memory mock relay — copy of the Feed.test.tsx pattern.
// ---------------------------------------------------------------------------
type RelayEvent = {
  id?: string;
  kind?: number;
  pubkey?: string;
  content: string;
  tags: string[][];
  created_at: number;
  sig?: string;
};
type Listener = (e: RelayEvent) => void;
type Filter = {
  kinds?: number[];
  authors?: string[];
  '#a'?: string[];
  '#p'?: string[];
  limit?: number;
};
interface Subscription {
  filter: Filter;
  handler: Listener;
  active: boolean;
}

const mockState = vi.hoisted(() => {
  function matchesLocal(e: RelayEvent, f: Filter): boolean {
    if (f.kinds && e.kind !== undefined && !f.kinds.includes(e.kind)) return false;
    if (f.authors && e.pubkey && !f.authors.includes(e.pubkey)) return false;
    if (f['#a']) {
      const aTags = e.tags.filter((t) => t[0] === 'a').map((t) => t[1]);
      if (!f['#a'].some((a) => aTags.includes(a))) return false;
    }
    if (f['#p']) {
      const pTags = e.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
      if (!f['#p'].some((p) => pTags.includes(p))) return false;
    }
    return true;
  }
  const state = {
    events: [] as RelayEvent[],
    subs: [] as Subscription[],
    publish(e: RelayEvent): Promise<void> {
      state.events.push(e);
      for (const sub of state.subs) {
        if (!sub.active) continue;
        if (matchesLocal(e, sub.filter)) sub.handler(e);
      }
      return Promise.resolve();
    },
    subscribe(filter: Filter, handlers: { onEvent?: Listener }): { stop: () => void } {
      const sub: Subscription = {
        filter,
        handler: handlers.onEvent ?? (() => {}),
        active: true,
      };
      state.subs.push(sub);
      for (const e of state.events) {
        if (matchesLocal(e, sub.filter)) sub.handler(e);
      }
      return {
        stop: () => {
          sub.active = false;
        },
      };
    },
  };
  return state;
});

function resetRelay(): void {
  mockState.events.length = 0;
  mockState.subs.length = 0;
}

vi.mock('@/lib/ndk', () => ({
  getNdk: () => mockState,
  currentRelay: () => 'wss://mock.example',
  setRelayToast: () => {},
  addRelay: () => {},
}));

// ---------------------------------------------------------------------------
// Now the imports under test.
// ---------------------------------------------------------------------------
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Map as MapRoute } from './Map';
import { encodeListing } from '@/lib/listings/encode';
import { CHAPTER_A_TAG_DEFAULTS, type AddressableRef } from '@/lib/listings/types';
import type { Listing } from '@/lib/listings/types';
import { decode } from '@/lib/geohash';

const CHAPTER = {
  pubkey: CHAPTER_A_TAG_DEFAULTS.pubkey,
  d: CHAPTER_A_TAG_DEFAULTS.d,
};

const AUTHOR_A = 'a'.repeat(64);
const AUTHOR_B = 'b'.repeat(64);
const AUTHOR_C = 'c'.repeat(64);
const AUTHOR_D = 'd'.repeat(64);

function seedListing(
  pubkey: string,
  listing: Listing,
  dSlug: string,
  createdAt: number,
): void {
  const env = encodeListing(listing, { dSlug, chapter: CHAPTER, createdAt });
  const raw: RelayEvent = {
    id: `id:${dSlug}`,
    kind: env.kind,
    pubkey,
    content: env.content,
    tags: env.tags,
    created_at: env.created_at,
    sig: 'sig:' + dSlug,
  };
  void mockState.publish(raw);
}

beforeEach(() => {
  memStore.clear();
  resetRelay();
});

afterEach(() => {
  cleanup();
});

describe('SPEC-023 Map route', () => {
  it('renders the loading spinner during the grace window when no events have arrived', () => {
    render(<MapRoute />);
    // Spinner contributes a status node. The MapContainer stub also renders.
    expect(screen.getByTestId('map')).toBeTruthy();
    expect(screen.queryByText(/Nothing here yet/i)).toBeNull();
  });

  it('shows the empty-state card after the grace window with no events', async () => {
    render(<MapRoute />);
    await waitFor(
      () => {
        expect(screen.getByText(/Nothing here yet/i)).toBeTruthy();
      },
      { timeout: 2000 },
    );
  });

  it('renders one marker per geo-tagged listing with decoded lat/lon positions', async () => {
    const now = Math.floor(Date.now() / 1000);

    seedListing(
      AUTHOR_A,
      {
        kind: 'offer',
        material: 'green-grass',
        title: 'Powder Keg yard waste',
        description: 'Summer cuttings.',
        photos: [],
        geohash: 'dnv5x',
        version: 1,
      },
      'pk-grass',
      now - 30,
    );
    seedListing(
      AUTHOR_B,
      {
        kind: 'need',
        material: 'manure-fresh',
        title: 'Coastal need',
        description: 'For spring builds.',
        photos: [],
        geohash: 'dqfg7',
        version: 1,
      },
      'coast-manure',
      now - 60,
    );
    seedListing(
      AUTHOR_C,
      {
        kind: 'offer',
        material: 'dry-leaves',
        title: 'Bay Area leaves',
        description: 'Fall windfall.',
        photos: [],
        geohash: '9q8yy',
        version: 1,
      },
      'bay-leaves',
      now - 90,
    );
    // Geo-less listing — must be skipped (not on map at all).
    seedListing(
      AUTHOR_D,
      {
        kind: 'need',
        material: 'woody-shavings',
        title: 'Anywhere chips',
        description: 'Open to drop-off.',
        photos: [],
        version: 1,
      },
      'no-geo',
      now - 120,
    );

    render(<MapRoute />);

    let markers!: HTMLElement[];
    await waitFor(() => {
      markers = screen.getAllByTestId('marker');
      expect(markers).toHaveLength(3);
    });

    const positions = markers
      .map((m) => JSON.parse(m.getAttribute('data-position') ?? 'null'))
      .filter(Boolean) as [number, number][];

    const expected = ['dnv5x', 'dqfg7', '9q8yy'].map((h) => decode(h));

    // Every expected geohash center should be present (within 0.01°).
    for (const e of expected) {
      const hit = positions.find(
        ([lat, lon]) => Math.abs(lat - e.lat) < 0.01 && Math.abs(lon - e.lon) < 0.01,
      );
      expect(hit).toBeTruthy();
    }
  });

  it('omits listings without a geohash from the map entirely', async () => {
    const now = Math.floor(Date.now() / 1000);
    // Only seed a geo-less listing.
    seedListing(
      AUTHOR_A,
      {
        kind: 'need',
        material: 'woody-shavings',
        title: 'Anywhere chips',
        description: 'Open to drop-off.',
        photos: [],
        version: 1,
      },
      'no-geo-only',
      now - 5,
    );

    render(<MapRoute />);

    // The empty-state branch fires after the 500 ms grace window because
    // `receivedAny` stays false: the only seeded event lacks geohash so
    // toPin() returns null.
    await waitFor(
      () => {
        expect(screen.getByText(/Nothing here yet/i)).toBeTruthy();
      },
      { timeout: 2000 },
    );
    expect(screen.queryAllByTestId('marker')).toHaveLength(0);
  });

  it('renders a tile layer with the OpenStreetMap URL + attribution', async () => {
    render(<MapRoute />);
    const tile = await screen.findByTestId('tile-layer');
    expect(tile.getAttribute('data-url')).toContain('tile.openstreetmap.org');
    expect(tile.getAttribute('data-attribution')).toContain('OpenStreetMap');
  });

  it('centers on Powder Keg WV by default when location is not enabled', () => {
    render(<MapRoute />);
    const map = screen.getByTestId('map');
    const center = JSON.parse(map.getAttribute('data-center') ?? 'null');
    expect(center).toBeTruthy();
    expect(Math.abs(center[0] - 39.118)).toBeLessThan(0.01);
    expect(Math.abs(center[1] - -78.66)).toBeLessThan(0.01);
  });

  it('Open button on a listing popup invokes onOpenListing with the addressable ref', async () => {
    const user = userEvent.setup();
    const now = Math.floor(Date.now() / 1000);
    seedListing(
      AUTHOR_A,
      {
        kind: 'offer',
        material: 'green-grass',
        title: 'Popup test',
        description: 'click me',
        photos: [],
        geohash: 'dnv5x',
        version: 1,
      },
      'popup-test',
      now,
    );

    const onOpenListing: (ref: AddressableRef) => void = vi.fn();
    render(<MapRoute onOpenListing={onOpenListing} />);

    const opens = await screen.findAllByRole('button', { name: 'Open' });
    expect(opens.length).toBeGreaterThan(0);
    const first = opens[0];
    expect(first).toBeTruthy();
    await user.click(first as HTMLElement);

    const mock = onOpenListing as unknown as ReturnType<typeof vi.fn>;
    expect(mock).toHaveBeenCalledTimes(1);
    const ref = mock.mock.calls[0]?.[0] as AddressableRef;
    expect(ref.kind).toBe(30402);
    expect(ref.pubkey).toBe(AUTHOR_A);
    expect(ref.d).toBe('popup-test');
  });
});
