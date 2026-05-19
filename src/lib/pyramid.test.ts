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

import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import * as nip19 from 'nostr-tools/nip19';
import {
  _resetPyramidForTests,
  dropMember,
  inviteByNpub,
  listMembers,
  parseMemberPage,
  relayHttpsBase,
} from './pyramid';
import { useAuthStore } from './auth';
import { useChapterStore } from './chapter';

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
// Test 3: listMembers mocked-fetch
// ---------------------------------------------------------------------------

describe('listMembers', () => {
  it('parses two pubkeys from the /allowed HTML response', async () => {
    const html = `
      <html><body>
        <ul>
          <li><a href="/u/${PK_A}">a</a></li>
          <li><a href="/u/${PK_B}">b</a></li>
        </ul>
      </body></html>
    `;
    const recorded: { url?: string } = {};
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      recorded.url = String(url);
      return new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }) as typeof fetch;

    const members = await listMembers();
    expect(recorded.url).toBe('https://chat.virginiafreedom.tech/allowed');
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.pubkey)).toEqual([PK_A, PK_B]);
    // Members are also npub-encoded for callers that render @-handles.
    expect(members[0]?.npub?.startsWith('npub1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 4: inviteByNpub happy path
// ---------------------------------------------------------------------------

describe('inviteByNpub happy path', () => {
  it('POSTs to /allow with a NIP-98 Authorization header', async () => {
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });

    const targetNpub = nip19.npubEncode(PK_TARGET);

    const recorded: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        recorded.url = String(url);
        recorded.init = init;
        return new Response('', { status: 200 });
      },
    ) as typeof fetch;

    const res = await inviteByNpub(targetNpub);
    expect(res.ok).toBe(true);

    const expectedUrl = `https://chat.virginiafreedom.tech/allow?type=invite&target=${PK_TARGET}`;
    expect(recorded.url).toBe(expectedUrl);
    expect(recorded.init?.method).toBe('POST');

    const headers = recorded.init?.headers as Record<string, string>;
    const auth = headers['Authorization'] ?? headers['authorization'];
    expect(auth).toBeDefined();
    if (!auth) throw new Error('unreachable');
    expect(auth.startsWith('Nostr ')).toBe(true);

    const { scheme, event } = decodeAuthHeader(auth);
    expect(scheme).toBe('Nostr');
    expect(event.kind).toBe(27235);
    const uTag = event.tags.find((t) => t[0] === 'u');
    expect(uTag?.[1]).toBe(expectedUrl);
    const methodTag = event.tags.find((t) => t[0] === 'method');
    expect(methodTag?.[1]).toBe('POST');
  });
});

// ---------------------------------------------------------------------------
// Test 5: inviteByNpub quota error
// ---------------------------------------------------------------------------

describe('inviteByNpub quota error', () => {
  it('maps a 422 "over quota" body to error: "over-quota"', async () => {
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });
    globalThis.fetch = vi.fn(async () =>
      new Response('Sorry, you are Over Quota for this week.', {
        status: 422,
      }),
    ) as typeof fetch;

    const res = await inviteByNpub(nip19.npubEncode(PK_TARGET));
    expect(res).toEqual({ ok: false, error: 'over-quota' });
  });
});

// ---------------------------------------------------------------------------
// Test 6: dropMember happy path
// ---------------------------------------------------------------------------

describe('dropMember happy path', () => {
  it('returns ok:true on a 200 response', async () => {
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });
    const recorded: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        recorded.url = String(url);
        recorded.init = init;
        return new Response('', { status: 200 });
      },
    ) as typeof fetch;

    const res = await dropMember(PK_TARGET);
    expect(res).toEqual({ ok: true, value: undefined });
    expect(recorded.url).toBe(
      `https://chat.virginiafreedom.tech/ban?type=drop&target=${PK_TARGET}`,
    );
    expect(recorded.init?.method).toBe('POST');
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
