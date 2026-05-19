import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';

// ---------------------------------------------------------------------------
// localStorage shim — Node may ship a stub `localStorage` that shadows
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
// In-memory mock relay (mirrors the one used in dm.test.ts).
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
type Filter = { kinds?: number[]; '#p'?: string[]; '#L'?: string[] };

interface Subscription {
  filter: Filter;
  handler: Listener;
  active: boolean;
}

const mockState = vi.hoisted(() => {
  let nextId = 1;
  const matches = (filter: Filter, e: RelayEvent): boolean => {
    if (filter.kinds && e.kind !== undefined && !filter.kinds.includes(e.kind)) {
      return false;
    }
    if (filter['#p']) {
      const pTags = e.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
      if (!filter['#p'].some((p) => pTags.includes(p))) return false;
    }
    if (filter['#L']) {
      const lTags = e.tags.filter((t) => t[0] === 'L').map((t) => t[1]);
      if (!filter['#L'].some((l) => lTags.includes(l))) return false;
    }
    return true;
  };
  const state = {
    events: [] as RelayEvent[],
    subs: [] as Subscription[],
    publish(e: RelayEvent): Promise<void> {
      // Stamp an id so dedup-by-id works downstream.
      const stamped: RelayEvent = {
        ...e,
        id: e.id ?? `mock-id-${nextId++}`,
      };
      state.events.push(stamped);
      for (const sub of state.subs) {
        if (!sub.active) continue;
        if (matches(sub.filter, stamped)) sub.handler(stamped);
      }
      return Promise.resolve();
    },
    subscribe(
      filter: Filter,
      handlers: { onEvent?: Listener },
    ): { stop: () => void } {
      const sub: Subscription = {
        filter,
        handler: handlers.onEvent ?? (() => {}),
        active: true,
      };
      state.subs.push(sub);
      // Replay matching prior events for late subscribers.
      for (const e of state.events) {
        if (matches(sub.filter, e)) sub.handler(e);
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
// Mock @/lib/ndk and ./ndk so reputation.ts talks only to the in-memory
// relay. Both alias forms resolve to the same module in production.
// ---------------------------------------------------------------------------
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
// Now we can import the unit under test (and its auth-store dependency).
// ---------------------------------------------------------------------------
import {
  REVIEW_EVENT_KIND,
  REVIEW_NAMESPACE,
  ReputationError,
  aggregateReviews,
  parseReview,
  postReview,
  type Review,
} from './reputation';
import { useAuthStore } from './auth';
import type { AddressableRef } from './listings/types';

function setLocalSigner(sk: Uint8Array): string {
  const hex = Array.from(sk)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const signer = new NDKPrivateKeySigner(hex);
  useAuthStore.setState({ signer, status: 'ready' });
  return getPublicKey(sk);
}

const target = 't'.repeat(64);
const ref: AddressableRef = {
  kind: 30402,
  pubkey: 'a'.repeat(64),
  d: 'compost-need-1',
};

function buildReview(
  reviewerPubkey: string,
  targetPubkey: string,
  reference: AddressableRef,
  score: Review['score'],
  createdAt: number,
): Review {
  return {
    id: `${reviewerPubkey.slice(0, 6)}-${score}-${createdAt}`,
    reviewerPubkey,
    targetPubkey,
    reference,
    score,
    createdAt,
  };
}

beforeEach(() => {
  resetRelay();
  useAuthStore.setState({
    method: null,
    signer: null,
    npub: null,
    status: 'idle',
    error: undefined,
  });
});

describe('SPEC-017 reputation reviews — aggregate', () => {
  it('three reviewers (+1, +1, -1) on same target/reference -> score 1', () => {
    const r1 = 'r'.repeat(64);
    const r2 = 's'.repeat(64);
    const r3 = 'q'.repeat(64);
    const reviews: Review[] = [
      buildReview(r1, target, ref, '+1', 100),
      buildReview(r2, target, ref, '+1', 101),
      buildReview(r3, target, ref, '-1', 102),
    ];
    const agg = aggregateReviews(reviews, target);
    expect(agg.positive).toBe(2);
    expect(agg.negative).toBe(1);
    expect(agg.noShows).toBe(0);
    expect(agg.score).toBe(1);
  });

  it('same reviewer posts +1 then -1 — newer (-1) wins', () => {
    const r1 = 'r'.repeat(64);
    const reviews: Review[] = [
      buildReview(r1, target, ref, '+1', 100),
      buildReview(r1, target, ref, '-1', 200),
    ];
    const agg = aggregateReviews(reviews, target);
    expect(agg.positive).toBe(0);
    expect(agg.negative).toBe(1);
    expect(agg.score).toBe(-1);
  });

  it('drops a self-review (reviewer === target)', () => {
    const r1 = 'r'.repeat(64);
    const reviews: Review[] = [
      buildReview(r1, target, ref, '+1', 100),
      buildReview(target, target, ref, '+1', 101), // self
    ];
    const agg = aggregateReviews(reviews, target);
    expect(agg.positive).toBe(1);
    expect(agg.score).toBe(1);
  });

  it('no-show counts double against score', () => {
    const r1 = 'r'.repeat(64);
    const reviews: Review[] = [
      buildReview(r1, target, ref, 'no-show', 100),
    ];
    const agg = aggregateReviews(reviews, target);
    expect(agg.noShows).toBe(1);
    expect(agg.score).toBe(-2);
  });
});

describe('SPEC-017 reputation reviews — postReview', () => {
  it('emits a kind-1985 event with the right L/l/p/a/d tag contents', async () => {
    const sk = generateSecretKey();
    const reviewerPk = setLocalSigner(sk);

    await postReview({
      target,
      listingOrEvent: ref,
      score: '+1',
      text: 'Great compost partner.',
    });

    expect(mockState.events.length).toBe(1);
    const ev = mockState.events[0];
    if (!ev) throw new Error('expected published event');
    expect(ev.kind).toBe(REVIEW_EVENT_KIND);
    expect(ev.pubkey).toBe(reviewerPk);
    expect(ev.content).toBe('Great compost partner.');

    const tag = (name: string): string[] | undefined =>
      ev.tags.find((t) => t[0] === name);
    expect(tag('L')?.[1]).toBe(REVIEW_NAMESPACE);
    const lTag = ev.tags.find(
      (t) => t[0] === 'l' && t[2] === REVIEW_NAMESPACE,
    );
    expect(lTag?.[1]).toBe('+1');
    expect(tag('p')?.[1]).toBe(target);
    expect(tag('a')?.[1]).toBe(`${ref.kind}:${ref.pubkey}:${ref.d}`);
    expect(tag('d')?.[1]).toBe(
      `review:${target}:${ref.kind}:${ref.pubkey}:${ref.d}`,
    );

    // Round-trip via parseReview.
    const parsed = parseReview(ev as unknown as Parameters<typeof parseReview>[0]);
    expect(parsed).not.toBeNull();
    expect(parsed?.score).toBe('+1');
    expect(parsed?.targetPubkey).toBe(target);
    expect(parsed?.reference).toEqual(ref);
    expect(parsed?.text).toBe('Great compost partner.');
  });

  it('throws ReputationError(no-signer) without a signer', async () => {
    let caught: unknown;
    try {
      await postReview({ target, listingOrEvent: ref, score: '+1' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ReputationError);
    expect((caught as ReputationError).kind).toBe('no-signer');
    expect(mockState.events.length).toBe(0);
  });

  it('three independent reviewers post — relay sees three events, aggregate is +1', async () => {
    const skA = generateSecretKey();
    const skB = generateSecretKey();
    const skC = generateSecretKey();

    setLocalSigner(skA);
    await postReview({ target, listingOrEvent: ref, score: '+1' });
    setLocalSigner(skB);
    await postReview({ target, listingOrEvent: ref, score: '+1' });
    setLocalSigner(skC);
    await postReview({ target, listingOrEvent: ref, score: '-1' });

    expect(mockState.events.length).toBe(3);

    const reviews = mockState.events
      .map((e) => parseReview(e as unknown as Parameters<typeof parseReview>[0]))
      .filter((r): r is Review => r !== null);
    expect(reviews).toHaveLength(3);

    const agg = aggregateReviews(reviews, target);
    expect(agg.positive).toBe(2);
    expect(agg.negative).toBe(1);
    expect(agg.score).toBe(1);
  });
});
