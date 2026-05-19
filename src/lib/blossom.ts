/**
 * SPEC-016 — Blossom media uploads with NIP-98 auth.
 *
 * Pyramid bundles a Blossom server on the same host as the relay, so the
 * upload base URL is derived from the chapter's relay URL via
 * `relayHttpsBase()`.
 *
 * We hand-roll the `PUT /upload` rather than use `blossom-client-sdk`
 * because the SDK's `BlossomClient.uploadBlob` issues BUD-01 auth events
 * (kind 24242). The spec pins NIP-98 (kind 27235) with `u`, `method`,
 * `payload` tags and a base64 `Authorization: Nostr ...` header.
 *
 * Photos are funneled through `transformImage()` (SPEC-027) first so
 * EXIF/GPS is stripped and JPEGs land under 2 MB. The server's returned
 * sha256 must match the one we computed locally, else we throw.
 */
import NDK, { NDKEvent } from '@nostr-dev-kit/ndk';
import { useChapterStore } from './chapter';
import { useAuthStore } from './auth';
import { transformImage } from './image';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Re-export `PhotoRef` from the listings module so there's exactly one
 * canonical shape for hosted-photo metadata across the codebase. SPEC-011's
 * listing event encoder consumes the same type via `imetaTag()`.
 */
export type { PhotoRef } from './listings/types';
import type { PhotoRef } from './listings/types';

export type BlossomErrorKind =
  | 'no-signer'
  | 'transform-failed'
  | 'upload-failed'
  | 'server-hash-mismatch'
  | 'hash-mismatch'
  | 'network';

export class BlossomError extends Error {
  public override readonly name = 'BlossomError';
  public readonly kind: BlossomErrorKind;
  public override readonly cause?: unknown;
  constructor(kind: BlossomErrorKind, message?: string, cause?: unknown) {
    super(message ?? kind);
    this.kind = kind;
    if (cause !== undefined) this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Nostr relay URL to its sibling HTTP origin. Pyramid co-locates
 * the Blossom server, so the chapter relay's host is the upload host.
 */
export function relayHttpsBase(wssUrl: string): string {
  let u: URL;
  try {
    u = new URL(wssUrl);
  } catch {
    throw new Error(`Invalid relay URL: ${wssUrl}`);
  }
  if (u.protocol === 'wss:') return `https://${u.host}`;
  if (u.protocol === 'ws:') return `http://${u.host}`;
  throw new Error(`Expected ws:// or wss:// URL, got ${u.protocol}`);
}

/** Current chapter's Blossom HTTP base (no trailing slash). */
export function currentBlossomBase(): string {
  return relayHttpsBase(useChapterStore.getState().currentRelay);
}

// ---------------------------------------------------------------------------
// uploadPhoto
// ---------------------------------------------------------------------------

export async function uploadPhoto(file: File): Promise<PhotoRef> {
  const signer = useAuthStore.getState().signer;
  if (!signer) {
    throw new BlossomError('no-signer', 'Sign in before uploading photos.');
  }

  let transformed: Awaited<ReturnType<typeof transformImage>>;
  try {
    transformed = await transformImage(file);
  } catch (err) {
    throw new BlossomError(
      'transform-failed',
      err instanceof Error ? err.message : 'image transform failed',
      err,
    );
  }

  const base = currentBlossomBase();
  const uploadUrl = `${base}/upload`;

  // Build NIP-98 auth event (kind 27235).
  const ev = new NDKEvent(new NDK());
  ev.kind = 27235;
  ev.created_at = Math.floor(Date.now() / 1000);
  ev.content = '';
  ev.tags = [
    ['u', uploadUrl],
    ['method', 'PUT'],
    ['payload', transformed.sha256],
  ];
  await ev.sign(signer);
  const raw = ev.rawEvent();
  const auth = `Nostr ${b64encode(JSON.stringify(raw))}`;

  let resp: Response;
  try {
    resp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: auth,
        'Content-Type': transformed.mime,
      },
      body: transformed.blob,
    });
  } catch (err) {
    throw new BlossomError(
      'network',
      err instanceof Error ? err.message : 'fetch failed',
      err,
    );
  }
  if (!resp.ok) {
    let body = '';
    try {
      body = await resp.text();
    } catch {
      /* ignore */
    }
    throw new BlossomError(
      'upload-failed',
      `Blossom upload failed: ${resp.status} ${resp.statusText} ${body}`.trim(),
    );
  }

  let json: { url?: unknown; sha256?: unknown };
  try {
    json = (await resp.json()) as { url?: unknown; sha256?: unknown };
  } catch (err) {
    throw new BlossomError('upload-failed', 'invalid JSON from Blossom', err);
  }
  if (typeof json?.url !== 'string' || typeof json?.sha256 !== 'string') {
    throw new BlossomError('upload-failed', 'Blossom response missing url/sha256');
  }
  const { url, sha256 } = json as { url: string; sha256: string };
  if (sha256 !== transformed.sha256) {
    throw new BlossomError(
      'server-hash-mismatch',
      `expected ${transformed.sha256}, server returned ${sha256}`,
    );
  }

  return {
    url,
    sha256: transformed.sha256,
    dim: transformed.dim,
    mime: transformed.mime,
    sizeBytes: transformed.sizeBytes,
  };
}

// ---------------------------------------------------------------------------
// imetaTag (NIP-92)
// ---------------------------------------------------------------------------

export function imetaTag(p: PhotoRef): string[] {
  return [
    'imeta',
    `url ${p.url}`,
    `m ${p.mime}`,
    `x ${p.sha256}`,
    `dim ${p.dim.w}x${p.dim.h}`,
    `size ${p.sizeBytes}`,
  ];
}

// ---------------------------------------------------------------------------
// verifyDownload
// ---------------------------------------------------------------------------

export async function verifyDownload(
  url: string,
  expected: string,
): Promise<Blob> {
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (err) {
    throw new BlossomError(
      'network',
      err instanceof Error ? err.message : 'fetch failed',
      err,
    );
  }
  if (!resp.ok) {
    throw new BlossomError(
      'network',
      `download failed: ${resp.status} ${resp.statusText}`,
    );
  }
  const buf = await resp.arrayBuffer();
  const got = await sha256Hex(buf);
  if (got !== expected) {
    throw new BlossomError(
      'hash-mismatch',
      `expected ${expected}, got ${got}`,
    );
  }
  return new Blob([buf], { type: resp.headers.get('content-type') ?? '' });
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return s;
}

function b64encode(s: string): string {
  // btoa requires Latin-1; encode UTF-8 bytes first.
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  return btoa(bin);
}
