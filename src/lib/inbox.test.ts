import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// localStorage shim — same hoisted shim used by other lib tests so the
// auth zustand store doesn't crash when its `persist` middleware reads.
// ---------------------------------------------------------------------------
vi.hoisted(() => {
  class MemoryStorage {
    private m = new Map<string, string>();
    get length(): number { return this.m.size; }
    clear(): void { this.m.clear(); }
    getItem(k: string): string | null {
      return this.m.has(k) ? (this.m.get(k) as string) : null;
    }
    key(i: number): string | null { return Array.from(this.m.keys())[i] ?? null; }
    removeItem(k: string): void { this.m.delete(k); }
    setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  }
  const s = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: s, configurable: true, writable: true,
  });
});

// ---------------------------------------------------------------------------
// Mock the DM module so `useUnreadCounts` doesn't try to use a real signer.
// We expose a controllable "emit a DM" hook so tests can drive counts.
// ---------------------------------------------------------------------------
type DmHandler = (dm: { createdAt: number }) => void;
const dmState = vi.hoisted(() => ({
  handlers: new Set<DmHandler>(),
  emit(createdAt: number): void {
    for (const h of dmState.handlers) h({ createdAt });
  },
}));

vi.mock('./dm', () => ({
  subscribeDms: () => ({
    subscribe(h: DmHandler): () => void {
      dmState.handlers.add(h);
      return () => { dmState.handlers.delete(h); };
    },
  }),
}));

// ---------------------------------------------------------------------------
// Now we can import the unit under test. We use the in-memory inbox store
// so the test does not depend on IndexedDB / Dexie. (The DexieInboxStore
// only kicks in when `globalThis.indexedDB` is defined, so happy-dom +
// Node would normally pick that path; injecting our own store keeps the
// test deterministic and avoids real IDB I/O.)
// ---------------------------------------------------------------------------
import {
  _resetInboxForTests,
  _setInboxStoreForTests,
  _setClaimsSubscriber,
  markRead,
  useUnreadCounts,
} from './inbox';

class InMemoryStore {
  private m = new Map<'claims' | 'dms', number>();
  async get(scope: 'claims' | 'dms'): Promise<number> { return this.m.get(scope) ?? 0; }
  async put(scope: 'claims' | 'dms', at: number): Promise<void> { this.m.set(scope, at); }
  async all(): Promise<Record<'claims' | 'dms', number>> {
    return { claims: this.m.get('claims') ?? 0, dms: this.m.get('dms') ?? 0 };
  }
}

let store: InMemoryStore;

beforeEach(() => {
  _resetInboxForTests();
  store = new InMemoryStore();
  _setInboxStoreForTests(store);
  dmState.handlers.clear();
});

async function flush(): Promise<void> {
  // Allow Promises queued inside useEffect to settle.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('SPEC-028 inbox unread', () => {
  it('markRead("dms") writes a record; subsequent reads see it', async () => {
    expect(await store.get('dms')).toBe(0);
    await markRead('dms');
    const at = await store.get('dms');
    expect(at).toBeGreaterThan(0);
  });

  it('counts new DMs (newer than lastSeen) and resets to 0 after markRead', async () => {
    // lastSeen.dms starts at 0.
    const { result } = renderHook(() => useUnreadCounts());
    await flush();

    // Two DMs newer than `0` → unread.dms === 2.
    await act(async () => {
      dmState.emit(100);
      dmState.emit(200);
    });
    expect(result.current.dms).toBe(2);
    expect(result.current.total).toBe(2);

    // markRead resets the count.
    await act(async () => {
      await markRead('dms');
    });
    await flush();
    expect(result.current.dms).toBe(0);
    expect(result.current.total).toBe(0);

    // A subsequent older DM (older than lastSeen) does NOT bump the count.
    const lastSeen = await store.get('dms');
    expect(lastSeen).toBeGreaterThan(0);
    await act(async () => {
      dmState.emit(lastSeen - 1);
    });
    expect(result.current.dms).toBe(0);
  });

  it('claims subscription stays at 0 when SPEC-015 stub is in use', async () => {
    const { result } = renderHook(() => useUnreadCounts());
    await flush();
    expect(result.current.claims).toBe(0);
  });

  it('claims subscription wired via _setClaimsSubscriber increments count', async () => {
    type ClaimHandler = (e: { created_at: number }) => void;
    const handlers = new Set<ClaimHandler>();
    _setClaimsSubscriber(() => ({
      subscribe: (h: ClaimHandler): (() => void) => {
        handlers.add(h);
        return () => { handlers.delete(h); };
      },
    }));

    const { result } = renderHook(() => useUnreadCounts());
    await flush();

    await act(async () => {
      for (const h of handlers) h({ created_at: 500 });
    });
    expect(result.current.claims).toBe(1);

    await act(async () => { await markRead('claims'); });
    await flush();
    expect(result.current.claims).toBe(0);
  });
});
