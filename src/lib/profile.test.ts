import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';

// ---------------------------------------------------------------------------
// localStorage shim — Node 25 ships a stub localStorage that shadows
// happy-dom's, and zustand's `persist` middleware (used by the auth store)
// crashes if it can't read/write. Hoisted so it lands before any imports.
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
// In-memory mock relay shaped like NDK. Subs replay matching prior events.
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
type Filter = { kinds?: number[]; authors?: string[]; '#p'?: string[] };
type Listener = (e: RelayEvent) => void;

const mockState = vi.hoisted(() => {
  const state = {
    events: [] as RelayEvent[],
    subs: [] as { filter: Filter; handler: Listener; active: boolean }[],
    matches(filter: Filter, e: RelayEvent): boolean {
      if (filter.kinds && e.kind !== undefined && !filter.kinds.includes(e.kind)) return false;
      if (filter.authors && !filter.authors.includes(e.pubkey)) return false;
      return true;
    },
    publish(e: RelayEvent): Promise<void> {
      state.events.push(e);
      for (const sub of state.subs) {
        if (sub.active && state.matches(sub.filter, e)) sub.handler(e);
      }
      return Promise.resolve();
    },
    subscribe(filter: Filter, handlers: { onEvent?: Listener }): { stop: () => void } {
      const sub = { filter, handler: handlers.onEvent ?? (() => {}), active: true };
      state.subs.push(sub);
      // Replay matching prior events.
      for (const e of state.events) {
        if (state.matches(sub.filter, e)) sub.handler(e);
      }
      return { stop: () => { sub.active = false; } };
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
vi.mock('./ndk', () => ({
  getNdk: () => mockState,
  currentRelay: () => 'wss://mock.example',
  setRelayToast: () => {},
  addRelay: () => {},
}));

// ---------------------------------------------------------------------------
// Now we can import the unit under test. Use a private-key signer so
// `ev.sign(signer)` in `updateProfile` can actually sign.
// ---------------------------------------------------------------------------
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { useAuthStore } from './auth';
import {
  PROFILE_EVENT_KIND,
  _resetProfileForTests,
  getProfile,
  updateProfile,
  useProfileStore,
} from './profile';

function setLocalSigner(skHex: string): string {
  const signer = new NDKPrivateKeySigner(skHex);
  useAuthStore.setState({ signer, status: 'ready' });
  return getPublicKey(hexToBytes(skHex));
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

beforeEach(() => {
  resetRelay();
  _resetProfileForTests();
  useAuthStore.setState({
    method: null, signer: null, npub: null, status: 'idle', error: undefined,
  });
});

describe('SPEC-028 profile (kind 0)', () => {
  it('getProfile reads kind-0 from the relay and returns the parsed Profile', async () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    // Pre-seed the relay with a kind-0 event.
    await mockState.publish({
      kind: PROFILE_EVENT_KIND,
      pubkey: pk,
      content: JSON.stringify({ display_name: 'Gini' }),
      tags: [],
      created_at: 1_700_000_000,
    });

    const p = await getProfile(pk, { force: true, timeoutMs: 500 });
    expect(p.displayName).toBe('Gini');
  });

  it('also accepts the camelCase `displayName` form', async () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    await mockState.publish({
      kind: PROFILE_EVENT_KIND,
      pubkey: pk,
      content: JSON.stringify({ displayName: 'Camel' }),
      tags: [],
      created_at: 1_700_000_000,
    });
    const p = await getProfile(pk, { force: true, timeoutMs: 500 });
    expect(p.displayName).toBe('Camel');
  });

  it('updateProfile publishes a kind-0 with merged content (preserves prior fields)', async () => {
    const sk = generateSecretKey();
    const pkHex = bytesToHex(sk);
    const pk = setLocalSigner(pkHex);

    // Seed an existing kind-0 with displayName=Gini so we can verify the
    // merge preserves it under the patch.
    await mockState.publish({
      kind: PROFILE_EVENT_KIND,
      pubkey: pk,
      content: JSON.stringify({ display_name: 'Gini' }),
      tags: [],
      created_at: 1_700_000_000,
    });

    // Prime the cache so updateProfile reads the prior content.
    await getProfile(pk, { force: true, timeoutMs: 500 });
    expect(useProfileStore.getState().byPubkey[pk]?.profile.displayName).toBe('Gini');

    await updateProfile({ picture: 'https://example/p.jpg' });

    // The latest kind-0 on the relay must contain BOTH fields.
    const kind0s = mockState.events.filter(
      (e) => e.kind === PROFILE_EVENT_KIND && e.pubkey === pk,
    );
    expect(kind0s.length).toBe(2);
    const latest = kind0s[kind0s.length - 1]!;
    const merged = JSON.parse(latest.content);
    expect(merged.display_name).toBe('Gini');
    expect(merged.picture).toBe('https://example/p.jpg');
    // Sanity: the wrapping event must be signed by the user.
    expect(latest.pubkey).toBe(pk);
    expect(typeof latest.sig).toBe('string');
  });

  it('updateProfile rejects when there is no signer', async () => {
    let caught: unknown;
    try { await updateProfile({ about: 'hi' }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(Error);
    expect(String(caught)).toMatch(/no signer/);
  });

  it('updateProfile preserves unknown fields it has never typed', async () => {
    const sk = generateSecretKey();
    const pkHex = bytesToHex(sk);
    const pk = setLocalSigner(pkHex);
    await mockState.publish({
      kind: PROFILE_EVENT_KIND,
      pubkey: pk,
      content: JSON.stringify({ display_name: 'Gini', website: 'https://gini.example' }),
      tags: [],
      created_at: 1_700_000_000,
    });
    await getProfile(pk, { force: true, timeoutMs: 500 });

    await updateProfile({ about: 'hi' });
    const kind0s = mockState.events.filter(
      (e) => e.kind === PROFILE_EVENT_KIND && e.pubkey === pk,
    );
    const latest = kind0s[kind0s.length - 1]!;
    const merged = JSON.parse(latest.content);
    expect(merged.website).toBe('https://gini.example');
    expect(merged.about).toBe('hi');
  });
});
