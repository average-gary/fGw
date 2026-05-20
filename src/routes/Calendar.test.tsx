/**
 * SPEC-022 — Calendar route tests.
 *
 * Mocks NDK with the in-memory mock-relay pattern (mirrors `dm.test.ts`
 * + `NewListing.test.tsx`). Seeds two synthetic kind-31923 labor events
 * (one `pile-turn`, one `mulch-drive`) tagged for the chapter community,
 * renders <Calendar/>, then asserts:
 *   1. both render in chronological order
 *   2. filtering by `pile-turn` hides the mulch-drive event
 *   3. tapping "Going" publishes a kind-31925 with the expected
 *      `a:31923:<author>:<d>` and `status:accepted` tags
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';

// ---------------------------------------------------------------------------
// localStorage shim — must land before any zustand-persist module imports.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// In-memory mock relay. Filters supported: kinds, authors, '#a'.
// ---------------------------------------------------------------------------
type RelayEvent = {
  id?: string;
  kind?: number;
  pubkey?: string;
  content: string;
  tags: string[][];
  created_at: number;
  sig?: string;
};
type Listener = (e: RelayEvent) => void;
type Filter = {
  kinds?: number[];
  authors?: string[];
  '#a'?: string[];
  '#p'?: string[];
  limit?: number;
};
interface Subscription {
  filter: Filter;
  handler: Listener;
  active: boolean;
}

function matches(e: RelayEvent, f: Filter): boolean {
  if (f.kinds && e.kind !== undefined && !f.kinds.includes(e.kind)) return false;
  if (f.authors && e.pubkey && !f.authors.includes(e.pubkey)) return false;
  if (f['#a']) {
    const aTags = e.tags.filter((t) => t[0] === 'a').map((t) => t[1]);
    if (!f['#a'].some((a) => aTags.includes(a))) return false;
  }
  if (f['#p']) {
    const pTags = e.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
    if (!f['#p'].some((p) => pTags.includes(p))) return false;
  }
  return true;
}

const mockState = vi.hoisted(() => {
  // Local copy of `matches` since vi.hoisted runs before module-scope
  // function declarations are visible.
  function matchesLocal(e: RelayEvent, f: Filter): boolean {
    if (f.kinds && e.kind !== undefined && !f.kinds.includes(e.kind)) return false;
    if (f.authors && e.pubkey && !f.authors.includes(e.pubkey)) return false;
    if (f['#a']) {
      const aTags = e.tags.filter((t) => t[0] === 'a').map((t) => t[1]);
      if (!f['#a'].some((a) => aTags.includes(a))) return false;
    }
    if (f['#p']) {
      const pTags = e.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
      if (!f['#p'].some((p) => pTags.includes(p))) return false;
    }
    return true;
  }
  const state = {
    events: [] as RelayEvent[],
    subs: [] as Subscription[],
    publish(e: RelayEvent): Promise<void> {
      state.events.push(e);
      for (const sub of state.subs) {
        if (!sub.active) continue;
        if (matchesLocal(e, sub.filter)) sub.handler(e);
      }
      return Promise.resolve();
    },
    subscribe(filter: Filter, handlers: { onEvent?: Listener }): { stop: () => void } {
      const sub: Subscription = {
        filter,
        handler: handlers.onEvent ?? (() => {}),
        active: true,
      };
      state.subs.push(sub);
      // Replay matching events that already exist so subscribers started
      // after publish still see them — mirrors the dm.test mock.
      for (const e of state.events) {
        if (matchesLocal(e, sub.filter)) sub.handler(e);
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

// ---------------------------------------------------------------------------
// Mock NDK so getNdk returns the relay shape directly.
// ---------------------------------------------------------------------------
vi.mock('@/lib/ndk', () => ({
  getNdk: () => mockState,
  currentRelay: () => 'wss://mock.example',
  setRelayToast: () => {},
  addRelay: () => {},
}));

// Mock notifications so test never reaches into Tauri.
vi.mock('@/lib/notifications', () => ({
  scheduleNotificationsForRsvp: vi.fn(async () => {}),
}));

// Stub pyramid: route only uses `usePublishGuard`. Default to a passthrough.
vi.mock('@/lib/pyramid', () => ({
  usePublishGuard: () => ({
    blocked: false,
    guard: async <T,>(fn: () => Promise<T>): Promise<T | null> => fn(),
  }),
  useMembershipStatus: (_pk: string) => 'allowed',
}));

// ---------------------------------------------------------------------------
// Now imports under test.
// ---------------------------------------------------------------------------
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { Calendar } from './Calendar';
import { useAuthStore } from '@/lib/auth';
import { encodeLaborEvent } from '@/lib/events/calendar';
import type { LaborEvent } from '@/lib/events/types';

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++)
    s += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  return s;
}

const CHAPTER_PUBKEY = 'a'.repeat(64);
const CHAPTER_D = 'powder-keg-wv';
const CHAPTER = { pubkey: CHAPTER_PUBKEY, d: CHAPTER_D };

let authorPubkey = '';

function seedLaborEvent(
  pubkey: string,
  ev: LaborEvent,
  dSlug: string,
): { dSlug: string; aTag: string } {
  const env = encodeLaborEvent(ev, { dSlug, chapter: CHAPTER });
  const raw: RelayEvent = {
    id: `id:${dSlug}`,
    kind: env.kind,
    pubkey,
    content: env.content,
    tags: env.tags,
    created_at: env.created_at,
    sig: 'sig:' + dSlug,
  };
  void mockState.publish(raw);
  return { dSlug, aTag: `31923:${pubkey}:${dSlug}` };
}

beforeEach(() => {
  memStore.clear();
  resetRelay();
  // Seed a signer for the *current* user (publisher of the RSVP).
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const signer = new NDKPrivateKeySigner(bytesToHex(sk));
  useAuthStore.setState({
    method: 'nsec-local',
    signer,
    npub: pk,
    status: 'ready',
    error: undefined,
  });
  // Distinct author for the labor events (so RSVP author != event author).
  authorPubkey = 'b'.repeat(64);
});

afterEach(() => {
  cleanup();
});

describe('SPEC-022 Calendar', () => {
  it('renders upcoming events in chronological order', async () => {
    const now = Math.floor(Date.now() / 1000);
    // pile-turn at +5 days, mulch-drive at +2 days. Sorted asc => mulch first.
    seedLaborEvent(
      authorPubkey,
      {
        kind: 'pile-turn',
        title: 'Turn the front pile',
        description: 'Bring pitchforks.',
        start: now + 5 * 86400,
        version: 1,
      },
      'turn-front-pile',
    );
    seedLaborEvent(
      authorPubkey,
      {
        kind: 'mulch-drive',
        title: 'Spring mulch drive',
        description: 'Pickups across town.',
        start: now + 2 * 86400,
        version: 1,
      },
      'spring-mulch-drive',
    );

    render(<Calendar chapter={CHAPTER} />);

    await waitFor(() => {
      expect(screen.getByText('Turn the front pile')).toBeTruthy();
      expect(screen.getByText('Spring mulch drive')).toBeTruthy();
    });

    const list = screen.getByRole('list', { name: /Upcoming labor events/i });
    const titles = within(list)
      .getAllByRole('heading')
      .map((h) => h.textContent ?? '');
    // Mulch drive (sooner) precedes pile turn (later).
    const idxMulch = titles.findIndex((t) => t.includes('Spring mulch drive'));
    const idxTurn = titles.findIndex((t) => t.includes('Turn the front pile'));
    expect(idxMulch).toBeGreaterThanOrEqual(0);
    expect(idxTurn).toBeGreaterThanOrEqual(0);
    expect(idxMulch).toBeLessThan(idxTurn);
  });

  it('filters to pile-turn only when the Pile turn chip is selected', async () => {
    const user = userEvent.setup();
    const now = Math.floor(Date.now() / 1000);
    seedLaborEvent(
      authorPubkey,
      {
        kind: 'pile-turn',
        title: 'Turn the front pile',
        description: 'Bring pitchforks.',
        start: now + 5 * 86400,
        version: 1,
      },
      'turn-front-pile',
    );
    seedLaborEvent(
      authorPubkey,
      {
        kind: 'mulch-drive',
        title: 'Spring mulch drive',
        description: 'Pickups across town.',
        start: now + 2 * 86400,
        version: 1,
      },
      'spring-mulch-drive',
    );

    render(<Calendar chapter={CHAPTER} />);

    await waitFor(() => {
      expect(screen.getByText('Spring mulch drive')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Pile turn' }));

    await waitFor(() => {
      expect(screen.queryByText('Spring mulch drive')).toBeNull();
    });
    expect(screen.getByText('Turn the front pile')).toBeTruthy();
  });

  it('publishes a kind-31925 RSVP with correct a-tag + status:accepted on Going tap', async () => {
    const user = userEvent.setup();
    const now = Math.floor(Date.now() / 1000);
    const { dSlug } = seedLaborEvent(
      authorPubkey,
      {
        kind: 'pile-turn',
        title: 'Turn the front pile',
        description: 'Bring pitchforks.',
        start: now + 5 * 86400,
        version: 1,
      },
      'turn-front-pile',
    );

    render(<Calendar chapter={CHAPTER} />);

    await waitFor(() => {
      expect(screen.getByText('Turn the front pile')).toBeTruthy();
    });

    // Three identically-labeled buttons live in the doc (filter chips also
    // exist) — but Going / Maybe / No only appear on the card.
    await user.click(screen.getByRole('button', { name: 'Going' }));

    await waitFor(() => {
      const ev = mockState.events.find((e) => e.kind === 31925);
      if (!ev) throw new Error('no kind-31925 published yet');
    });

    const rsvp = mockState.events.find((e) => e.kind === 31925);
    expect(rsvp).toBeTruthy();
    if (!rsvp) return;

    const tagPairs = rsvp.tags.map((t) => t.join(':'));
    expect(tagPairs).toContain(`a:31923:${authorPubkey}:${dSlug}`);
    expect(tagPairs).toContain('status:accepted');
    // p-tag points at the labor event's author (not the RSVP signer).
    expect(rsvp.tags.find((t) => t[0] === 'p')?.[1]).toBe(authorPubkey);
  });
});
