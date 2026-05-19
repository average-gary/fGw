/**
 * SPEC-028 — Profile (kind 0) editor. Module-level zustand cache keyed
 * by pubkey; NDK subs are ref-counted per pubkey. `updateProfile` merges
 * its patch over the latest raw JSON, preserving unknown fields.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { NDKEvent, type NDKEvent as NDKEventType, type NostrEvent } from '@nostr-dev-kit/ndk';
import { useAuthStore } from './auth';
import { getNdk } from './ndk';

export const PROFILE_EVENT_KIND = 0 as const;

export interface Profile {
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  lud16?: string;
}

interface CacheRow { profile: Profile; raw: Record<string, unknown>; createdAt: number }
interface ProfileStore {
  byPubkey: Record<string, CacheRow>;
  _put: (pubkey: string, row: CacheRow) => void;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  byPubkey: {},
  _put: (pubkey, row) =>
    set((s) => {
      const prev = s.byPubkey[pubkey];
      if (prev && prev.createdAt >= row.createdAt) return s;
      return { byPubkey: { ...s.byPubkey, [pubkey]: row } };
    }),
}));

type SubHandle = { stop?: () => void; close?: () => void };
const _subs = new Map<string, { handle: SubHandle; refs: number }>();

function ingest(pubkey: string, raw: NostrEvent): void {
  if (raw.kind !== PROFILE_EVENT_KIND || raw.pubkey !== pubkey) return;
  let parsed: Record<string, unknown>;
  try {
    const r = JSON.parse(raw.content);
    if (!r || typeof r !== 'object') return;
    parsed = r as Record<string, unknown>;
  } catch { return; }
  const p: Profile = {};
  const dn = parsed['display_name'] ?? parsed['displayName'] ?? parsed['name'];
  if (typeof dn === 'string') p.displayName = dn;
  if (typeof parsed['picture'] === 'string') p.picture = parsed['picture'] as string;
  if (typeof parsed['about'] === 'string') p.about = parsed['about'] as string;
  if (typeof parsed['nip05'] === 'string') p.nip05 = parsed['nip05'] as string;
  if (typeof parsed['lud16'] === 'string') p.lud16 = parsed['lud16'] as string;
  useProfileStore.getState()._put(pubkey, { profile: p, raw: parsed, createdAt: raw.created_at });
}

function subscribePubkey(pubkey: string): () => void {
  const existing = _subs.get(pubkey);
  if (existing) {
    existing.refs += 1;
    return () => releasePubkey(pubkey);
  }
  const ndk = getNdk() as unknown as {
    subscribe: (
      filter: { kinds: number[]; authors: string[] },
      handlers?: { onEvent?: (e: NostrEvent | NDKEventType) => void },
    ) => SubHandle & {
      on?: (evt: 'event', cb: (e: NostrEvent | NDKEventType) => void) => void;
    };
  };
  const onEvent = (e: NostrEvent | NDKEventType): void => {
    const raw = (e as NDKEventType).rawEvent
      ? ((e as NDKEventType).rawEvent() as unknown as NostrEvent)
      : (e as NostrEvent);
    ingest(pubkey, raw);
  };
  const handle = ndk.subscribe(
    { kinds: [PROFILE_EVENT_KIND], authors: [pubkey] },
    { onEvent },
  );
  if (typeof handle.on === 'function') handle.on('event', onEvent);
  _subs.set(pubkey, { handle, refs: 1 });
  return () => releasePubkey(pubkey);
}

function releasePubkey(pubkey: string): void {
  const entry = _subs.get(pubkey);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  _subs.delete(pubkey);
  try {
    if (typeof entry.handle.stop === 'function') entry.handle.stop();
    else if (typeof entry.handle.close === 'function') entry.handle.close();
  } catch { /* ignore */ }
}

/** React hook: cached Profile for `pubkey` (`{}` until first event). */
export function useProfile(pubkey: string): Profile {
  const row = useProfileStore((s) => s.byPubkey[pubkey]);
  useEffect(() => {
    if (!pubkey) return;
    return subscribePubkey(pubkey);
  }, [pubkey]);
  return row ? row.profile : {};
}

/** Imperative one-shot for non-React callers. */
export function getProfile(
  pubkey: string,
  opts?: { force?: boolean; timeoutMs?: number },
): Promise<Profile> {
  if (!opts?.force) {
    const cached = useProfileStore.getState().byPubkey[pubkey];
    if (cached) return Promise.resolve(cached.profile);
  }
  const timeoutMs = opts?.timeoutMs ?? 3000;
  return new Promise<Profile>((resolve) => {
    const release = subscribePubkey(pubkey);
    let done = false;
    let unsub: (() => void) | undefined;
    const finish = (p: Profile): void => {
      if (done) return;
      done = true; unsub?.(); release(); resolve(p);
    };
    // Subscribe may have synchronously ingested a replayed event.
    const cached = useProfileStore.getState().byPubkey[pubkey];
    if (cached) { finish(cached.profile); return; }
    unsub = useProfileStore.subscribe((s) => {
      const row = s.byPubkey[pubkey];
      if (row) finish(row.profile);
    });
    setTimeout(() => finish({}), timeoutMs);
  });
}

/** Publish a new kind-0 with merged content; preserves unknown fields. */
export async function updateProfile(patch: Partial<Profile>): Promise<void> {
  const signer = useAuthStore.getState().signer;
  if (!signer) throw new Error('updateProfile: no signer');
  const pubkey = (await signer.user()).pubkey;

  let row = useProfileStore.getState().byPubkey[pubkey];
  if (!row) {
    await getProfile(pubkey, { timeoutMs: 1500 });
    row = useProfileStore.getState().byPubkey[pubkey];
  }
  const merged: Record<string, unknown> = { ...(row?.raw ?? {}) };
  if (patch.displayName !== undefined) merged['display_name'] = patch.displayName;
  if (patch.picture !== undefined) merged['picture'] = patch.picture;
  if (patch.about !== undefined) merged['about'] = patch.about;
  if (patch.nip05 !== undefined) merged['nip05'] = patch.nip05;
  if (patch.lud16 !== undefined) merged['lud16'] = patch.lud16;

  const ndk = getNdk();
  const ev = new NDKEvent(ndk);
  ev.kind = PROFILE_EVENT_KIND;
  ev.created_at = Math.floor(Date.now() / 1000);
  ev.content = JSON.stringify(merged);
  ev.tags = [];
  await ev.sign(signer);
  // Test path: in-memory mock relays expose a direct publish(rawEvent).
  const ndkAny = ndk as unknown as { publish?: (e: NostrEvent) => Promise<unknown> | unknown };
  if (typeof ndkAny.publish === 'function') await ndkAny.publish(ev.rawEvent() as unknown as NostrEvent);
  else await ev.publish();
  ingest(pubkey, ev.rawEvent() as unknown as NostrEvent);
}

/** Test-only: clear cache + subscriptions. */
export function _resetProfileForTests(): void {
  for (const [, entry] of _subs) {
    try { entry.handle.stop?.(); } catch { /* ignore */ }
  }
  _subs.clear();
  useProfileStore.setState({ byPubkey: {} });
}
