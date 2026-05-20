/**
 * SPEC-020 — Listing detail + claim flow tests.
 *
 * Strategy: stub `getNdk()` with a tiny in-memory relay (mirrors the
 * pattern used in dm.test.ts / claim.test.ts). The route subscribes for
 * the listing event and for claims. We pre-load both so the synthetic
 * listing event and two claims arrive immediately on subscribe.
 *
 * We swap perspectives via `useAuthStore.setState({ signer })` and a
 * shimmed signer object so the route can ask `signer.user()` for the
 * current pubkey.
 *
 * `postReview` and `claim` from the lib are mocked so we can assert
 * call args without touching real signing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
// In-memory relay shaped like the slice of NDK that the route consumes.
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
type Filter = {
  kinds?: number[];
  authors?: string[];
  '#d'?: string[];
  '#p'?: string[];
  '#a'?: string[];
  '#t'?: string[];
  '#L'?: string[];
};

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
      for (const sub of state.subs) {
        if (!sub.active) continue;
        if (matches(sub.filter, e)) sub.handler(e);
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
  function matches(f: Filter, e: RelayEvent): boolean {
    if (f.kinds && e.kind !== undefined && !f.kinds.includes(e.kind)) {
      return false;
    }
    if (f.authors && !f.authors.includes(e.pubkey)) return false;
    const tagged = (n: string): string[] =>
      e.tags.filter((t) => t[0] === n).map((t) => t[1] ?? '');
    if (f['#d'] && !f['#d'].some((d) => tagged('d').includes(d))) {
      return false;
    }
    if (f['#a'] && !f['#a'].some((a) => tagged('a').includes(a))) {
      return false;
    }
    if (f['#t'] && !f['#t'].some((t) => tagged('t').includes(t))) {
      return false;
    }
    if (f['#p'] && !f['#p'].some((p) => tagged('p').includes(p))) {
      return false;
    }
    if (f['#L'] && !f['#L'].some((l) => tagged('L').includes(l))) {
      return false;
    }
    return true;
  }
  return state;
});

function resetRelay(): void {
  mockState.events.length = 0;
  mockState.subs.length = 0;
}

vi.mock('@/lib/ndk', () => ({
  getNdk: () => mockState,
  currentRelay: () => 'wss://mock.example',
  setRelayToast: () => {},
  addRelay: () => {},
}));

// Mock the lib/listings/claim module to control `claim()`, `fulfill()`,
// and to control what `subscribeClaimsFor` / `subscribeFulfillmentFor`
// emit. We re-export `Claim`/`FulfillmentEvent` shapes via re-import.
const mockClaimsState = vi.hoisted(() => ({
  claimSpy: vi.fn((..._args: unknown[]) => Promise.resolve(undefined)),
  fulfillSpy: vi.fn((..._args: unknown[]) => Promise.resolve(undefined)),
  pushedFns: [] as Array<(claims: unknown[]) => void>,
  pushedFulfillFns: [] as Array<(events: unknown[]) => void>,
  setClaims(claims: unknown[]) {
    for (const fn of this.pushedFns) fn(claims);
  },
  setFulfillments(events: unknown[]) {
    for (const fn of this.pushedFulfillFns) fn(events);
  },
}));

vi.mock('@/lib/listings/claim', () => ({
  claim: (...args: unknown[]) => mockClaimsState.claimSpy(...args),
  fulfill: (...args: unknown[]) => mockClaimsState.fulfillSpy(...args),
  subscribeClaimsFor: (_target: unknown) => ({
    subscribe(handler: (claims: unknown[]) => void) {
      mockClaimsState.pushedFns.push(handler);
      // Initial empty emit so the consumer's effect fires once.
      handler([]);
      return () => {
        mockClaimsState.pushedFns = mockClaimsState.pushedFns.filter(
          (f) => f !== handler,
        );
      };
    },
  }),
  subscribeFulfillmentFor: (_target: unknown) => ({
    subscribe(handler: (events: unknown[]) => void) {
      mockClaimsState.pushedFulfillFns.push(handler);
      handler([]);
      return () => {
        mockClaimsState.pushedFulfillFns = mockClaimsState.pushedFulfillFns.filter(
          (f) => f !== handler,
        );
      };
    },
  }),
  CLAIM_KIND: 1,
  CLAIM_TAG: 'claim',
  FULFILLED_TAG: 'fulfilled',
  ClaimError: class ClaimError extends Error {
    kind = 'no-signer' as const;
  },
}));

// Mock reputation so we can spy on `postReview`. We keep `useReputation`
// returning a stable empty aggregate (PubkeyChip won't render the ★ then).
const reviewSpy = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => Promise.resolve(undefined)),
);
vi.mock('@/lib/reputation', () => ({
  postReview: reviewSpy,
  useReputation: () => ({
    score: 0,
    positive: 0,
    negative: 0,
    noShows: 0,
    reviews: [],
  }),
  REVIEW_EVENT_KIND: 1985,
  REVIEW_NAMESPACE: 'compost-marketplace.review',
}));

// Mock profile so `useProfile` returns a stable empty profile (no async).
vi.mock('@/lib/profile', () => ({
  useProfile: () => ({}),
}));

// Mock dm to avoid pulling nostr-tools/nip59 into the test.
vi.mock('@/lib/dm', () => ({
  sendDm: vi.fn(async () => undefined),
  subscribeDms: () => ({
    subscribe: () => () => {},
  }),
}));

// ---------------------------------------------------------------------------
// Now safe to import the unit under test and supporting modules.
// ---------------------------------------------------------------------------
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { encodeListing } from '@/lib/listings/encode';
import {
  CHAPTER_A_TAG_DEFAULTS,
  LISTING_EVENT_KIND,
  type AddressableRef,
  type Listing,
} from '@/lib/listings/types';
import { useAuthStore } from '@/lib/auth';
import { ListingDetail } from './ListingDetail';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const authorPk = 'a'.repeat(64);
const claimerPkA = 'b'.repeat(64);
const claimerPkB = 'c'.repeat(64);
const outsiderPk = 'd'.repeat(64);

const sampleListing: Listing = {
  kind: 'offer',
  material: 'compost-finished',
  title: 'Aged compost — pickup in High View',
  description: 'Four wheelbarrows of finished compost. BYO bags.',
  photos: [],
  version: 1,
};

function makeRef(): AddressableRef {
  return {
    kind: LISTING_EVENT_KIND,
    pubkey: authorPk,
    d: 'aged-compost-test-ref',
  };
}

function publishListing(): void {
  const encoded = encodeListing(sampleListing, {
    dSlug: 'aged-compost-test-ref',
    createdAt: 1_700_000_000,
    chapter: { pubkey: CHAPTER_A_TAG_DEFAULTS.pubkey, d: CHAPTER_A_TAG_DEFAULTS.d },
  });
  void mockState.publish({
    id: 'listing-id',
    kind: encoded.kind,
    content: encoded.content,
    tags: encoded.tags,
    created_at: encoded.created_at,
    pubkey: authorPk,
  });
}

interface FakeSignerPubkey {
  pubkey: string;
}
function setSignerForPubkey(pubkey: string): void {
  const signer = {
    user: async (): Promise<FakeSignerPubkey> => ({ pubkey }),
  } as unknown as Parameters<typeof useAuthStore.setState>[0] extends infer _
    ? Parameters<typeof useAuthStore.setState>[0]
    : never;
  useAuthStore.setState({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signer: signer as any,
    status: 'ready',
    method: 'nsec-local',
    npub: pubkey,
  });
}

function clearSigner(): void {
  useAuthStore.setState({
    signer: null,
    status: 'idle',
    method: null,
    npub: null,
    error: undefined,
  });
}

// Two synthetic claims to push through subscribeClaimsFor.
function makeTwoClaims() {
  return [
    {
      id: 'claim-1',
      authorPubkey: claimerPkA,
      message: 'I can pick up Saturday',
      createdAt: 1_700_001_000,
      targetRef: makeRef(),
    },
    {
      id: 'claim-2',
      authorPubkey: claimerPkB,
      message: 'Still available?',
      createdAt: 1_700_002_000,
      targetRef: makeRef(),
    },
  ];
}

beforeEach(() => {
  memStore.clear();
  resetRelay();
  mockClaimsState.claimSpy.mockReset();
  mockClaimsState.claimSpy.mockResolvedValue(undefined);
  mockClaimsState.fulfillSpy.mockReset();
  mockClaimsState.fulfillSpy.mockResolvedValue(undefined);
  mockClaimsState.pushedFns = [];
  mockClaimsState.pushedFulfillFns = [];
  reviewSpy.mockReset();
  reviewSpy.mockResolvedValue(undefined);
  clearSigner();
});

afterEach(() => {
  cleanup();
});

describe('SPEC-020 ListingDetail', () => {
  it('renders title, kind badge, author chip, and two claim rows', async () => {
    publishListing();
    setSignerForPubkey(outsiderPk);
    render(<ListingDetail listingRef={makeRef()} />);

    // Title
    await waitFor(() => {
      expect(
        screen.getByText('Aged compost — pickup in High View'),
      ).toBeTruthy();
    });
    // Kind badge
    expect(screen.getByText('Offer')).toBeTruthy();
    // Author chip is the first pubkey-chip in the document.
    const chips = screen.getAllByTestId('pubkey-chip');
    expect(chips.length).toBeGreaterThan(0);
    expect(chips[0]?.getAttribute('data-pubkey')).toBe(authorPk);

    // Push two claims through the mocked subscribeClaimsFor.
    await act(async () => {
      mockClaimsState.setClaims(makeTwoClaims());
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('claim-row').length).toBe(2);
    });
    const rows = screen.getAllByTestId('claim-row');
    const claimerPubkeys = rows.map((r) => r.getAttribute('data-claimer'));
    expect(claimerPubkeys).toContain(claimerPkA);
    expect(claimerPubkeys).toContain(claimerPkB);
  });

  it("shows the I'll take it button to a non-author, non-claimer viewer", async () => {
    publishListing();
    setSignerForPubkey(outsiderPk);
    render(<ListingDetail listingRef={makeRef()} />);

    await waitFor(() => {
      expect(
        screen.getByText('Aged compost — pickup in High View'),
      ).toBeTruthy();
    });
    expect(
      screen.getByRole('button', { name: "I'll take it" }),
    ).toBeTruthy();
    // No "Mark fulfilled" button for a non-author.
    expect(
      screen.queryByRole('button', { name: 'Mark fulfilled' }),
    ).toBeNull();
  });

  it('hides the claim button for the author and shows Mark fulfilled, which reveals the review form', async () => {
    publishListing();
    setSignerForPubkey(authorPk);
    render(<ListingDetail listingRef={makeRef()} />);

    await waitFor(() => {
      expect(
        screen.getByText('Aged compost — pickup in High View'),
      ).toBeTruthy();
    });
    // Push the two claims so the author has someone to review.
    await act(async () => {
      mockClaimsState.setClaims(makeTwoClaims());
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('claim-row').length).toBe(2);
    });

    expect(
      screen.queryByRole('button', { name: "I'll take it" }),
    ).toBeNull();
    const fulfillBtn = screen.getByRole('button', { name: 'Mark fulfilled' });
    expect(fulfillBtn).toBeTruthy();

    // Review form should NOT be visible until fulfilled.
    expect(screen.queryByText(/Leave a review/i)).toBeNull();

    await userEvent.setup().click(fulfillBtn);

    await waitFor(() => {
      expect(screen.getByText(/Leave a review/i)).toBeTruthy();
    });
  });

  it('Mark fulfilled (author) calls fulfill() with the listing ref and reveals the review form', async () => {
    publishListing();
    setSignerForPubkey(authorPk);
    const user = userEvent.setup();
    render(<ListingDetail listingRef={makeRef()} />);

    await waitFor(() => {
      expect(
        screen.getByText('Aged compost — pickup in High View'),
      ).toBeTruthy();
    });
    await act(async () => {
      mockClaimsState.setClaims(makeTwoClaims());
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('claim-row').length).toBe(2);
    });

    expect(screen.queryByText(/Leave a review/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Mark fulfilled' }));

    await waitFor(() => {
      expect(mockClaimsState.fulfillSpy).toHaveBeenCalledTimes(1);
    });
    const [refArg] = mockClaimsState.fulfillSpy.mock.calls[0]!;
    expect(refArg).toEqual(makeRef());
    // Review form opens for the author optimistically.
    await waitFor(() => {
      expect(screen.getByText(/Leave a review/i)).toBeTruthy();
    });
  });

  it("claimer's review form opens automatically when an author-authored fulfillment marker arrives (cross-device coherence)", async () => {
    publishListing();
    // Render as the *claimer*, not the author.
    setSignerForPubkey(claimerPkA);
    render(<ListingDetail listingRef={makeRef()} />);

    await waitFor(() => {
      expect(
        screen.getByText('Aged compost — pickup in High View'),
      ).toBeTruthy();
    });

    // The claimer needs to appear in the claims list so the route treats
    // them as a participant (only participants see the review form).
    await act(async () => {
      mockClaimsState.setClaims(makeTwoClaims());
    });

    // No fulfillment yet → review form stays closed.
    expect(screen.queryByText(/Leave a review/i)).toBeNull();
    // Claimer also has no "Mark fulfilled" button (only the author does).
    expect(
      screen.queryByRole('button', { name: 'Mark fulfilled' }),
    ).toBeNull();

    // Author's marker arrives via the subscription — without the claimer
    // tapping anything, the review form should open on their device.
    await act(async () => {
      mockClaimsState.setFulfillments([
        {
          id: 'fulfill-1',
          createdAt: 1_700_003_000,
        },
      ]);
    });

    await waitFor(() => {
      expect(screen.getByText(/Leave a review/i)).toBeTruthy();
    });
  });

  it('a fulfillment marker authored by a non-listing pubkey is ignored upstream and the review form stays closed', async () => {
    // The lib's `subscribeFulfillmentFor` filters spoofed events at parse
    // time, so by the time it reaches this component the array would be
    // empty. We simulate that by simply not pushing the spoofed event.
    publishListing();
    setSignerForPubkey(claimerPkA);
    render(<ListingDetail listingRef={makeRef()} />);

    await waitFor(() => {
      expect(
        screen.getByText('Aged compost — pickup in High View'),
      ).toBeTruthy();
    });
    await act(async () => {
      mockClaimsState.setClaims(makeTwoClaims());
    });
    // The relay-side spoof guard means the lib emits an empty array even
    // though a malicious event was published. Push that empty emission.
    await act(async () => {
      mockClaimsState.setFulfillments([]);
    });

    expect(screen.queryByText(/Leave a review/i)).toBeNull();
  });

  it('submits a +1 review with the right args (target = oldest claimer, ref = listing)', async () => {
    publishListing();
    setSignerForPubkey(authorPk);
    const user = userEvent.setup();
    render(<ListingDetail listingRef={makeRef()} />);

    await waitFor(() => {
      expect(
        screen.getByText('Aged compost — pickup in High View'),
      ).toBeTruthy();
    });
    await act(async () => {
      mockClaimsState.setClaims(makeTwoClaims());
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('claim-row').length).toBe(2);
    });
    await user.click(screen.getByRole('button', { name: 'Mark fulfilled' }));

    await waitFor(() => {
      expect(screen.getByText(/Leave a review/i)).toBeTruthy();
    });

    // Pick +1 from the radio group.
    const group = screen.getByRole('radiogroup', { name: 'Score' });
    const plus = within(group).getByRole('radio', { name: '+1' });
    await user.click(plus);

    await user.click(screen.getByRole('button', { name: /Submit review/i }));

    await waitFor(() => {
      expect(reviewSpy).toHaveBeenCalledTimes(1);
    });
    const [arg] = reviewSpy.mock.calls[0]!;
    expect(arg).toMatchObject({
      target: claimerPkA,
      score: '+1',
      listingOrEvent: makeRef(),
    });
  });
});
