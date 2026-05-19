import { beforeEach, describe, expect, it, vi } from 'vitest';

// localStorage shim for the persisted chapter store (Node 25 ships a
// stub `localStorage` that shadows happy-dom's). Hoisted so it lands
// before module imports.
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

// Mock NDK so each `new NDK(opts)` records its `explicitRelayUrls` and
// exposes a pool with `relays` (a Map of `{ url, disconnect }`) and an
// EventEmitter-ish `on` for `notice` / `relay:disconnect`.
const ndkMockState = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;
  type FakeRelay = {
    url: string;
    disconnect: ReturnType<typeof vi.fn>;
  };
  type FakePool = {
    relays: Map<string, FakeRelay>;
    on: ReturnType<typeof vi.fn>;
    emit: (evt: string, ...args: unknown[]) => void;
    listeners: Map<string, Listener[]>;
  };
  type FakeNDK = {
    explicitRelayUrls: string[];
    pool: FakePool;
    connect: ReturnType<typeof vi.fn>;
  };
  const instances: FakeNDK[] = [];
  return { instances };
});

vi.mock('@nostr-dev-kit/ndk', () => {
  class FakeNDK {
    explicitRelayUrls: string[];
    pool: {
      relays: Map<string, { url: string; disconnect: ReturnType<typeof vi.fn> }>;
      on: ReturnType<typeof vi.fn>;
      emit: (evt: string, ...args: unknown[]) => void;
      listeners: Map<string, Array<(...args: unknown[]) => void>>;
    };
    connect: ReturnType<typeof vi.fn>;
    constructor(opts?: { explicitRelayUrls?: string[] }) {
      this.explicitRelayUrls = opts?.explicitRelayUrls ?? [];
      const relays = new Map<
        string,
        { url: string; disconnect: ReturnType<typeof vi.fn> }
      >();
      for (const url of this.explicitRelayUrls) {
        relays.set(url, { url, disconnect: vi.fn() });
      }
      const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
      this.pool = {
        relays,
        listeners,
        on: vi.fn((evt: string, cb: (...args: unknown[]) => void) => {
          const arr = listeners.get(evt) ?? [];
          arr.push(cb);
          listeners.set(evt, arr);
        }),
        emit: (evt: string, ...args: unknown[]) => {
          for (const cb of listeners.get(evt) ?? []) cb(...args);
        },
      };
      this.connect = vi.fn().mockResolvedValue(undefined);
      ndkMockState.instances.push(this as unknown as never);
    }
  }
  return { default: FakeNDK };
});

import { DEFAULT_RELAY, useChapterStore } from './chapter';
import {
  addRelay,
  currentRelay,
  getNdk,
  setRelayToast,
} from './ndk';

beforeEach(() => {
  memStore.clear();
  // Reset to default relay before each test.
  useChapterStore.getState()._set(DEFAULT_RELAY);
  // Wipe the recorded fake-NDK instances.
  ndkMockState.instances.length = 0;
  // Drop any toast listener.
  setRelayToast(null);
  // Force the singleton to rebuild on next getNdk(). The store-subscribe
  // in ndk.ts already invalidates on relay change, but this guarantees a
  // clean state when tests don't change the relay.
  useChapterStore.getState()._set('wss://__reset__.invalid');
  useChapterStore.getState()._set(DEFAULT_RELAY);
});

describe('getNdk()', () => {
  it('boots with exactly [DEFAULT_RELAY] in explicitRelayUrls', () => {
    const ndk = getNdk();
    expect(ndk).toBeTruthy();
    const fake = ndkMockState.instances.at(-1);
    expect(fake).toBeTruthy();
    expect(fake!.explicitRelayUrls).toEqual([DEFAULT_RELAY]);
    // Pool contains exactly one relay.
    expect(fake!.pool.relays.size).toBe(1);
    expect(fake!.pool.relays.has(DEFAULT_RELAY)).toBe(true);
  });

  it('returns the same instance when called twice without a relay change', () => {
    const a = getNdk();
    const b = getNdk();
    expect(a).toBe(b);
    // Only one NDK instance constructed in this test.
    const sinceReset = ndkMockState.instances.length;
    expect(sinceReset).toBe(1);
  });

  it('rebuilds and disconnects the prior pool when the relay changes', () => {
    const first = getNdk();
    const firstFake = ndkMockState.instances.at(-1)!;
    const firstRelay = firstFake.pool.relays.get(DEFAULT_RELAY)!;
    expect(firstRelay.disconnect).not.toHaveBeenCalled();

    const NEXT = 'wss://other.example';
    useChapterStore.getState()._set(NEXT);

    const second = getNdk();
    expect(second).not.toBe(first);
    const secondFake = ndkMockState.instances.at(-1)!;
    expect(secondFake).not.toBe(firstFake);
    expect(secondFake.explicitRelayUrls).toEqual([NEXT]);
    expect(secondFake.pool.relays.size).toBe(1);
    expect(secondFake.pool.relays.has(NEXT)).toBe(true);

    // The prior NDK's relay must have been disconnected.
    expect(firstRelay.disconnect).toHaveBeenCalled();
  });

  it('calls connect() on the freshly built NDK', () => {
    getNdk();
    const fake = ndkMockState.instances.at(-1)!;
    expect(fake.connect).toHaveBeenCalledTimes(1);
  });
});

describe('currentRelay()', () => {
  it('mirrors the chapter store', () => {
    expect(currentRelay()).toBe(DEFAULT_RELAY);
    useChapterStore.getState()._set('wss://x.example');
    expect(currentRelay()).toBe('wss://x.example');
  });
});

describe('toast wiring', () => {
  it('fires the registered toast on relay:disconnect', () => {
    const calls: Array<{ title: string; description?: string }> = [];
    setRelayToast((msg) => calls.push(msg));
    getNdk();
    const fake = ndkMockState.instances.at(-1)!;
    fake.pool.emit('relay:disconnect', { url: DEFAULT_RELAY });
    expect(calls.length).toBe(1);
    expect(calls[0]!.title).toMatch(/disconnected/i);
    expect(calls[0]!.description).toBe(DEFAULT_RELAY);
  });

  it('fires a toast on error-like notices but not benign ones', () => {
    const calls: Array<{ title: string; description?: string }> = [];
    setRelayToast((msg) => calls.push(msg));
    getNdk();
    const fake = ndkMockState.instances.at(-1)!;
    fake.pool.emit('notice', { url: DEFAULT_RELAY }, 'rate-limit reset');
    expect(calls.length).toBe(0);
    fake.pool.emit('notice', { url: DEFAULT_RELAY }, 'invalid event');
    expect(calls.length).toBe(1);
    expect(calls[0]!.title).toMatch(/relay error/i);
  });
});

describe('addRelay() guard', () => {
  it('refuses to widen the relay set and logs a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    addRelay('wss://nope.example');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
