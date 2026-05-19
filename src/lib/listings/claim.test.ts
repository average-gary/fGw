import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';

// ---------------------------------------------------------------------------
// localStorage shim — same pattern as src/lib/dm.test.ts. Hoisted so it lands
// before any imports that touch zustand/persist.
// ---------------------------------------------------------------------------
vi.hoisted(() => {
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
});

// ---------------------------------------------------------------------------
// In-memory mock relay shaped like the slice of NDK used by claim.ts.
// ---------------------------------------------------------------------------
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
type Filter = { kinds?: number[]; '#a'?: string[]; '#t'?: string[] };

interface Subscription {
  filter: Filter;
  handler: Listener;
  active: boolean;
}

const mockState = vi.hoisted(() => {
  const state = {
    events: [] as RelayEvent[],
    subs: [] as Subscription[],
    publish(e: RelayEvent): Promise<void> {
      state.events.push(e);
      for (const sub of state.subs) {
        if (!sub.active) continue;
        if (!matches(e, sub.filter)) continue;
        sub.handler(e);
      }
      return Promise.resolve();
    },
    subscribe(filter: Filter, handlers: { onEvent?: Listener }): {
      stop: () => void;
    } {
      const sub: Subscription = {
        filter,
        handler: handlers.onEvent ?? (() => {}),
        active: true,
      };
      state.subs.push(sub);
      // Replay matching events already in the relay.
      for (const e of state.events) {
        if (matches(e, sub.filter)) sub.handler(e);
      }
      return {
        stop: () => {
          sub.active = false;
        },
      };
    },
  };

  // Locally-scoped helper (cannot reference outer `eventMatches` from inside
  // a hoisted block because that block is also hoisted and the helper isn't).
  function matches(e: RelayEvent, filter: Filter): boolean {
    if (filter.kinds && e.kind !== undefined && !filter.kinds.includes(e.kind)) {
      return false;
    }
    if (filter['#a']) {
      const aTags = e.tags.filter((t) => t[0] === 'a').map((t) => t[1]);
      if (!filter['#a'].some((a) => aTags.includes(a))) return false;
    }
    if (filter['#t']) {
      const tTags = e.tags.filter((t) => t[0] === 't').map((t) => t[1]);
      if (!filter['#t'].some((t) => tTags.includes(t))) return false;
    }
    return true;
  }

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
vi.mock('../ndk', () => ({
  getNdk: () => mockState,
  currentRelay: () => 'wss://mock.example',
  setRelayToast: () => {},
  addRelay: () => {},
}));

// ---------------------------------------------------------------------------
// Now safe to import the unit under test.
// ---------------------------------------------------------------------------
import { NDKEvent, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { useAuthStore } from '../auth';
import {
  CLAIM_KIND,
  CLAIM_TAG,
  ClaimError,
  claim,
  subscribeClaimsFor,
} from './claim';
import type { AddressableRef } from './types';

function setSigner(sk: Uint8Array): void {
  const hex = Array.from(sk)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const signer = new NDKPrivateKeySigner(hex);
  useAuthStore.setState({ signer, status: 'ready' });
}

beforeEach(() => {
  resetRelay();
  useAuthStore.setState({
    method: null,
    signer: null,
    npub: null,
    status: 'idle',
    error: undefined,
  });
});

describe('SPEC-015 claims', () => {
  it('emits a kind-1 event with both `e` and `a` tags plus `t:claim` when given a NDKEvent', async () => {
    const skOwner = generateSecretKey();
    const pkOwner = getPublicKey(skOwner);
    // Construct a "live" listing event we can claim against.
    const target = new NDKEvent(undefined, {
      kind: 30402,
      pubkey: pkOwner,
      content: 'free coffee grounds',
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', 'free-coffee-grounds-abc123'],
        ['title', 'Free coffee grounds'],
        ['t', 'compost-offer'],
      ],
      id: 'a'.repeat(64),
      sig: 'b'.repeat(128),
    });

    const skClaimer = generateSecretKey();
    setSigner(skClaimer);

    await claim(target, 'I will take it');

    expect(mockState.events.length).toBe(1);
    const ev = mockState.events[0]!;
    expect(ev.kind).toBe(CLAIM_KIND);
    expect(ev.content).toBe('I will take it');
    expect(ev.pubkey).toBe(getPublicKey(skClaimer));
    // `e` tag points at the live event id.
    const eTags = ev.tags.filter((t) => t[0] === 'e').map((t) => t[1]);
    expect(eTags).toEqual(['a'.repeat(64)]);
    // `a` tag points at the addressable form `<kind>:<pubkey>:<d>`.
    const aTags = ev.tags.filter((t) => t[0] === 'a').map((t) => t[1]);
    expect(aTags).toEqual([`30402:${pkOwner}:free-coffee-grounds-abc123`]);
    // `t:claim` tag is present.
    const tTags = ev.tags.filter((t) => t[0] === 't').map((t) => t[1]);
    expect(tTags).toContain(CLAIM_TAG);
  });

  it("throws ClaimError('no-signer') when no signer is set", async () => {
    const target: AddressableRef = {
      kind: 30402,
      pubkey: 'a'.repeat(64),
      d: 'some-listing',
    };
    let caught: unknown;
    try {
      await claim(target, 'hi');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ClaimError);
    expect((caught as ClaimError).kind).toBe('no-signer');
  });

  it('subscribeClaimsFor dedupes by id and sorts by createdAt asc', async () => {
    const owner = 'c'.repeat(64);
    const target: AddressableRef = { kind: 30402, pubkey: owner, d: 'slug-xyz' };

    const aValue = `30402:${owner}:slug-xyz`;
    const evLater: RelayEvent = {
      id: 'd'.repeat(64),
      kind: CLAIM_KIND,
      pubkey: 'e'.repeat(64),
      content: 'second',
      created_at: 2000,
      tags: [['a', aValue], ['t', CLAIM_TAG]],
    };
    const evEarlier: RelayEvent = {
      id: 'f'.repeat(64),
      kind: CLAIM_KIND,
      pubkey: 'g'.repeat(64),
      content: 'first',
      created_at: 1000,
      tags: [['a', aValue], ['t', CLAIM_TAG]],
    };
    // Same-id duplicate of evLater: should be dropped.
    const evDup: RelayEvent = { ...evLater, content: 'dup' };

    await mockState.publish(evLater);
    await mockState.publish(evEarlier);
    await mockState.publish(evDup);

    const snapshots: Array<{ id: string; createdAt: number; message: string }[]> = [];
    const unsub = subscribeClaimsFor(target).subscribe((claims) => {
      snapshots.push(
        claims.map((c) => ({
          id: c.id,
          createdAt: c.createdAt,
          message: c.message,
        })),
      );
    });
    await Promise.resolve();

    expect(snapshots.length).toBeGreaterThan(0);
    const finalList = snapshots[snapshots.length - 1]!;
    expect(finalList.length).toBe(2);
    expect(finalList[0]!.id).toBe('f'.repeat(64));
    expect(finalList[1]!.id).toBe('d'.repeat(64));
    expect(finalList[0]!.createdAt).toBeLessThan(finalList[1]!.createdAt);
    // Dup did not overwrite the original message.
    expect(finalList[1]!.message).toBe('second');
    unsub();
  });

  it('subscribeClaimsFor uses the exact `#a` filter value', () => {
    const target: AddressableRef = {
      kind: 31923,
      pubkey: 'h'.repeat(64),
      d: 'work-day-2025-05-19',
    };
    const unsub = subscribeClaimsFor(target).subscribe(() => {});

    // Find the most recently registered subscription on the mock relay.
    const sub = mockState.subs[mockState.subs.length - 1];
    expect(sub).toBeTruthy();
    expect(sub!.filter.kinds).toEqual([CLAIM_KIND]);
    expect(sub!.filter['#a']).toEqual([
      `31923:${'h'.repeat(64)}:work-day-2025-05-19`,
    ]);
    expect(sub!.filter['#t']).toEqual([CLAIM_TAG]);
    unsub();
  });
});
