/**
 * SPEC-021 / SPEC-031 — PileDetail tests.
 *
 * Pushes a synthetic kind-30078 pile event into an in-memory mock relay.
 * Asserts:
 *   - layer checklist sized to `layersForHeight(height).max` for a
 *     2×2×2 pile (8–9 rows),
 *   - "Advance" walks DRAFT → COLLECTING and republishes a fresh
 *     kind-30078 with the new state and same `d`-tag (SPEC-031),
 *   - toggling layer 1 republishes a kind-30078 whose decoded content
 *     has `layers[0].completed === true` (SPEC-031),
 *   - an incoming kind-30078 with a newer `created_at` overwrites the
 *     locally rendered state — last-writer-wins cross-device sync
 *     (SPEC-031).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';

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

type RelayEvent = {
  id?: string;
  kind?: number;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
  sig?: string;
};
type Listener = (e: RelayEvent) => void;
type Filter = { kinds?: number[]; authors?: string[]; '#d'?: string[] };
interface Subscription {
  filter: Filter;
  handler: Listener;
  active: boolean;
}

const mockState = vi.hoisted(() => {
  function matches(f: Filter, e: RelayEvent): boolean {
    if (f.kinds && e.kind !== undefined && !f.kinds.includes(e.kind)) return false;
    if (f.authors && !f.authors.includes(e.pubkey)) return false;
    const tagged = (n: string): string[] =>
      e.tags.filter((t) => t[0] === n).map((t) => t[1] ?? '');
    if (f['#d'] && !f['#d'].some((d) => tagged('d').includes(d))) return false;
    return true;
  }
  const state = {
    events: [] as RelayEvent[],
    subs: [] as Subscription[],
    publish(e: RelayEvent): Promise<void> {
      state.events.push(e);
      for (const sub of state.subs) {
        if (sub.active && matches(sub.filter, e)) sub.handler(e);
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
      for (const e of state.events) if (matches(sub.filter, e)) sub.handler(e);
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

vi.mock('@/lib/blossom', () => ({
  uploadPhoto: vi.fn(async (_file: File) => ({
    url: 'https://blossom.mock/aaaa.jpg',
    sha256: 'a'.repeat(64),
    dim: { w: 800, h: 600 },
    mime: 'image/jpeg',
    sizeBytes: 1234,
  })),
}));

// Pyramid: SPEC-031 wraps every PileDetail publish with `usePublishGuard`.
// Stub it to a pass-through so the publish actually reaches the mock relay.
vi.mock('@/lib/pyramid', () => ({
  useMembershipStatus: (_pk: string) => 'allowed',
  usePublishGuard: () => ({
    blocked: false,
    guard: async <T,>(fn: () => Promise<T>): Promise<T | null> => fn(),
  }),
}));

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { encodePile, parsePile, PILE_EVENT_KIND } from '@/lib/pile/events';
import type { Pile } from '@/lib/pile/types';
import { useAuthStore } from '@/lib/auth';
import { PileDetail } from './PileDetail';

const builderPk = 'a'.repeat(64);

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++)
    s += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  return s;
}

function publishDraftPile(d: string, overrides: Partial<Pile> = {}): Pile {
  const pile: Pile = {
    d,
    name: 'Detail test pile',
    builder: builderPk,
    dimensions: { length: 2, width: 2, height: 2 },
    presetId: 'standard',
    plannedBuildDate: Math.floor(Date.now() / 1000) + 86400,
    timezone: 'UTC',
    layers: [],
    turnRecords: [],
    state: 'DRAFT',
    photos: [],
    version: 1,
    ...overrides,
  };
  const enc = encodePile(pile);
  void mockState.publish({
    id: `pile-id-${d}`,
    kind: enc.kind,
    content: enc.content,
    tags: enc.tags,
    created_at: enc.created_at,
    pubkey: builderPk,
  });
  return pile;
}

beforeEach(() => {
  memStore.clear();
  resetRelay();
  // SPEC-031 mutations call `republishPile`, which requires a signer in
  // the auth store. Plant a fresh local signer for every test.
  const sk = generateSecretKey();
  const _pk = getPublicKey(sk);
  const signer = new NDKPrivateKeySigner(bytesToHex(sk));
  useAuthStore.setState({
    method: 'nsec-local',
    signer,
    npub: _pk,
    status: 'ready',
    error: undefined,
  });
});

afterEach(() => {
  cleanup();
});

describe('SPEC-021 PileDetail', () => {
  it('renders 8 or 9 layer rows for a 2×2×2 pile in DRAFT state', async () => {
    publishDraftPile('detail-2x2x2');
    render(
      <PileDetail
        pileRef={{ kind: PILE_EVENT_KIND, pubkey: builderPk, d: 'detail-2x2x2' }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Detail test pile')).toBeTruthy();
    });

    const layerCheckboxes = screen.getAllByRole('checkbox');
    expect(layerCheckboxes.length).toBeGreaterThanOrEqual(8);
    expect(layerCheckboxes.length).toBeLessThanOrEqual(9);
  });

  it('advances the state from DRAFT → COLLECTING when Advance is tapped', async () => {
    const user = userEvent.setup();
    publishDraftPile('advance-pile');

    render(
      <PileDetail
        pileRef={{ kind: PILE_EVENT_KIND, pubkey: builderPk, d: 'advance-pile' }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Detail test pile')).toBeTruthy();
    });

    expect(screen.getByText('Draft')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Advance' }));

    await waitFor(() => {
      expect(screen.getByText('Collecting')).toBeTruthy();
    });
  });

  it('republishes a kind-30078 with state COLLECTING + same d-tag on Advance (SPEC-031)', async () => {
    const user = userEvent.setup();
    const dSlug = 'spec031-advance';
    publishDraftPile(dSlug);

    render(
      <PileDetail
        pileRef={{ kind: PILE_EVENT_KIND, pubkey: builderPk, d: dSlug }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Detail test pile')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Advance' }));

    // Wait until a *second* kind-30078 (the republish) lands on the relay.
    await waitFor(
      () => {
        const matches = mockState.events.filter(
          (e) =>
            e.kind === PILE_EVENT_KIND &&
            e.tags.some((t) => t[0] === 'd' && t[1] === dSlug),
        );
        if (matches.length < 2) {
          throw new Error(`expected 2 kind-30078, got ${matches.length}`);
        }
      },
      { timeout: 5000 },
    );

    const matches = mockState.events.filter(
      (e) =>
        e.kind === PILE_EVENT_KIND &&
        e.tags.some((t) => t[0] === 'd' && t[1] === dSlug),
    );
    const republished = matches[matches.length - 1]!;
    const decoded = parsePile({
      kind: republished.kind ?? PILE_EVENT_KIND,
      content: republished.content,
      tags: republished.tags,
      ...(republished.created_at !== undefined ? { created_at: republished.created_at } : {}),
      ...(republished.pubkey !== undefined ? { pubkey: republished.pubkey } : {}),
    });
    expect(decoded).not.toBeNull();
    expect(decoded?.state).toBe('COLLECTING');
    expect(decoded?.d).toBe(dSlug);
  });

  it('republishes a kind-30078 with layers[0].completed === true when layer 1 is toggled (SPEC-031)', async () => {
    const user = userEvent.setup();
    const dSlug = 'spec031-layer';
    publishDraftPile(dSlug);

    render(
      <PileDetail
        pileRef={{ kind: PILE_EVENT_KIND, pubkey: builderPk, d: dSlug }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Detail test pile')).toBeTruthy();
    });

    // The LayerChecklist renders a row for each layer; layer 1 is the
    // first checkbox. Toggle it.
    const checkboxes = screen.getAllByRole('checkbox');
    const layerOne = checkboxes[0]!;
    await user.click(layerOne);

    await waitFor(
      () => {
        const matches = mockState.events.filter(
          (e) =>
            e.kind === PILE_EVENT_KIND &&
            e.tags.some((t) => t[0] === 'd' && t[1] === dSlug),
        );
        if (matches.length < 2) {
          throw new Error(`expected 2 kind-30078, got ${matches.length}`);
        }
      },
      { timeout: 5000 },
    );

    const matches = mockState.events.filter(
      (e) =>
        e.kind === PILE_EVENT_KIND &&
        e.tags.some((t) => t[0] === 'd' && t[1] === dSlug),
    );
    const republished = matches[matches.length - 1]!;
    const decoded = parsePile({
      kind: republished.kind ?? PILE_EVENT_KIND,
      content: republished.content,
      tags: republished.tags,
      ...(republished.created_at !== undefined ? { created_at: republished.created_at } : {}),
      ...(republished.pubkey !== undefined ? { pubkey: republished.pubkey } : {}),
    });
    expect(decoded).not.toBeNull();
    const layer1 = decoded?.layers.find((l) => l.index === 1);
    expect(layer1?.completed).toBe(true);
  });

  it('updates the rendered state when an incoming kind-30078 has a newer created_at (SPEC-031 LWW)', async () => {
    const dSlug = 'spec031-lww';
    publishDraftPile(dSlug);

    render(
      <PileDetail
        pileRef={{ kind: PILE_EVENT_KIND, pubkey: builderPk, d: dSlug }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeTruthy();
    });

    // Simulate another device editing the same pile and the relay
    // pushing the newer event back to us. `created_at` must be strictly
    // greater than the original draft (encoded with `Math.floor(Date.now()/1000)`).
    const futureCreatedAt = Math.floor(Date.now() / 1000) + 60;
    const fresher: Pile = {
      d: dSlug,
      name: 'Detail test pile',
      builder: builderPk,
      dimensions: { length: 2, width: 2, height: 2 },
      presetId: 'standard',
      plannedBuildDate: Math.floor(Date.now() / 1000) + 86400,
      timezone: 'UTC',
      layers: [],
      turnRecords: [],
      state: 'CURING',
      photos: [],
      version: 1,
    };
    const enc = encodePile(fresher);
    await mockState.publish({
      id: 'pile-id-lww-newer',
      kind: enc.kind,
      content: enc.content,
      tags: enc.tags,
      created_at: futureCreatedAt,
      pubkey: builderPk,
    });

    await waitFor(() => {
      expect(screen.getByText('Curing')).toBeTruthy();
    });
  });
});
