/**
 * SPEC-025 tests — Pyramid invite client + state hooks.
 *
 * Strategy: stub `globalThis.fetch` (same shape as `blossom.test.ts`),
 * install a real `NDKPrivateKeySigner` via `useAuthStore.setState({ signer })`
 * (same shape as `dm.test.ts`), and exercise the production module's
 * exported surface directly. We rely on `_resetPyramidForTests()` between
 * cases to keep the zustand cache + guard state from leaking.
 *
 * The production parser uses a *split-on-landmark* contract (see comment
 * block at the top of `pyramid.ts`): pubkeys before the case-insensitive
 * "Invited members" / "Invitees" heading go to `inviters`; pubkeys after go
 * to `invitees`; the `pubkey` field of the result is the FIRST `/u/<hex>`
 * link in the document (Pyramid's templ files repeat that link in the page
 * header). We test against that real behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';

// Happy-dom's localStorage is a no-op stub; the auth + chapter zustand
// stores use the `persist` middleware, which crashes on `setState` without
// a real backing store. Install an in-memory shim BEFORE any module that
// pulls in a persisted store is imported.
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
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
});

// ---------------------------------------------------------------------------
// Mock `./ndk` so the kind-22242 subscription installed by
// `useMembershipStatus` (via `ensureMembershipSubscription`) is exercisable
// from tests. The hoisted `ndkSub` lets a test grab the captured event
// callback and invoke it synthetically.
// ---------------------------------------------------------------------------
type NdkEventCb = () => void;
const ndkSub = vi.hoisted(() => ({
  onEventCallbacks: [] as NdkEventCb[],
  reset(): void {
    ndkSub.onEventCallbacks.length = 0;
  },
  fire(): void {
    for (const cb of ndkSub.onEventCallbacks) cb();
  },
}));

vi.mock('@/lib/ndk', () => ({
  getNdk: () => ({
    subscribe: (
      _filter: { kinds: number[] },
      handlers?: { onEvent?: NdkEventCb },
    ) => {
      if (handlers?.onEvent) ndkSub.onEventCallbacks.push(handlers.onEvent);
      return {
        on: (evt: string, cb: NdkEventCb): void => {
          if (evt === 'event') ndkSub.onEventCallbacks.push(cb);
        },
      };
    },
  }),
  currentRelay: () => 'wss://chat.virginiafreedom.tech',
  setRelayToast: () => {},
  addRelay: () => {},
}));
vi.mock('./ndk', () => ({
  getNdk: () => ({
    subscribe: (
      _filter: { kinds: number[] },
      handlers?: { onEvent?: NdkEventCb },
    ) => {
      if (handlers?.onEvent) ndkSub.onEventCallbacks.push(handlers.onEvent);
      return {
        on: (evt: string, cb: NdkEventCb): void => {
          if (evt === 'event') ndkSub.onEventCallbacks.push(cb);
        },
      };
    },
  }),
  currentRelay: () => 'wss://chat.virginiafreedom.tech',
  setRelayToast: () => {},
  addRelay: () => {},
}));

import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import * as nip19 from 'nostr-tools/nip19';
import {
  _resetPyramidForTests,
  dropMember,
  inviteByNpub,
  listMembers,
  parseMemberPage,
  relayHttpsBase,
  useMembershipStatus,
  usePublishGuard,
} from './pyramid';
import { useAuthStore } from './auth';
import { useChapterStore, setCurrentRelay } from './chapter';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const PK_A = 'a'.repeat(64);
const PK_B = 'b'.repeat(64);
const PK_C = 'c'.repeat(64);
const PK_TARGET =
  '1111111111111111111111111111111111111111111111111111111111111111';

function decodeAuthHeader(h: string): {
  scheme: string;
  event: { kind: number; tags: string[][]; content: string; pubkey: string };
} {
  const ix = h.indexOf(' ');
  const scheme = h.slice(0, ix);
  const b64 = h.slice(ix + 1);
  // Reverse of pyramid's b64encode: base64 → Latin-1 string → UTF-8 bytes.
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const json = new TextDecoder().decode(bytes);
  return { scheme, event: JSON.parse(json) };
}

// ---------------------------------------------------------------------------
// teardown
// ---------------------------------------------------------------------------

const ORIG_FETCH = globalThis.fetch;

beforeEach(() => {
  _resetPyramidForTests();
  ndkSub.reset();
  useAuthStore.setState({
    method: null,
    signer: null,
    npub: null,
    status: 'idle',
    error: undefined,
  });
  useChapterStore.setState({ currentRelay: 'wss://chat.virginiafreedom.tech' });
});

afterEach(() => {
  cleanup();
  globalThis.fetch = ORIG_FETCH;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Test 1: relayHttpsBase re-export sanity
// ---------------------------------------------------------------------------

describe('relayHttpsBase re-export', () => {
  it('maps the chapter wss URL to the matching https origin', () => {
    expect(relayHttpsBase('wss://chat.virginiafreedom.tech')).toBe(
      'https://chat.virginiafreedom.tech',
    );
  });
});

// ---------------------------------------------------------------------------
// Test 2: parseMemberPage happy path
// ---------------------------------------------------------------------------

describe('parseMemberPage', () => {
  it('splits inviters/invitees on the "Invited members" landmark', () => {
    const html = `
      <html><body>
        <h1>Member <a href="/u/${PK_A}">@alice</a></h1>
        <h2>Invited by</h2>
        <ul><li><a href="/u/${PK_B}">@bob</a></li></ul>
        <h2>Invited members</h2>
        <ul><li><a href="/u/${PK_C}">@carol</a></li></ul>
      </body></html>
    `;
    const info = parseMemberPage(html);
    expect(info.pubkey).toBe(PK_A);
    expect(info.inviters).toEqual([PK_B]);
    expect(info.invitees).toEqual([PK_C]);
  });

  it('returns empty arrays when the landmark is absent', () => {
    const html = `<a href="/u/${PK_A}">x</a><a href="/u/${PK_B}">y</a>`;
    const info = parseMemberPage(html);
    expect(info.pubkey).toBe(PK_A);
    expect(info.inviters).toEqual([]);
    expect(info.invitees).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test 3: listMembers via NIP-86 listallowedpubkeys
// ---------------------------------------------------------------------------

describe('listMembers', () => {
  it('POSTs a NIP-86 listallowedpubkeys envelope and maps the result to Members', async () => {
    // listMembers requires a signer (NIP-86 reads are still authed).
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });

    const recorded: { url?: string; init?: RequestInit; body?: string } = {};
    globalThis.fetch = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        recorded.url = String(url);
        recorded.init = init;
        recorded.body =
          typeof init?.body === 'string'
            ? init.body
            : new TextDecoder().decode(init?.body as ArrayBuffer);
        return new Response(
          JSON.stringify({ result: [{ pubkey: PK_A }, { pubkey: PK_B }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    ) as typeof fetch;

    const members = await listMembers();
    expect(recorded.url).toBe('https://chat.virginiafreedom.tech');
    expect(recorded.init?.method).toBe('POST');
    const headers = recorded.init?.headers as Record<string, string>;
    const auth = headers['Authorization'] ?? headers['authorization'];
    expect(auth).toBeDefined();
    expect(auth?.startsWith('Nostr ')).toBe(true);
    const ct = headers['Content-Type'] ?? headers['content-type'];
    expect(ct).toBe('application/nostr+json+rpc');

    expect(recorded.body).toBeDefined();
    const envelope = JSON.parse(recorded.body ?? '{}');
    expect(envelope.method).toBe('listallowedpubkeys');
    expect(envelope.params).toEqual([]);

    expect(members).toHaveLength(2);
    expect(members.map((m) => m.pubkey)).toEqual([PK_A, PK_B]);
    expect(members[0]?.npub?.startsWith('npub1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 4: inviteByNpub happy path (NIP-86 allowpubkey)
// ---------------------------------------------------------------------------

describe('inviteByNpub happy path', () => {
  it('POSTs a NIP-86 allowpubkey envelope with a NIP-98 Authorization header', async () => {
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });

    const targetNpub = nip19.npubEncode(PK_TARGET);

    const recorded: { url?: string; init?: RequestInit; body?: string } = {};
    globalThis.fetch = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        recorded.url = String(url);
        recorded.init = init;
        recorded.body =
          typeof init?.body === 'string'
            ? init.body
            : new TextDecoder().decode(init?.body as ArrayBuffer);
        return new Response(JSON.stringify({ result: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    ) as typeof fetch;

    const res = await inviteByNpub(targetNpub);
    expect(res.ok).toBe(true);

    const expectedUrl = 'https://chat.virginiafreedom.tech';
    expect(recorded.url).toBe(expectedUrl);
    expect(recorded.init?.method).toBe('POST');

    const headers = recorded.init?.headers as Record<string, string>;
    const ct = headers['Content-Type'] ?? headers['content-type'];
    expect(ct).toBe('application/nostr+json+rpc');
    const auth = headers['Authorization'] ?? headers['authorization'];
    expect(auth).toBeDefined();
    if (!auth) throw new Error('unreachable');
    expect(auth.startsWith('Nostr ')).toBe(true);

    const envelope = JSON.parse(recorded.body ?? '{}');
    expect(envelope.method).toBe('allowpubkey');
    expect(envelope.params).toEqual([PK_TARGET]);

    const { scheme, event } = decodeAuthHeader(auth);
    expect(scheme).toBe('Nostr');
    expect(event.kind).toBe(27235);
    const uTag = event.tags.find((t) => t[0] === 'u');
    expect(uTag?.[1]).toBe(expectedUrl);
    const methodTag = event.tags.find((t) => t[0] === 'method');
    expect(methodTag?.[1]).toBe('POST');

    // NIP-86 mandates a 'payload' tag (hex sha256 of the request body).
    const payloadTag = event.tags.find((t) => t[0] === 'payload');
    expect(payloadTag).toBeDefined();
    expect(payloadTag?.[1]).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Test 5: inviteByNpub quota error (NIP-86 200-with-error envelope)
// ---------------------------------------------------------------------------

describe('inviteByNpub quota error', () => {
  it('maps a 200 "over quota" error envelope to error: "over-quota"', async () => {
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ result: null, error: 'you are over quota' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as typeof fetch;

    const res = await inviteByNpub(nip19.npubEncode(PK_TARGET));
    expect(res).toEqual({ ok: false, error: 'over-quota' });
  });
});

// ---------------------------------------------------------------------------
// Test 6: dropMember happy path (NIP-86 banpubkey)
// ---------------------------------------------------------------------------

describe('dropMember happy path', () => {
  it('POSTs a NIP-86 banpubkey envelope and returns ok on result:true', async () => {
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });
    const recorded: { url?: string; init?: RequestInit; body?: string } = {};
    globalThis.fetch = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        recorded.url = String(url);
        recorded.init = init;
        recorded.body =
          typeof init?.body === 'string'
            ? init.body
            : new TextDecoder().decode(init?.body as ArrayBuffer);
        return new Response(JSON.stringify({ result: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    ) as typeof fetch;

    const res = await dropMember(PK_TARGET);
    expect(res).toEqual({ ok: true, value: undefined });
    expect(recorded.url).toBe('https://chat.virginiafreedom.tech');
    expect(recorded.init?.method).toBe('POST');
    const envelope = JSON.parse(recorded.body ?? '{}');
    expect(envelope.method).toBe('banpubkey');
    expect(envelope.params).toEqual([PK_TARGET]);
  });
});

// ---------------------------------------------------------------------------
// Test 7: inviteByNpub no-signer
// ---------------------------------------------------------------------------

describe('inviteByNpub without a signer', () => {
  it('returns error: "not-authed" and never calls fetch', async () => {
    useAuthStore.setState({
      method: null,
      signer: null,
      npub: null,
      status: 'idle',
    });
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as typeof fetch;

    const res = await inviteByNpub(nip19.npubEncode(PK_TARGET));
    expect(res).toEqual({ ok: false, error: 'not-authed' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 8: useMembershipStatus — transitions from 'unknown' to 'allowed' once
// `/allowed` returns the target pubkey.
// ---------------------------------------------------------------------------

describe('useMembershipStatus → allowed', () => {
  it('starts at "unknown" then flips to "allowed" once listallowedpubkeys returns the pubkey', async () => {
    // useMembershipStatus → refreshMembership → listMembers/listBanned both
    // require a signer (NIP-86 reads are authed). Install one.
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });

    // Both NIP-86 calls hit the same HTTPS root; dispatch by the envelope's
    // `method` field in the request body.
    const fetchSpy = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const bodyStr = typeof init?.body === 'string' ? init.body : '';
        const env = bodyStr ? JSON.parse(bodyStr) : { method: '' };
        if (env.method === 'listallowedpubkeys') {
          return new Response(
            JSON.stringify({ result: [{ pubkey: PK_TARGET }] }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    );
    globalThis.fetch = fetchSpy as typeof fetch;

    const { result } = renderHook(() => useMembershipStatus(PK_TARGET));
    // Initial render: cache is empty, refresh kicked off in useEffect.
    expect(result.current).toBe('unknown');

    await waitFor(() => {
      expect(result.current).toBe('allowed');
    });

    // Both NIP-86 list methods were invoked.
    const methods = fetchSpy.mock.calls.map((c) => {
      const init = c[1] as RequestInit | undefined;
      const body = typeof init?.body === 'string' ? init.body : '';
      try {
        return JSON.parse(body).method;
      } catch {
        return null;
      }
    });
    expect(methods).toContain('listallowedpubkeys');
    expect(methods).toContain('listbannedpubkeys');
    // All hit the relay's HTTPS root.
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    for (const u of urls) {
      expect(u).toBe('https://chat.virginiafreedom.tech');
    }
  });
});

// ---------------------------------------------------------------------------
// Test 9: useMembershipStatus — chapter swap busts the cache and re-fetches
// against the new https origin.
// ---------------------------------------------------------------------------

describe('useMembershipStatus → chapter swap', () => {
  it('resets to "unknown" and re-fetches against the new chapter base URL', async () => {
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });

    // First chapter: listallowedpubkeys returns PK_TARGET → 'allowed'.
    // Second chapter (different URL): returns empty → 'unknown'.
    const fetchSpy = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        const bodyStr = typeof init?.body === 'string' ? init.body : '';
        const env = bodyStr ? JSON.parse(bodyStr) : { method: '' };
        if (
          u === 'https://chat.virginiafreedom.tech' &&
          env.method === 'listallowedpubkeys'
        ) {
          return new Response(
            JSON.stringify({ result: [{ pubkey: PK_TARGET }] }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    );
    globalThis.fetch = fetchSpy as typeof fetch;

    const { result } = renderHook(() => useMembershipStatus(PK_TARGET));
    await waitFor(() => {
      expect(result.current).toBe('allowed');
    });

    const callsBefore = fetchSpy.mock.calls.length;

    // Swap the chapter relay. The pyramid module's chapter-store subscriber
    // wipes the cache on change; the hook's useEffect then sees status
    // 'unknown' + lastFetchedAt 0 and triggers another refresh against the
    // new https base.
    await act(async () => {
      setCurrentRelay('wss://other.example');
    });

    // The cache reset is synchronous; status flips back to 'unknown' before
    // the new fetch resolves.
    await waitFor(() => {
      expect(result.current).toBe('unknown');
    });

    // The new refresh fires and hits the *new* base.
    await waitFor(() => {
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    const newCalls = fetchSpy.mock.calls.slice(callsBefore);
    const newUrls = newCalls.map((c) => String(c[0]));
    expect(newUrls).toContain('https://other.example');
    // Both list methods were invoked against the new base.
    const newMethods = newCalls.map((c) => {
      const init = c[1] as RequestInit | undefined;
      const body = typeof init?.body === 'string' ? init.body : '';
      try {
        return JSON.parse(body).method;
      } catch {
        return null;
      }
    });
    expect(newMethods).toContain('listallowedpubkeys');
    expect(newMethods).toContain('listbannedpubkeys');
  });
});

// ---------------------------------------------------------------------------
// Test 10: useMembershipStatus — synthetic kind-22242 event triggers a
// re-fetch via the NDK subscription wired in `ensureMembershipSubscription`.
// ---------------------------------------------------------------------------

describe('useMembershipStatus → kind-22242 event', () => {
  it('re-fetches NIP-86 list methods when a kind-22242 event arrives', async () => {
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });

    const fetchSpy = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const bodyStr = typeof init?.body === 'string' ? init.body : '';
        const env = bodyStr ? JSON.parse(bodyStr) : { method: '' };
        if (env.method === 'listallowedpubkeys') {
          return new Response(
            JSON.stringify({ result: [{ pubkey: PK_TARGET }] }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ result: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    );
    globalThis.fetch = fetchSpy as typeof fetch;

    const { result } = renderHook(() => useMembershipStatus(PK_TARGET));
    await waitFor(() => {
      expect(result.current).toBe('allowed');
    });
    const callsBefore = fetchSpy.mock.calls.length;
    expect(ndkSub.onEventCallbacks.length).toBeGreaterThan(0);

    // Simulate the relay pushing a kind-22242 membership-change event.
    await act(async () => {
      ndkSub.fire();
    });

    await waitFor(() => {
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    const newMethods = fetchSpy.mock.calls.slice(callsBefore).map((c) => {
      const init = c[1] as RequestInit | undefined;
      const body = typeof init?.body === 'string' ? init.body : '';
      try {
        return JSON.parse(body).method;
      } catch {
        return null;
      }
    });
    expect(newMethods).toContain('listallowedpubkeys');
    expect(newMethods).toContain('listbannedpubkeys');
  });
});

// ---------------------------------------------------------------------------
// Test 11: usePublishGuard — pass-through on resolve.
// ---------------------------------------------------------------------------

describe('usePublishGuard → success path', () => {
  it('returns the publish() result and leaves blocked=false', async () => {
    const { result } = renderHook(() => usePublishGuard());
    expect(result.current.blocked).toBe(false);

    let value: number | null = null;
    await act(async () => {
      value = await result.current.guard(() => Promise.resolve(42));
    });

    expect(value).toBe(42);
    expect(result.current.blocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 12: usePublishGuard — restricted rejection flips `blocked` and
// returns null (so callers can render the "request invite" sheet).
// ---------------------------------------------------------------------------

describe('usePublishGuard → restricted rejection', () => {
  it('flips blocked=true and returns null on a "restricted" reason', async () => {
    const { result } = renderHook(() => usePublishGuard());
    expect(result.current.blocked).toBe(false);

    let value: unknown = 'sentinel';
    await act(async () => {
      value = await result.current.guard(() =>
        Promise.reject(new Error('restricted: invite-only')),
      );
    });

    expect(value).toBeNull();
    await waitFor(() => {
      expect(result.current.blocked).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Test 13 (SPEC-049): nip86Call — request body envelope shape.
// Asserts that inviteByNpub serializes the JSON-RPC envelope exactly:
// `{method: 'allowpubkey', params: [PK_TARGET]}`.
// ---------------------------------------------------------------------------

describe('nip86Call request body shape', () => {
  it('encodes inviteByNpub as {method: "allowpubkey", params: [hex]}', async () => {
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });

    const recorded: { body?: string } = {};
    globalThis.fetch = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        recorded.body =
          typeof init?.body === 'string'
            ? init.body
            : new TextDecoder().decode(init?.body as ArrayBuffer);
        return new Response(JSON.stringify({ result: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    ) as typeof fetch;

    const res = await inviteByNpub(nip19.npubEncode(PK_TARGET));
    expect(res.ok).toBe(true);
    expect(recorded.body).toBeDefined();
    const env = JSON.parse(recorded.body ?? '{}');
    expect(env).toEqual({ method: 'allowpubkey', params: [PK_TARGET] });
  });
});

// ---------------------------------------------------------------------------
// Test 14 (SPEC-049): NIP-86 payload tag is sha256(body) in hex.
// Captures the request body, computes its sha256 in the test, and asserts
// the Authorization event's `payload` tag matches exactly.
// ---------------------------------------------------------------------------

describe('NIP-86 payload tag is sha256 of body', () => {
  it('the kind-27235 event payload tag equals hex sha256 of the request body', async () => {
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });

    const recorded: { body?: string; auth?: string } = {};
    globalThis.fetch = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        recorded.body =
          typeof init?.body === 'string'
            ? init.body
            : new TextDecoder().decode(init?.body as ArrayBuffer);
        const headers = init?.headers as Record<string, string>;
        recorded.auth =
          headers['Authorization'] ?? headers['authorization'];
        return new Response(JSON.stringify({ result: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    ) as typeof fetch;

    const res = await inviteByNpub(nip19.npubEncode(PK_TARGET));
    expect(res.ok).toBe(true);
    expect(recorded.body).toBeDefined();
    expect(recorded.auth).toBeDefined();
    if (!recorded.body || !recorded.auth) throw new Error('unreachable');

    // Compute sha256 of the captured body.
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(recorded.body),
    );
    const bytes = new Uint8Array(digest);
    let expectedHex = '';
    for (let i = 0; i < bytes.length; i++) {
      expectedHex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
    }

    const { event } = decodeAuthHeader(recorded.auth);
    const payloadTag = event.tags.find((t) => t[0] === 'payload');
    expect(payloadTag).toBeDefined();
    expect(payloadTag?.[1]).toBe(expectedHex);
  });
});

// ---------------------------------------------------------------------------
// Test 15 (SPEC-049): NIP-86 returns 200 with an `error` field — Pyramid
// surfaces non-fatal failures (e.g. "cycle detected") inside the JSON-RPC
// envelope, not as HTTP errors. The classifier must map these substrings.
// ---------------------------------------------------------------------------

describe('NIP-86 200-with-error maps to InviteError', () => {
  it('maps error: "cycle detected" to InviteError "cycle"', async () => {
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });

    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ result: null, error: 'cycle detected' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as typeof fetch;

    const res = await inviteByNpub(nip19.npubEncode(PK_TARGET));
    expect(res).toEqual({ ok: false, error: 'cycle' });
  });
});
