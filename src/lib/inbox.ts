/**
 * SPEC-028 — Inbox unread badges. Tracks `lastSeenAt[scope]` per scope
 * in IndexedDB via Dexie. `useUnreadCounts` subscribes to live DMs
 * (SPEC-014) and claims targeting current user's listings (SPEC-015) and
 * counts events with `created_at > lastSeenAt[scope]`. `markRead(scope)`
 * persists `lastSeenAt[scope] = now` and resets the count.
 */
import { useEffect, useMemo, useState } from 'react';
import Dexie, { type Table } from 'dexie';
import { subscribeDms } from './dm';
import { subscribeMyInbox, type Claim } from './listings/claim';
import { useAuthStore } from './auth';

export type InboxScope = 'claims' | 'dms';

interface LastSeenRow { scope: InboxScope; at: number /* unix seconds */ }

class CompostInboxDB extends Dexie {
  last_seen!: Table<LastSeenRow, InboxScope>;
  constructor() {
    super('compost-inbox');
    this.version(1).stores({ last_seen: 'scope' });
  }
}

interface InboxStore {
  get(scope: InboxScope): Promise<number>;
  put(scope: InboxScope, at: number): Promise<void>;
  all(): Promise<Record<InboxScope, number>>;
}

class DexieInboxStore implements InboxStore {
  private db = new CompostInboxDB();
  async get(scope: InboxScope): Promise<number> {
    return (await this.db.last_seen.get(scope))?.at ?? 0;
  }
  async put(scope: InboxScope, at: number): Promise<void> {
    await this.db.last_seen.put({ scope, at });
  }
  async all(): Promise<Record<InboxScope, number>> {
    const rows = await this.db.last_seen.toArray();
    const out: Record<InboxScope, number> = { claims: 0, dms: 0 };
    for (const r of rows) out[r.scope] = r.at;
    return out;
  }
}

class MemoryInboxStore implements InboxStore {
  private m = new Map<InboxScope, number>();
  async get(scope: InboxScope): Promise<number> { return this.m.get(scope) ?? 0; }
  async put(scope: InboxScope, at: number): Promise<void> { this.m.set(scope, at); }
  async all(): Promise<Record<InboxScope, number>> {
    return { claims: this.m.get('claims') ?? 0, dms: this.m.get('dms') ?? 0 };
  }
}

let _store: InboxStore | null = null;
function store(): InboxStore {
  if (_store) return _store;
  const hasIDB =
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { indexedDB?: unknown }).indexedDB !== 'undefined';
  _store = hasIDB ? new DexieInboxStore() : new MemoryInboxStore();
  return _store;
}

// SPEC-015 wiring: subscribeMyInbox(hexPubkey) emits a snapshot of all
// observed claims; we count entries with `createdAt > lastSeen.claims`.
// Tests / routes can override via `_setClaimsSubscriber`.
type ClaimLike = { createdAt?: number; created_at?: number };
type ClaimsHandler = (value: ReadonlyArray<Pick<Claim, 'createdAt'>> | ClaimLike) => void;
type ClaimsSub = { subscribe(handler: ClaimsHandler): () => void };

function defaultClaimsSubscriber(): ClaimsSub {
  const signer = useAuthStore.getState().signer;
  if (!signer) return { subscribe: () => () => undefined };
  return {
    subscribe(handler) {
      let inner: (() => void) | undefined;
      let cancelled = false;
      void signer.user().then((u) => {
        if (cancelled) return;
        inner = subscribeMyInbox(u.pubkey).subscribe(handler);
      });
      return () => {
        cancelled = true;
        if (inner) inner();
      };
    },
  };
}

let _subscribeClaims: () => ClaimsSub = defaultClaimsSubscriber;

/** Test-only / route hook: register a custom claims subscription factory. */
export function _setClaimsSubscriber(fn: (() => ClaimsSub) | null): void {
  _subscribeClaims = fn ?? defaultClaimsSubscriber;
}

// --- public API -----------------------------------------------------------

/** Persist `lastSeenAt[scope] = now`. Reactive listeners re-derive 0. */
export async function markRead(scope: InboxScope): Promise<void> {
  await store().put(scope, Math.floor(Date.now() / 1000));
  _bumpVersion();
}

// A tiny in-process pub/sub so `useUnreadCounts` re-reads after `markRead`.
let _version = 0;
const _versionListeners = new Set<() => void>();
function _bumpVersion(): void {
  _version += 1;
  for (const l of _versionListeners) l();
}

interface UnreadCounts { claims: number; dms: number; total: number }

/** React hook: live unread counts for claims + dms. */
export function useUnreadCounts(): UnreadCounts {
  const [version, setVersion] = useState(0);
  const [lastSeen, setLastSeen] = useState<Record<InboxScope, number>>({
    claims: 0, dms: 0,
  });
  const [claimsCount, setClaimsCount] = useState(0);
  const [dmsCount, setDmsCount] = useState(0);

  // Bump on markRead.
  useEffect(() => {
    const tick = (): void => setVersion(_version);
    _versionListeners.add(tick);
    return () => { _versionListeners.delete(tick); };
  }, []);

  // Re-read lastSeen whenever version changes.
  useEffect(() => {
    let cancelled = false;
    void store().all().then((m) => {
      if (!cancelled) setLastSeen(m);
    });
    return () => { cancelled = true; };
  }, [version]);

  // Subscribe to DMs.
  useEffect(() => {
    setDmsCount(0);
    const sub = subscribeDms();
    const unsub = sub.subscribe((dm) => {
      if (dm.createdAt > lastSeen.dms) setDmsCount((c) => c + 1);
    });
    return () => unsub();
  }, [lastSeen.dms]);

  // Claims: SPEC-015 emits a snapshot array; tests may emit single events.
  useEffect(() => {
    setClaimsCount(0);
    let unsub: (() => void) | undefined;
    try {
      const sub = _subscribeClaims();
      unsub = sub.subscribe((value) => {
        if (Array.isArray(value)) {
          let n = 0;
          for (const c of value) if (c.createdAt > lastSeen.claims) n += 1;
          setClaimsCount(n);
        } else {
          const c = value as { createdAt?: number; created_at?: number };
          const ts = c.createdAt ?? c.created_at ?? 0;
          if (ts > lastSeen.claims) setClaimsCount((n) => n + 1);
        }
      });
    } catch { /* claims source unavailable; remain 0 */ }
    return () => { if (unsub) unsub(); };
  }, [lastSeen.claims]);

  return useMemo(
    () => ({ claims: claimsCount, dms: dmsCount, total: claimsCount + dmsCount }),
    [claimsCount, dmsCount],
  );
}

/** Test-only: drop the in-memory store and any subscribers. */
export function _resetInboxForTests(): void {
  _store = null;
  _subscribeClaims = defaultClaimsSubscriber;
  _version = 0;
  _versionListeners.clear();
}

/** Test-only: install an in-memory store directly (skip Dexie). */
export function _setInboxStoreForTests(s: InboxStore | null): void {
  _store = s;
}
