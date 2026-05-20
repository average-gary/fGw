/**
 * SPEC-028 — Inbox route tests.
 *
 * Strategy:
 *   • Mock `@/lib/listings/claim` and `@/lib/dm` at the module boundary so
 *     each test can imperatively drive the streams (push a claim / push
 *     DMs / push nothing). The Inbox route imports `subscribeMyInbox` /
 *     `subscribeDms` directly, so the `_setClaimsSubscriber` hook in
 *     `inbox.ts` (which is for `useUnreadCounts`) doesn't apply here —
 *     module mocks are the cleanest controlled-subscriber substitute.
 *   • Inject the InMemoryStore from inbox.test.ts via
 *     `_setInboxStoreForTests` so we can read back what `markRead` wrote.
 *   • Mock `PubkeyChip` and `ReputationBadge` to avoid pulling in
 *     `useReputation` (which spins up an NDK subscription). Renders are
 *     reduced to a `<span>` with the pubkey for stability.
 *
 * No production patches were needed; `Inbox.tsx` correctly calls
 * `markRead('claims')` and `markRead('dms')` on mount and renders the
 * "Quiet in here" empty state when both streams are empty.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// localStorage shim — the auth zustand store uses `persist` and crashes on
// happy-dom's no-op localStorage. Same shim used by other lib + route tests.
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
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(), configurable: true, writable: true,
  });
});

// ---------------------------------------------------------------------------
// Controlled claim subscription. The Inbox route calls
// `subscribeMyInbox(myPubkey).subscribe(handler)` once `myPubkey` resolves.
// We collect handlers per-test so each `it` can push a curated snapshot.
// ---------------------------------------------------------------------------
type Claim = {
  id: string;
  authorPubkey: string;
  message: string;
  createdAt: number;
  targetEventId?: string;
  targetRef?: { kind: number; pubkey: string; d: string };
};
type ClaimsHandler = (claims: Claim[]) => void;

const claimsState = vi.hoisted(() => ({
  handlers: new Set<(claims: unknown[]) => void>(),
}));

vi.mock('@/lib/listings/claim', () => ({
  subscribeMyInbox: () => ({
    subscribe(h: ClaimsHandler): () => void {
      claimsState.handlers.add(h as unknown as (claims: unknown[]) => void);
      return () => { claimsState.handlers.delete(h as unknown as (claims: unknown[]) => void); };
    },
  }),
}));

// ---------------------------------------------------------------------------
// Controlled DM subscription. `subscribeDms()` returns an Observable-shaped
// object whose subscriber receives one DecryptedDm per emission.
// ---------------------------------------------------------------------------
type DecryptedDm = {
  id: string;
  from: string;
  to: string;
  content: string;
  createdAt: number;
};
type DmHandler = (dm: DecryptedDm) => void;

const dmState = vi.hoisted(() => ({
  handlers: new Set<(dm: unknown) => void>(),
}));

vi.mock('@/lib/dm', () => ({
  subscribeDms: () => ({
    subscribe(h: DmHandler): () => void {
      dmState.handlers.add(h as unknown as (dm: unknown) => void);
      return () => { dmState.handlers.delete(h as unknown as (dm: unknown) => void); };
    },
  }),
}));

// ---------------------------------------------------------------------------
// Trim profile/reputation chips to dumb spans. Their real impls open NDK
// subscriptions per pubkey, which we don't want in this scope.
// ---------------------------------------------------------------------------
vi.mock('@/components/feed/PubkeyChip', () => ({
  PubkeyChip: ({ pubkey }: { pubkey: string }) => (
    <span data-testid="pubkey-chip">{pubkey}</span>
  ),
}));

vi.mock('@/components/feed/ReputationBadge', () => ({
  ReputationBadge: ({ pubkey }: { pubkey: string }) => (
    <span data-testid="rep-badge">{pubkey.slice(0, 4)}</span>
  ),
}));

// ---------------------------------------------------------------------------
// Imports that depend on the mocks above must come AFTER `vi.mock(...)`.
// ---------------------------------------------------------------------------
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/lib/auth';
import {
  _resetInboxForTests,
  _setInboxStoreForTests,
  type InboxScope,
} from '@/lib/inbox';
import { _resetProfileForTests } from '@/lib/profile';
import { Inbox } from './Inbox';

// In-memory inbox store — same shape as the one in src/lib/inbox.test.ts
// so `markRead(scope)` writes to a Map we can read back synchronously.
class InMemoryStore {
  private m = new Map<InboxScope, number>();
  async get(scope: InboxScope): Promise<number> { return this.m.get(scope) ?? 0; }
  async put(scope: InboxScope, at: number): Promise<void> { this.m.set(scope, at); }
  async all(): Promise<Record<InboxScope, number>> {
    return { claims: this.m.get('claims') ?? 0, dms: this.m.get('dms') ?? 0 };
  }
}

let store: InMemoryStore;

// Minimal signer: the route awaits `signer.user()` for `myPubkey`. Anything
// else on the signer surface is unused by Inbox.
const MY_PUBKEY = 'a'.repeat(64);
function setSignerForPubkey(pubkey: string): void {
  const signer = { user: async () => ({ pubkey }) };
  useAuthStore.setState({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signer: signer as any,
    method: 'nsec-local',
    npub: 'npub1mock',
    status: 'ready',
  });
}

beforeEach(() => {
  cleanup();
  claimsState.handlers.clear();
  dmState.handlers.clear();
  _resetInboxForTests();
  store = new InMemoryStore();
  _setInboxStoreForTests(store);
  _resetProfileForTests();
  useAuthStore.setState({
    method: null, signer: null, npub: null, status: 'idle', error: undefined,
  });
});

afterEach(() => {
  cleanup();
});

async function flushAsync(): Promise<void> {
  // Let `signer.user().then(...)`, the markRead promises, and any chained
  // microtasks settle before we make assertions.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    authorPubkey: 'b'.repeat(64),
    message: 'I want this seedling',
    createdAt: 1_700_000_500,
    targetRef: { kind: 30402, pubkey: MY_PUBKEY, d: 'tomato-seedlings' },
    ...overrides,
  };
}

function makeDm(overrides: Partial<DecryptedDm> = {}): DecryptedDm {
  return {
    id: 'dm-1',
    from: 'c'.repeat(64),
    to: MY_PUBKEY,
    content: 'hello there',
    createdAt: 1_700_000_400,
    ...overrides,
  };
}

describe('SPEC-028 Inbox route', () => {
  it('renders one row per claim and per DM (1 claim + 2 DMs → 3 rows)', async () => {
    setSignerForPubkey(MY_PUBKEY);
    render(<Inbox />);
    // Wait for `signer.user()` and the two subscription effects to wire up.
    await flushAsync();
    await waitFor(() => {
      expect(claimsState.handlers.size).toBe(1);
      expect(dmState.handlers.size).toBe(1);
    });

    const claim = makeClaim({ id: 'claim-A', message: 'mint please' });
    const dm1 = makeDm({ id: 'dm-A', content: 'first message' });
    const dm2 = makeDm({ id: 'dm-B', content: 'second message', createdAt: 1_700_000_600 });

    await act(async () => {
      for (const h of claimsState.handlers) (h as ClaimsHandler)([claim]);
      for (const h of dmState.handlers) {
        (h as DmHandler)(dm1);
        (h as DmHandler)(dm2);
      }
    });

    const list = await screen.findByLabelText('Inbox');
    const items = list.getElementsByTagName('li');
    expect(items.length).toBe(3);
    expect(screen.getByText('first message')).toBeTruthy();
    expect(screen.getByText('second message')).toBeTruthy();
    expect(screen.getByText('mint please')).toBeTruthy();
  });

  it('marks both scopes read on mount (claims + dms last_seen records written)', async () => {
    setSignerForPubkey(MY_PUBKEY);

    // Sanity: store starts empty.
    expect(await store.get('claims')).toBe(0);
    expect(await store.get('dms')).toBe(0);

    render(<Inbox />);
    await flushAsync();

    await waitFor(async () => {
      expect(await store.get('claims')).toBeGreaterThan(0);
      expect(await store.get('dms')).toBeGreaterThan(0);
    });
  });

  it('shows the empty state when both streams emit nothing', async () => {
    setSignerForPubkey(MY_PUBKEY);
    render(<Inbox />);
    await flushAsync();

    // Don't push anything onto the streams — empty state should render.
    expect(screen.getByText('Quiet in here')).toBeTruthy();
    // The inbox <ul> should not be present.
    expect(screen.queryByLabelText('Inbox')).toBeNull();
  });
});
