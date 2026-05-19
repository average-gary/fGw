import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';

// ---------------------------------------------------------------------------
// localStorage shim — Node 25 ships a stub `localStorage` that shadows
// happy-dom's, and zustand's `persist` middleware (used by the auth store)
// crashes if it can't read/write. Hoisted so it lands before any imports.
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
// In-memory mock relay. Every test gets a fresh one via `resetRelay()`.
// `dm.ts` only ever talks to it through the (mocked) `getNdk()`.
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
type Filter = { kinds?: number[]; '#p'?: string[] };

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
      // Fan out to matching active subscriptions.
      for (const sub of state.subs) {
        if (!sub.active) continue;
        if (sub.filter.kinds && e.kind !== undefined && !sub.filter.kinds.includes(e.kind)) {
          continue;
        }
        const pFilter = sub.filter['#p'];
        if (pFilter) {
          const pTags = e.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
          if (!pFilter.some((p) => pTags.includes(p))) continue;
        }
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
      // Replay any matching events already in the relay (so subscribers
      // started after publish still see prior messages — handy for tests).
      for (const e of state.events) {
        if (sub.filter.kinds && e.kind !== undefined && !sub.filter.kinds.includes(e.kind)) {
          continue;
        }
        const pFilter = sub.filter['#p'];
        if (pFilter) {
          const pTags = e.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
          if (!pFilter.some((p) => pTags.includes(p))) continue;
        }
        sub.handler(e);
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
// Mock @/lib/ndk: getNdk() returns the in-memory mock relay shaped
// like an NDK instance. dm.ts uses only `publish` and `subscribe`.
// ---------------------------------------------------------------------------
vi.mock('@/lib/ndk', () => ({
  getNdk: () => mockState,
  currentRelay: () => 'wss://mock.example',
  setRelayToast: () => {},
  addRelay: () => {},
}));
// dm.ts uses a relative import (`./ndk`); both alias paths resolve to the
// same module in production, so we mock both forms to be safe.
vi.mock('./ndk', () => ({
  getNdk: () => mockState,
  currentRelay: () => 'wss://mock.example',
  setRelayToast: () => {},
  addRelay: () => {},
}));

// ---------------------------------------------------------------------------
// Now we can import the unit under test (and its auth-store dependency).
// ---------------------------------------------------------------------------
import {
  DM_GIFT_WRAP_KIND,
  DM_RUMOR_KIND,
  DmError,
  _setLocalSignerForTests,
  sendDm,
  subscribeDms,
} from './dm';
import { useAuthStore } from './auth';

beforeEach(() => {
  resetRelay();
  // Clear auth store between tests.
  useAuthStore.setState({
    method: null,
    signer: null,
    npub: null,
    status: 'idle',
    error: undefined,
  });
});

describe('SPEC-014 NIP-17 gift-wrapped DMs', () => {
  it('publishes only kind-1059 wraps (no kind-14 leak) and emits two wraps per send', async () => {
    const skA = generateSecretKey();
    const skB = generateSecretKey();
    const pkB = getPublicKey(skB);

    _setLocalSignerForTests(skA);
    await sendDm(pkB, 'hello');

    // The relay must see ONLY gift-wraps. Kind-14 must never leak.
    expect(mockState.events.length).toBe(2);
    for (const e of mockState.events) {
      expect(e.kind).toBe(DM_GIFT_WRAP_KIND);
      expect(e.kind).not.toBe(DM_RUMOR_KIND);
      // Wraps are signed by ephemeral keys, never by the sender directly.
      expect(e.pubkey).not.toBe(getPublicKey(skA));
      expect(typeof e.sig).toBe('string');
    }
    // One wrap addressed to recipient, one to self.
    const recipients = mockState.events
      .flatMap((e) => e.tags)
      .filter((t) => t[0] === 'p')
      .map((t) => t[1]);
    expect(recipients).toContain(pkB);
    expect(recipients).toContain(getPublicKey(skA));
  });

  it("recipient B's subscribeDms decrypts and yields the message", async () => {
    const skA = generateSecretKey();
    const skB = generateSecretKey();
    const pkA = getPublicKey(skA);
    const pkB = getPublicKey(skB);

    // A sends.
    _setLocalSignerForTests(skA);
    await sendDm(pkB, 'hello');

    // Now B subscribes.
    _setLocalSignerForTests(skB);
    const received: Array<{
      from: string;
      to: string;
      content: string;
    }> = [];
    const unsub = subscribeDms().subscribe((dm) => {
      received.push({ from: dm.from, to: dm.to, content: dm.content });
    });

    // Allow microtasks (none async here, but be safe).
    await Promise.resolve();

    expect(received.length).toBe(1);
    expect(received[0]).toEqual({ from: pkA, to: pkB, content: 'hello' });
    unsub();
  });

  it('a third party C never gets the wrap from the relay filter', async () => {
    const skA = generateSecretKey();
    const skB = generateSecretKey();
    const skC = generateSecretKey();
    const pkB = getPublicKey(skB);
    const pkC = getPublicKey(skC);

    _setLocalSignerForTests(skA);
    await sendDm(pkB, 'hello');

    // C subscribes with their own pubkey filter; the relay's #p filter
    // would never match because no wrap is tagged for C.
    _setLocalSignerForTests(skC);
    const seen: unknown[] = [];
    const unsub = subscribeDms().subscribe((dm) => {
      seen.push(dm);
    });

    expect(seen.length).toBe(0);

    // Sanity: the active C-sub must have a #p filter set to C's pubkey.
    const cSub = mockState.subs.find((s) => s.filter['#p']?.includes(pkC));
    expect(cSub).toBeTruthy();

    unsub();
  });

  it('thread root: replies carry an `e` root tag round-tripped via DecryptedDm', async () => {
    const skA = generateSecretKey();
    const skB = generateSecretKey();
    const pkB = getPublicKey(skB);
    const rootId = '0'.repeat(64);

    _setLocalSignerForTests(skA);
    await sendDm(pkB, 'reply', rootId);

    _setLocalSignerForTests(skB);
    const received: Array<{ threadRoot?: string; content: string }> = [];
    subscribeDms().subscribe((dm) =>
      received.push({ threadRoot: dm.threadRoot, content: dm.content }),
    );

    expect(received.length).toBe(1);
    expect(received[0]?.threadRoot).toBe(rootId);
    expect(received[0]?.content).toBe('reply');
  });

  it('rejects sendDm with no signer', async () => {
    const skB = generateSecretKey();
    const pkB = getPublicKey(skB);
    let caught: unknown;
    try {
      await sendDm(pkB, 'nope');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DmError);
    expect((caught as DmError).kind).toBe('no-signer');
  });
});
