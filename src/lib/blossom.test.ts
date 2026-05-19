/**
 * SPEC-016 tests.
 *
 * Strategy: drive `uploadPhoto` end-to-end with a stubbed `fetch` and a
 * real `NDKPrivateKeySigner`. We mock `transformImage` to a known-shape
 * return so we can assert the auth event's `payload` tag matches the
 * advertised sha256 without depending on canvas internals (those are
 * already covered in `image.test.ts`). For `verifyDownload` we use a
 * deterministic byte buffer, hash it ourselves with `crypto.subtle`, and
 * compare against what `verifyDownload` returns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Happy-dom's localStorage is a no-op stub; zustand's `persist` middleware
// blows up on `setState` without a real backing store. Install an in-memory
// shim BEFORE any module that pulls in a persisted store is imported.
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
import {
  BlossomError,
  imetaTag,
  relayHttpsBase,
  uploadPhoto,
  verifyDownload,
} from './blossom';
import { useAuthStore } from './auth';
import { useChapterStore } from './chapter';
import * as imageMod from './image';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const FAKE_HASH =
  '1111111111111111111111111111111111111111111111111111111111111111';
const FAKE_BLOB_BYTES = new Uint8Array(1024);
for (let i = 0; i < FAKE_BLOB_BYTES.length; i++) FAKE_BLOB_BYTES[i] = i & 0xff;

function fakeTransformed(): imageMod.TransformedImage {
  return {
    blob: new Blob([FAKE_BLOB_BYTES as BlobPart], { type: 'image/jpeg' }),
    sha256: FAKE_HASH,
    dim: { w: 800, h: 600 },
    mime: 'image/jpeg',
    sizeBytes: FAKE_BLOB_BYTES.length,
  };
}

function decodeAuthHeader(h: string): {
  scheme: string;
  event: { kind: number; tags: string[][]; content: string; pubkey: string };
} {
  const ix = h.indexOf(' ');
  const scheme = h.slice(0, ix);
  const b64 = h.slice(ix + 1);
  // Reverse of our b64encode: base64 → Latin-1 string → UTF-8 bytes.
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const json = new TextDecoder().decode(bytes);
  return { scheme, event: JSON.parse(json) };
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  const u = new Uint8Array(d);
  let s = '';
  for (let i = 0; i < u.length; i++) s += (u[i] ?? 0).toString(16).padStart(2, '0');
  return s;
}

// ---------------------------------------------------------------------------
// teardown
// ---------------------------------------------------------------------------

const ORIG_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIG_FETCH;
  useAuthStore.setState({
    method: null,
    signer: null,
    npub: null,
    status: 'idle',
    error: undefined,
  });
  useChapterStore.setState({ currentRelay: 'wss://chat.virginiafreedom.tech' });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Test 1: relayHttpsBase
// ---------------------------------------------------------------------------

describe('relayHttpsBase', () => {
  it('maps wss → https on the same host', () => {
    expect(relayHttpsBase('wss://chat.virginiafreedom.tech')).toBe(
      'https://chat.virginiafreedom.tech',
    );
  });

  it('maps ws → http', () => {
    expect(relayHttpsBase('ws://localhost:7777')).toBe('http://localhost:7777');
  });

  it('throws on a non-ws URL', () => {
    expect(() => relayHttpsBase('http://x')).toThrow();
    expect(() => relayHttpsBase('https://x')).toThrow();
    expect(() => relayHttpsBase('not a url')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test 2: imetaTag
// ---------------------------------------------------------------------------

describe('imetaTag', () => {
  it('produces a NIP-92 imeta tag with all five fields', () => {
    const tag = imetaTag({
      url: 'https://chat.virginiafreedom.tech/abc.jpg',
      sha256: FAKE_HASH,
      dim: { w: 800, h: 600 },
      mime: 'image/jpeg',
      sizeBytes: 12345,
    });
    expect(tag[0]).toBe('imeta');
    expect(tag).toContain('url https://chat.virginiafreedom.tech/abc.jpg');
    expect(tag).toContain('m image/jpeg');
    expect(tag).toContain(`x ${FAKE_HASH}`);
    expect(tag).toContain('dim 800x600');
    expect(tag).toContain('size 12345');
    expect(tag).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Test 3: uploadPhoto happy path
// ---------------------------------------------------------------------------

describe('uploadPhoto', () => {
  beforeEach(() => {
    // Mock the heavy canvas pipeline; SPEC-027 owns its own coverage.
    vi.spyOn(imageMod, 'transformImage').mockResolvedValue(fakeTransformed());
  });

  it('signs a NIP-98 event and PUTs the transformed blob', async () => {
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });

    const recorded: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      recorded.url = String(url);
      recorded.init = init;
      return new Response(
        JSON.stringify({
          url: 'https://chat.virginiafreedom.tech/abc.jpg',
          sha256: FAKE_HASH,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const file = new File([new Uint8Array(8) as BlobPart], 'photo.jpg', {
      type: 'image/jpeg',
    });
    const ref = await uploadPhoto(file);

    expect(recorded.url).toBe('https://chat.virginiafreedom.tech/upload');
    expect(recorded.init?.method).toBe('PUT');

    const headers = recorded.init?.headers as Record<string, string>;
    const auth = headers['Authorization'] ?? headers['authorization'];
    expect(auth).toBeDefined();
    if (!auth) throw new Error('unreachable');
    expect(auth.startsWith('Nostr ')).toBe(true);

    const { scheme, event } = decodeAuthHeader(auth);
    expect(scheme).toBe('Nostr');
    expect(event.kind).toBe(27235);
    expect(event.content).toBe('');
    const payloadTag = event.tags.find((t) => t[0] === 'payload');
    expect(payloadTag?.[1]).toBe(FAKE_HASH);
    const uTag = event.tags.find((t) => t[0] === 'u');
    expect(uTag?.[1]).toBe('https://chat.virginiafreedom.tech/upload');
    const methodTag = event.tags.find((t) => t[0] === 'method');
    expect(methodTag?.[1]).toBe('PUT');

    expect(ref.url).toBe('https://chat.virginiafreedom.tech/abc.jpg');
    expect(ref.sha256).toBe(FAKE_HASH);
    expect(ref.dim).toEqual({ w: 800, h: 600 });
    expect(ref.mime).toBe('image/jpeg');
    expect(ref.sizeBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it('throws server-hash-mismatch when server returns a different sha256', async () => {
    const signer = NDKPrivateKeySigner.generate();
    useAuthStore.setState({
      method: 'nsec-local',
      signer,
      npub: (await signer.user()).npub,
      status: 'ready',
    });
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          url: 'https://x/abc',
          sha256:
            '2222222222222222222222222222222222222222222222222222222222222222',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as typeof fetch;
    const file = new File([new Uint8Array(8) as BlobPart], 'x.jpg', {
      type: 'image/jpeg',
    });
    await expect(uploadPhoto(file)).rejects.toMatchObject({
      kind: 'server-hash-mismatch',
    });
  });
});

// ---------------------------------------------------------------------------
// Test 4: verifyDownload
// ---------------------------------------------------------------------------

describe('verifyDownload', () => {
  it('returns the Blob when bytes hash to the expected value', async () => {
    const bytes = new Uint8Array(64);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i;
    const expected = await sha256Hex(bytes.buffer);
    globalThis.fetch = vi.fn(async () =>
      new Response(bytes as BlobPart, {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }),
    ) as typeof fetch;
    const blob = await verifyDownload('https://x/abc', expected);
    expect(blob.size).toBe(bytes.length);
    expect(blob.type).toBe('image/jpeg');
  });

  it('throws hash-mismatch on differing bytes', async () => {
    const bytes = new Uint8Array(32);
    bytes[0] = 1;
    globalThis.fetch = vi.fn(async () =>
      new Response(bytes as BlobPart, { status: 200 }),
    ) as typeof fetch;
    await expect(
      verifyDownload(
        'https://x/abc',
        '0000000000000000000000000000000000000000000000000000000000000000',
      ),
    ).rejects.toBeInstanceOf(BlossomError);
    await expect(
      verifyDownload(
        'https://x/abc',
        '0000000000000000000000000000000000000000000000000000000000000000',
      ),
    ).rejects.toMatchObject({ kind: 'hash-mismatch' });
  });
});

// ---------------------------------------------------------------------------
// Test 5: uploadPhoto without a signer
// ---------------------------------------------------------------------------

describe('uploadPhoto without a signer', () => {
  it('throws BlossomError("no-signer") and never calls fetch', async () => {
    useAuthStore.setState({
      method: null,
      signer: null,
      npub: null,
      status: 'idle',
    });
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as typeof fetch;
    const file = new File([new Uint8Array(8) as BlobPart], 'x.jpg', {
      type: 'image/jpeg',
    });
    await expect(uploadPhoto(file)).rejects.toMatchObject({
      kind: 'no-signer',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
