/**
 * SPEC-019 — New listing route tests.
 *
 * Mocks NDK with the in-memory mock-relay pattern (see `dm.test.ts`).
 * Mocks `uploadPhoto` so the test runner doesn't hit the network.
 * Mocks `useMembershipStatus` to flip between `'allowed'` and `'not-listed'`.
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
// In-memory mock relay.
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
type Filter = { kinds?: number[]; authors?: string[]; '#p'?: string[]; '#t'?: string[] };
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
        if (sub.filter.kinds && e.kind !== undefined && !sub.filter.kinds.includes(e.kind)) {
          continue;
        }
        if (sub.filter.authors && e.pubkey && !sub.filter.authors.includes(e.pubkey)) {
          continue;
        }
        sub.handler(e);
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
      for (const e of state.events) {
        if (sub.filter.kinds && e.kind !== undefined && !sub.filter.kinds.includes(e.kind)) {
          continue;
        }
        if (sub.filter.authors && e.pubkey && !sub.filter.authors.includes(e.pubkey)) {
          continue;
        }
        sub.handler(e);
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
// Mock NDK: getNdk returns the relay shape directly.
// ---------------------------------------------------------------------------
vi.mock('@/lib/ndk', () => ({
  getNdk: () => mockState,
  currentRelay: () => 'wss://mock.example',
  setRelayToast: () => {},
  addRelay: () => {},
}));

// ---------------------------------------------------------------------------
// Mock blossom uploadPhoto.
// ---------------------------------------------------------------------------
vi.mock('@/lib/blossom', () => ({
  uploadPhoto: vi.fn(async (_file: File) => ({
    url: 'https://blossom.mock/aaaa.jpg',
    sha256: 'a'.repeat(64),
    dim: { w: 800, h: 600 },
    mime: 'image/jpeg',
    sizeBytes: 1234,
  })),
  relayHttpsBase: () => 'https://mock.example',
  currentBlossomBase: () => 'https://mock.example',
  imetaTag: (_p: unknown) => ['imeta'],
}));

// ---------------------------------------------------------------------------
// Mock notifications so we don't reach into Tauri.
// ---------------------------------------------------------------------------
vi.mock('@/lib/notifications', () => ({
  scheduleNotificationsForListing: vi.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Mock pyramid: stub useMembershipStatus + usePublishGuard.
// ---------------------------------------------------------------------------
const membershipState = vi.hoisted(() => ({
  status: 'allowed' as 'allowed' | 'not-listed' | 'unknown' | 'banned',
}));
vi.mock('@/lib/pyramid', () => ({
  useMembershipStatus: (_pk: string) => membershipState.status,
  usePublishGuard: () => ({
    blocked: false,
    guard: async <T,>(fn: () => Promise<T>): Promise<T | null> => fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Now the imports under test.
// ---------------------------------------------------------------------------
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { NewListing } from './NewListing';
import { useAuthStore } from '@/lib/auth';
import { LISTING_EVENT_KIND } from '@/lib/listings/types';

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++)
    s += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  return s;
}

beforeEach(() => {
  memStore.clear();
  resetRelay();
  membershipState.status = 'allowed';
  // Seed an authenticated signer so submit can proceed.
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const signer = new NDKPrivateKeySigner(bytesToHex(sk));
  useAuthStore.setState({
    method: 'nsec-local',
    signer,
    npub: pk, // not used for authorisation here
    status: 'ready',
    error: undefined,
  });
});

afterEach(() => {
  cleanup();
});

describe('SPEC-019 NewListing', () => {
  it(
    'publishes a kind-30402 event with t:compost-need and t:material:manure-fresh',
    { timeout: 20000 },
    async () => {
      const user = userEvent.setup();
      render(<NewListing />);

      // Default kind is `need`.
      expect(screen.getByRole('heading', { name: /New listing/i })).toBeTruthy();

      await user.selectOptions(
        screen.getByLabelText(/^Material/) as HTMLSelectElement,
        'manure-fresh',
      );
      await user.type(
        screen.getByLabelText(/^Title/) as HTMLInputElement,
        'Need fresh manure',
      );
      await user.type(
        screen.getByLabelText(/^Description/) as HTMLTextAreaElement,
        'Hauling for spring builds — any volume welcome.',
      );

      // Wait for submit to enable.
      await waitFor(() => {
        const btn = screen.getByRole('button', {
          name: /Publish listing/i,
        }) as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
      });

      await user.click(screen.getByRole('button', { name: /Publish listing/i }));

      await waitFor(
        () => {
          const ev = mockState.events.find((e) => e.kind === LISTING_EVENT_KIND);
          if (!ev) throw new Error('no kind-30402 published yet');
        },
        { timeout: 10000 },
      );

      const ev = mockState.events.find((e) => e.kind === LISTING_EVENT_KIND);
      expect(ev).toBeTruthy();
      const tagPairs = (ev?.tags ?? []).map((t) => t.join(':'));
      expect(tagPairs).toContain('t:compost-need');
      expect(tagPairs).toContain('t:material:manure-fresh');
      // Title round-trips through the `title` tag.
      expect(ev?.tags.find((t) => t[0] === 'title')?.[1]).toBe('Need fresh manure');
    },
  );

  it('renders read-only with a not-a-member banner when membership is not-listed', async () => {
    membershipState.status = 'not-listed';
    render(<NewListing />);

    // Banner copy is present.
    await waitFor(() => {
      expect(
        screen.getByText(/not a member of Powder Keg WV/i),
      ).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /Request invite/i })).toBeTruthy();

    // Form fieldset is disabled — title input lives inside it.
    const titleInput = screen.getByLabelText(/^Title/) as HTMLInputElement;
    const fieldset = titleInput.closest('fieldset') as HTMLFieldSetElement | null;
    expect(fieldset).toBeTruthy();
    expect(fieldset?.disabled).toBe(true);

    // Submit button is disabled.
    const submitBtn = screen.getByRole('button', {
      name: /Publish listing/i,
    }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });
});
