/**
 * SPEC-021 — MyPiles tests.
 *
 * Pre-publishes two synthetic kind-30078 events into the in-memory mock
 * relay (one ACTIVE_TURNS, one ABANDONED) and asserts both render with the
 * matching state badges.
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
type Filter = { kinds?: number[]; authors?: string[] };
interface Subscription {
  filter: Filter;
  handler: Listener;
  active: boolean;
}

const mockState = vi.hoisted(() => {
  function matches(f: Filter, e: RelayEvent): boolean {
    if (f.kinds && e.kind !== undefined && !f.kinds.includes(e.kind)) return false;
    if (f.authors && !f.authors.includes(e.pubkey)) return false;
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

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { encodePile } from '@/lib/pile/events';
import type { Pile, PileState } from '@/lib/pile/types';
import { useAuthStore } from '@/lib/auth';
import { MyPiles } from './MyPiles';

const builderPk = 'b'.repeat(64);

function setSigner(pubkey: string): void {
  const signer = {
    user: async (): Promise<{ pubkey: string }> => ({ pubkey }),
  };
  useAuthStore.setState({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signer: signer as any,
    status: 'ready',
    method: 'nsec-local',
    npub: pubkey,
  });
}

function clearSigner(): void {
  useAuthStore.setState({
    signer: null,
    status: 'idle',
    method: null,
    npub: null,
    error: undefined,
  });
}

function publishPile(d: string, name: string, state: PileState): void {
  const pile: Pile = {
    d,
    name,
    builder: builderPk,
    dimensions: { length: 2, width: 2, height: 2 },
    presetId: 'standard',
    plannedBuildDate: Math.floor(Date.now() / 1000) + 5 * 86400,
    timezone: 'UTC',
    layers: [],
    turnRecords: [],
    state,
    photos: [],
    version: 1,
  };
  const enc = encodePile(pile);
  void mockState.publish({
    id: `id-${d}`,
    kind: enc.kind,
    content: enc.content,
    tags: enc.tags,
    created_at: enc.created_at,
    pubkey: builderPk,
  });
}

beforeEach(() => {
  memStore.clear();
  resetRelay();
  clearSigner();
});

afterEach(() => {
  cleanup();
});

describe('SPEC-021 MyPiles', () => {
  it('renders both an ACTIVE_TURNS pile and an ABANDONED pile with their state badges', async () => {
    publishPile('active-pile', 'Active build', 'ACTIVE_TURNS');
    publishPile('abandoned-pile', 'Abandoned build', 'ABANDONED');
    setSigner(builderPk);

    render(<MyPiles />);

    await waitFor(() => {
      const rows = screen.getAllByTestId('pile-row');
      expect(rows.length).toBe(2);
    });

    expect(screen.getByText('Active build')).toBeTruthy();
    expect(screen.getByText('Abandoned build')).toBeTruthy();
    expect(screen.getByText('Active turns')).toBeTruthy();
    expect(screen.getByText('Abandoned')).toBeTruthy();
  });
});
