/**
 * SPEC-021 — NewPile route tests.
 *
 * Mocks NDK with the same in-memory mock-relay pattern used by NewListing /
 * Calendar tests. Mocks `scheduleNotificationsForPile` so the notifications
 * subsystem doesn't reach into Tauri. Membership/publish-guard are stubbed
 * to `'allowed'` / no-op so the publish flow runs end-to-end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';

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
type Filter = { kinds?: number[]; authors?: string[]; '#d'?: string[]; '#t'?: string[] };
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
        if (sub.filter.kinds && e.kind !== undefined && !sub.filter.kinds.includes(e.kind))
          continue;
        if (sub.filter.authors && e.pubkey && !sub.filter.authors.includes(e.pubkey))
          continue;
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
        if (sub.filter.kinds && e.kind !== undefined && !sub.filter.kinds.includes(e.kind))
          continue;
        if (sub.filter.authors && e.pubkey && !sub.filter.authors.includes(e.pubkey))
          continue;
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

vi.mock('@/lib/ndk', () => ({
  getNdk: () => mockState,
  currentRelay: () => 'wss://mock.example',
  setRelayToast: () => {},
  addRelay: () => {},
}));

const scheduleSpy = vi.hoisted(() => vi.fn(async (_p: unknown) => {}));
vi.mock('@/lib/notifications', () => ({
  scheduleNotificationsForPile: scheduleSpy,
}));

vi.mock('@/lib/pyramid', () => ({
  useMembershipStatus: (_pk: string) => 'allowed',
  usePublishGuard: () => ({
    blocked: false,
    guard: async <T,>(fn: () => Promise<T>): Promise<T | null> => fn(),
  }),
}));

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { NewPile } from './NewPile';
import { useAuthStore } from '@/lib/auth';

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++)
    s += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  return s;
}

beforeEach(() => {
  memStore.clear();
  resetRelay();
  scheduleSpy.mockClear();
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
});

afterEach(() => {
  cleanup();
});

describe('SPEC-021 NewPile', () => {
  it(
    'publishes one kind-30078 + six kind-31923 turn events for a Commercial pile and schedules notifications',
    { timeout: 20000 },
    async () => {
      const user = userEvent.setup();
      render(<NewPile />);

      // Step 1: pick Commercial preset.
      await user.click(screen.getByRole('radio', { name: /Commercial/ }));

      // Verify staffing preview shows the build crew. The math for a 6×6×6
      // (216 m³) pile gives:
      //   - build: ceil(216 / 2) = 108 volunteers, 2h
      //   - turn:  ceil(216 / 4) = 54 volunteers, 1.5h
      // We assert the turn-crew line specifically because that's what the
      // 6 calendar events carry forward.
      await waitFor(() => {
        const cells = screen.getAllByTestId('staffing-turn');
        expect(cells.some((c) => /54 volunteers/.test(c.textContent ?? ''))).toBe(true);
      });

      // Advance: preset → location (size step is hidden for non-custom).
      await user.click(screen.getByRole('button', { name: 'Next' }));
      // Location → schedule.
      await user.click(screen.getByRole('button', { name: 'Next' }));

      // Step 4: name + planned date.
      await user.type(
        screen.getByLabelText(/Pile name/) as HTMLInputElement,
        'Acceptance Build',
      );
      // 60 days in the future to stay safely outside any "past" guard.
      const future = new Date(Date.now() + 60 * 86400 * 1000);
      const yyyy = future.getFullYear();
      const mm = String(future.getMonth() + 1).padStart(2, '0');
      const dd = String(future.getDate()).padStart(2, '0');
      const dateInput = screen.getByLabelText(/Planned build date/) as HTMLInputElement;
      // userEvent.type fires keystrokes; date inputs accept fireEvent or
      // direct value via change. Use fireEvent through user-event's helper.
      await user.clear(dateInput);
      // Use evt setter — userEvent.type on date inputs is flaky in jsdom.
      // Set via fireEvent instead.
      const { fireEvent } = await import('@testing-library/react');
      fireEvent.change(dateInput, { target: { value: `${yyyy}-${mm}-${dd}` } });

      // Schedule → preview.
      await user.click(screen.getByRole('button', { name: 'Next' }));

      // Submit.
      const publishBtn = screen.getByRole('button', {
        name: /Create pile \+ publish turn schedule/,
      });
      await waitFor(() => {
        expect((publishBtn as HTMLButtonElement).disabled).toBe(false);
      });
      await user.click(publishBtn);

      await waitFor(
        () => {
          const pileEv = mockState.events.find((e) => e.kind === 30078);
          if (!pileEv) throw new Error('no kind-30078 yet');
          const turnEvs = mockState.events.filter((e) => e.kind === 31923);
          if (turnEvs.length !== 6) throw new Error(`expected 6 turn events, got ${turnEvs.length}`);
        },
        { timeout: 15000 },
      );

      const pileEv = mockState.events.find((e) => e.kind === 30078);
      expect(pileEv).toBeTruthy();
      const tagPairs = (pileEv?.tags ?? []).map((t) => t.join(':'));
      expect(tagPairs).toContain('t:pile');

      const dTag = pileEv?.tags.find((t) => t[0] === 'd')?.[1];
      expect(dTag).toBeTruthy();

      const turnEvs = mockState.events.filter((e) => e.kind === 31923);
      expect(turnEvs).toHaveLength(6);
      const expectedRef = `30078:${pileEv?.pubkey}:${dTag}`;
      for (const tev of turnEvs) {
        const aTags = tev.tags.filter((t) => t[0] === 'a').map((t) => t[1]);
        expect(aTags).toContain(expectedRef);
        // turn-index tag is set to 1..6.
        const turnIdx = tev.tags.find((t) => t[0] === 'turn_index')?.[1];
        expect(turnIdx).toBeTruthy();
        // min_volunteers should reflect the turn staffing for 216 m³ → 54.
        const minV = tev.tags.find((t) => t[0] === 'min_volunteers')?.[1];
        expect(minV).toBe('54');
      }

      // scheduleNotificationsForPile invoked once with the assembled pile.
      await waitFor(() => {
        expect(scheduleSpy).toHaveBeenCalledTimes(1);
      });
      const [pileArg] = scheduleSpy.mock.calls[0]!;
      const arg = pileArg as { d: string; name: string; dimensions: { length: number; width: number; height: number } };
      expect(arg.d).toBe(dTag);
      expect(arg.name).toBe('Acceptance Build');
      expect(arg.dimensions).toEqual({ length: 6, width: 6, height: 6 });
    },
  );
});
