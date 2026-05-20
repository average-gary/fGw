/**
 * SPEC-021 — PileDetail tests.
 *
 * Pushes a synthetic kind-30078 pile event into an in-memory mock relay.
 * Asserts: layer checklist sized to `layersForHeight(height).max` for a
 * 2×2×2 pile (8–9 rows), and that "Advance" walks DRAFT → COLLECTING.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { encodePile, PILE_EVENT_KIND } from '@/lib/pile/events';
import type { Pile } from '@/lib/pile/types';
import { PileDetail } from './PileDetail';

const builderPk = 'a'.repeat(64);

function publishDraftPile(d: string): Pile {
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
  };
  const enc = encodePile(pile);
  void mockState.publish({
    id: 'pile-id',
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
});
