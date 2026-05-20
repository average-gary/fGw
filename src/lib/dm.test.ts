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

/**
 * Flush enough microtasks to let the chained async unwrap pipeline
 * (`signer.decrypt` x 2 + JSON.parse) settle. A handful of ticks is
 * plenty because no real network is involved.
 */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
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

    // The unwrap pipeline is async (signer.decrypt twice per wrap);
    // flush a few microtask ticks so the handler resolves.
    await flushAsync();

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

    await flushAsync();
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

    await flushAsync();

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

// ---------------------------------------------------------------------------
// SPEC-030 — DMs work for signer-only signers (NIP-07 / NIP-46), where the
// raw 32-byte private key is NOT exposed. We model the bunker signer with
// a hand-rolled object that implements only the NDKSigner methods dm.ts
// touches: `encrypt`, `decrypt`, `sign`, `user()`, and `userSync`.
//
// The mock owns its 32-byte key in a closure but DOES NOT expose it on
// the signer object — exactly matching the contract of
// `NDKNip07Signer` / `NDKNip46Signer`. The encrypt/decrypt
// implementations use real NIP-44 v2 so the wrap layer (which uses
// `nostr-tools/nip44` directly with an ephemeral keypair) can
// interoperate with these mock signers' decrypt path. Calls are
// counted via `MockCallLog` so tests can assert which API surfaces
// were exercised.
// ---------------------------------------------------------------------------
import type { NDKSigner, NDKUser } from '@nostr-dev-kit/ndk';
import { finalizeEvent } from 'nostr-tools/pure';
import * as nip44mod from 'nostr-tools/nip44';

interface MockCallLog {
  encrypt: number;
  decrypt: number;
  sign: number;
}

/**
 * Build a synthetic NDKSigner that has NO public `privateKey` field,
 * mirroring NIP-07/NIP-46 signers. The 32-byte key is held in a closure
 * (just like a bunker holds it server-side or an extension holds it in
 * its background page). All crypto goes through the standard
 * `signer.encrypt` / `signer.decrypt` / `signer.sign` surfaces.
 */
function makeBunkerSigner(sk: Uint8Array, log: MockCallLog): NDKSigner {
  const pubkey = getPublicKey(sk);
  const user = { pubkey, npub: '' } as unknown as NDKUser;
  return {
    get pubkey() {
      return pubkey;
    },
    get userSync() {
      return user;
    },
    user: async () => user,
    blockUntilReady: async () => user,
    relays: async () => [],
    toPayload: () => '',
    encryptionEnabled: async () => ['nip44'],
    encrypt: async (recipient: NDKUser, value: string, scheme?: string) => {
      log.encrypt += 1;
      if (scheme && scheme !== 'nip44') {
        throw new Error(`mock signer only supports nip44, got ${scheme}`);
      }
      const ck = nip44mod.v2.utils.getConversationKey(sk, recipient.pubkey);
      return nip44mod.v2.encrypt(value, ck);
    },
    decrypt: async (sender: NDKUser, value: string, scheme?: string) => {
      log.decrypt += 1;
      if (scheme && scheme !== 'nip44') {
        throw new Error(`mock signer only supports nip44, got ${scheme}`);
      }
      const ck = nip44mod.v2.utils.getConversationKey(sk, sender.pubkey);
      return nip44mod.v2.decrypt(value, ck);
    },
    sign: async (event: {
      kind: number;
      content: string;
      tags: string[][];
      created_at: number;
      pubkey?: string;
    }) => {
      log.sign += 1;
      const signed = finalizeEvent(
        {
          kind: event.kind,
          content: event.content,
          tags: event.tags,
          created_at: event.created_at,
        },
        sk,
      );
      return signed.sig;
    },
  } as unknown as NDKSigner;
}

/** Inject an arbitrary signer into the auth store. */
function installSigner(signer: NDKSigner): void {
  useAuthStore.setState({ signer, status: 'ready' });
}

describe('SPEC-030 NIP-17 DMs work under signer-only signers (NIP-07/NIP-46)', () => {
  it('bunker-style sender publishes only kind-1059 wraps and signs the seal via signer.sign', async () => {
    const skA = generateSecretKey();
    const skB = generateSecretKey();
    const pkA = getPublicKey(skA);
    const pkB = getPublicKey(skB);
    const log: MockCallLog = { encrypt: 0, decrypt: 0, sign: 0 };

    installSigner(makeBunkerSigner(skA, log));
    await sendDm(pkB, 'hello-from-bunker');

    // Two wraps published — one to recipient, one to self.
    expect(mockState.events.length).toBe(2);
    for (const e of mockState.events) {
      // Only kind-1059 wraps leak to the relay; no kind-14 rumor and no
      // kind-13 seal must ever escape.
      expect(e.kind).toBe(DM_GIFT_WRAP_KIND);
      expect(e.kind).not.toBe(DM_RUMOR_KIND);
      expect(e.kind).not.toBe(13);
      // Wraps are signed by ephemeral keys; the sender's identity must
      // never appear as the wrap pubkey.
      expect(e.pubkey).not.toBe(pkA);
      expect(typeof e.sig).toBe('string');
    }

    // The signer was asked to encrypt twice (one seal per wrap) and
    // sign twice (one kind-13 seal per wrap). Wrap signing is local
    // (ephemeral key) and does NOT touch the signer.
    expect(log.encrypt).toBe(2);
    expect(log.sign).toBe(2);

    // p-tags address recipient and self.
    const recipients = mockState.events
      .flatMap((e) => e.tags)
      .filter((t) => t[0] === 'p')
      .map((t) => t[1]);
    expect(recipients).toContain(pkB);
    expect(recipients).toContain(pkA);
  });

  it('bunker-style recipient decrypts an incoming wrap via signer.decrypt', async () => {
    const skA = generateSecretKey();
    const skB = generateSecretKey();
    const pkA = getPublicKey(skA);
    const pkB = getPublicKey(skB);
    const logA: MockCallLog = { encrypt: 0, decrypt: 0, sign: 0 };
    const logB: MockCallLog = { encrypt: 0, decrypt: 0, sign: 0 };

    // A (bunker) sends.
    installSigner(makeBunkerSigner(skA, logA));
    await sendDm(pkB, 'inbound-from-A');

    // B (bunker) subscribes.
    installSigner(makeBunkerSigner(skB, logB));
    const received: Array<{ from: string; to: string; content: string }> = [];
    const unsub = subscribeDms().subscribe((dm) => {
      received.push({ from: dm.from, to: dm.to, content: dm.content });
    });

    await flushAsync();

    expect(received.length).toBe(1);
    expect(received[0]).toEqual({
      from: pkA,
      to: pkB,
      content: 'inbound-from-A',
    });
    // Two decrypts per inbound wrap (wrap layer + seal layer); B saw
    // exactly one wrap (the one tagged for B), so 2 calls.
    expect(logB.decrypt).toBe(2);
    expect(logB.encrypt).toBe(0);
    unsub();
  });

  it('only kind-1059 wraps leak to the relay across the full pipeline (no plaintext, no kind-14, no kind-13)', async () => {
    const skA = generateSecretKey();
    const skB = generateSecretKey();
    const pkB = getPublicKey(skB);
    const log: MockCallLog = { encrypt: 0, decrypt: 0, sign: 0 };

    installSigner(makeBunkerSigner(skA, log));
    await sendDm(pkB, 'leak-check');

    const kinds = new Set(mockState.events.map((e) => e.kind));
    expect(kinds.size).toBe(1);
    expect(kinds.has(DM_GIFT_WRAP_KIND)).toBe(true);
    // Belt-and-suspenders: make sure no event content is the literal
    // plaintext, and no kind-14 / kind-13 events ever escaped.
    for (const e of mockState.events) {
      expect(e.content).not.toContain('leak-check');
      expect(e.kind).not.toBe(13);
      expect(e.kind).not.toBe(DM_RUMOR_KIND);
    }
  });
});
