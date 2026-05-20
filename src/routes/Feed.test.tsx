/**
 * SPEC-018 — Feed route tests.
 *
 * Mocks NDK with the in-memory mock-relay pattern (mirrors `Calendar.test.tsx`
 * + `NewListing.test.tsx`). Synthetic events are produced via the canonical
 * `encodeListing` / `encodeLaborEvent` helpers so the on-the-wire shape is
 * identical to what production publishers emit (no hand-rolled tags).
 *
 * Production behaviour documented by these tests:
 *   • The material `<Select>` filter is *exclusive of labor events* —
 *     events have no material, so picking any specific material implicitly
 *     hides them. Feed.tsx also disables the material Select when the
 *     kind chip === 'event' to prevent users entering a contradictory state.
 *   • The kind chip 'event' shows only kind-31923 labor events.
 *   • While `receivedAny === false` and the 500 ms grace window has not
 *     elapsed, a `role="status"` Spinner is rendered. After the grace
 *     window with no events, the "Nothing here yet" Card is rendered.
 *
 * No patches were applied to `Feed.tsx`; it compiled and rendered against
 * the production code as-is.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// localStorage shim — must land before any zustand-persist module imports.
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
// In-memory mock relay. Filters supported: kinds, authors, '#a', '#p'.
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
      // Replay matching events that already exist so subscribers started
      // after publish still see them — mirrors the Calendar.test mock.
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

// ---------------------------------------------------------------------------
// Mock NDK so getNdk returns the relay shape directly.
// ---------------------------------------------------------------------------
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
import { Feed } from './Feed';
import { encodeListing } from '@/lib/listings/encode';
import { encodeLaborEvent } from '@/lib/events/calendar';
import { CHAPTER_A_TAG_DEFAULTS } from '@/lib/listings/types';
import type { Listing } from '@/lib/listings/types';
import type { LaborEvent } from '@/lib/events/types';
import { _resetProfileForTests } from '@/lib/profile';

const CHAPTER = {
  pubkey: CHAPTER_A_TAG_DEFAULTS.pubkey,
  d: CHAPTER_A_TAG_DEFAULTS.d,
};

const AUTHOR_A = 'a'.repeat(64);
const AUTHOR_B = 'b'.repeat(64);
const AUTHOR_C = 'c'.repeat(64);

function seedListing(
  pubkey: string,
  listing: Listing,
  dSlug: string,
  createdAt: number,
): { id: string; dSlug: string } {
  const env = encodeListing(listing, { dSlug, chapter: CHAPTER, createdAt });
  const id = `id:listing:${dSlug}`;
  const raw: RelayEvent = {
    id,
    kind: env.kind,
    pubkey,
    content: env.content,
    tags: env.tags,
    created_at: env.created_at,
    sig: 'sig:' + dSlug,
  };
  void mockState.publish(raw);
  return { id, dSlug };
}

function seedLaborEvent(
  pubkey: string,
  ev: LaborEvent,
  dSlug: string,
): { id: string; dSlug: string } {
  const env = encodeLaborEvent(ev, { dSlug, chapter: CHAPTER });
  const id = `id:labor:${dSlug}`;
  const raw: RelayEvent = {
    id,
    kind: env.kind,
    pubkey,
    content: env.content,
    tags: env.tags,
    created_at: env.created_at,
    sig: 'sig:' + dSlug,
  };
  void mockState.publish(raw);
  return { id, dSlug };
}

beforeEach(() => {
  memStore.clear();
  resetRelay();
  _resetProfileForTests();
});

afterEach(() => {
  cleanup();
});

describe('SPEC-018 Feed', () => {
  it('renders the loading spinner during the grace window when no events have arrived', () => {
    render(<Feed />);
    // Spinner contributes two `role=status` nodes (outer wrapper + inner sr-only).
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    // Empty-state card must not be present yet.
    expect(screen.queryByText(/Nothing here yet/i)).toBeNull();
  });

  it('shows the empty-state card after the grace window with no events', async () => {
    render(<Feed />);
    await waitFor(
      () => {
        expect(screen.getByText(/Nothing here yet/i)).toBeTruthy();
      },
      { timeout: 2000 },
    );
    // Subhead should reflect the "no items yet" branch (receivedAny === false).
    expect(screen.getByText(/Listening on the chapter relay/i)).toBeTruthy();
  });

  it('renders a mixed feed of two listings + one labor event as cards', async () => {
    const now = Math.floor(Date.now() / 1000);

    // Need: fresh manure
    seedListing(
      AUTHOR_A,
      {
        kind: 'need',
        material: 'manure-fresh',
        title: 'Need fresh manure',
        description: 'For spring builds.',
        photos: [],
        version: 1,
      },
      'need-fresh-manure',
      now - 30,
    );
    // Offer: grass clippings
    seedListing(
      AUTHOR_B,
      {
        kind: 'offer',
        material: 'green-grass',
        title: 'Offering grass clippings',
        description: 'Pickup from yard waste pile.',
        photos: [],
        version: 1,
      },
      'offer-grass-clippings',
      now - 60,
    );
    // Labor event
    seedLaborEvent(
      AUTHOR_C,
      {
        kind: 'pile-turn',
        title: 'Turn the front pile',
        description: 'Bring pitchforks.',
        start: now + 5 * 86400,
        version: 1,
      },
      'turn-front-pile',
    );

    render(<Feed />);

    await waitFor(() => {
      expect(screen.getByText('Need fresh manure')).toBeTruthy();
      expect(screen.getByText('Offering grass clippings')).toBeTruthy();
      expect(screen.getByText('Turn the front pile')).toBeTruthy();
    });
  });

  it('material filter = manure-fresh keeps only the manure listing (and hides labor events)', async () => {
    const user = userEvent.setup();
    const now = Math.floor(Date.now() / 1000);

    seedListing(
      AUTHOR_A,
      {
        kind: 'need',
        material: 'manure-fresh',
        title: 'Need fresh manure',
        description: 'For spring builds.',
        photos: [],
        version: 1,
      },
      'need-fresh-manure',
      now - 30,
    );
    seedListing(
      AUTHOR_B,
      {
        kind: 'offer',
        material: 'green-grass',
        title: 'Offering grass clippings',
        description: 'Pickup from yard waste pile.',
        photos: [],
        version: 1,
      },
      'offer-grass-clippings',
      now - 60,
    );
    seedLaborEvent(
      AUTHOR_C,
      {
        kind: 'pile-turn',
        title: 'Turn the front pile',
        description: 'Bring pitchforks.',
        start: now + 5 * 86400,
        version: 1,
      },
      'turn-front-pile',
    );

    render(<Feed />);

    await waitFor(() => {
      expect(screen.getByText('Need fresh manure')).toBeTruthy();
      expect(screen.getByText('Offering grass clippings')).toBeTruthy();
      expect(screen.getByText('Turn the front pile')).toBeTruthy();
    });

    await user.selectOptions(
      screen.getByLabelText('Material') as HTMLSelectElement,
      'manure-fresh',
    );

    await waitFor(() => {
      expect(screen.queryByText('Offering grass clippings')).toBeNull();
      // Production behaviour: setting any material implicitly hides labor
      // events (events carry no material — see Feed.tsx filtered useMemo).
      expect(screen.queryByText('Turn the front pile')).toBeNull();
    });
    expect(screen.getByText('Need fresh manure')).toBeTruthy();
  });

  it('kind filter = event keeps only the labor event and hides listings', async () => {
    const user = userEvent.setup();
    const now = Math.floor(Date.now() / 1000);

    seedListing(
      AUTHOR_A,
      {
        kind: 'need',
        material: 'manure-fresh',
        title: 'Need fresh manure',
        description: 'For spring builds.',
        photos: [],
        version: 1,
      },
      'need-fresh-manure',
      now - 30,
    );
    seedListing(
      AUTHOR_B,
      {
        kind: 'offer',
        material: 'green-grass',
        title: 'Offering grass clippings',
        description: 'Pickup from yard waste pile.',
        photos: [],
        version: 1,
      },
      'offer-grass-clippings',
      now - 60,
    );
    seedLaborEvent(
      AUTHOR_C,
      {
        kind: 'pile-turn',
        title: 'Turn the front pile',
        description: 'Bring pitchforks.',
        start: now + 5 * 86400,
        version: 1,
      },
      'turn-front-pile',
    );

    render(<Feed />);

    await waitFor(() => {
      expect(screen.getByText('Turn the front pile')).toBeTruthy();
    });

    await user.click(screen.getByRole('radio', { name: 'Events' }));

    await waitFor(() => {
      expect(screen.queryByText('Need fresh manure')).toBeNull();
      expect(screen.queryByText('Offering grass clippings')).toBeNull();
    });
    expect(screen.getByText('Turn the front pile')).toBeTruthy();
  });

  it('disables the material Select when the kind chip is set to Events', async () => {
    const user = userEvent.setup();

    render(<Feed />);

    const materialSelect = screen.getByLabelText('Material') as HTMLSelectElement;
    expect(materialSelect.disabled).toBe(false);

    await user.click(screen.getByRole('radio', { name: 'Events' }));

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Material') as HTMLSelectElement).disabled,
      ).toBe(true);
    });
  });
});
