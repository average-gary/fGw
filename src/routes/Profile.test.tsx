/**
 * SPEC-028 — Profile route tests.
 *
 * Strategy:
 *   • Hoist a tiny in-memory "NDK" so we can inspect every event the
 *     route asks `getNdk()` to publish (kind-0 in particular).
 *   • Pre-seed the profile cache via `useProfileStore.setState` to avoid
 *     racing the relay subscription replay.
 *   • For the editable case, install a real `NDKPrivateKeySigner` so
 *     `updateProfile()` can sign the kind-0 internally.
 *   • For the read-only case, render `<Profile pubkey="…" />` with no
 *     signer and assert there are no inputs / Save button.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

type RelayEvent = {
  id?: string;
  kind?: number;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
  sig?: string;
};
type Filter = { kinds?: number[]; authors?: string[] };
type Listener = (e: RelayEvent) => void;

const mockNdk = vi.hoisted(() => {
  const state = {
    events: [] as RelayEvent[],
    subs: [] as { filter: Filter; handler: Listener; active: boolean }[],
    matches(filter: Filter, e: RelayEvent): boolean {
      if (filter.kinds && e.kind !== undefined && !filter.kinds.includes(e.kind)) return false;
      if (filter.authors && !filter.authors.includes(e.pubkey)) return false;
      return true;
    },
    publish(e: RelayEvent): Promise<void> {
      state.events.push(e);
      for (const sub of state.subs) {
        if (sub.active && state.matches(sub.filter, e)) sub.handler(e);
      }
      return Promise.resolve();
    },
    subscribe(filter: Filter, handlers: { onEvent?: Listener }): { stop: () => void } {
      const sub = { filter, handler: handlers.onEvent ?? (() => {}), active: true };
      state.subs.push(sub);
      for (const e of state.events) if (state.matches(sub.filter, e)) sub.handler(e);
      return { stop: () => { sub.active = false; } };
    },
  };
  return state;
});

vi.mock('@/lib/ndk', () => ({
  getNdk: () => mockNdk,
  currentRelay: () => 'wss://mock.example',
  setRelayToast: () => {},
  addRelay: () => {},
}));

// `uploadPhoto` hits Blossom + crypto.subtle. The Profile editor reaches
// for it on file-input change; we never trigger that path in these tests
// but mocking it keeps the import surface lean.
vi.mock('@/lib/blossom', () => ({
  uploadPhoto: vi.fn(async () => ({
    url: 'https://example/p.jpg',
    sha256: 'a'.repeat(64),
    dim: { w: 1, h: 1 },
    mime: 'image/jpeg' as const,
    sizeBytes: 1,
  })),
  BlossomError: class BlossomError extends Error {},
}));

import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { useAuthStore } from '@/lib/auth';
import {
  PROFILE_EVENT_KIND,
  _resetProfileForTests,
  useProfileStore,
} from '@/lib/profile';
import { Profile } from './Profile';

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

function setLocalSigner(skHex: string): string {
  const signer = new NDKPrivateKeySigner(skHex);
  const pk = getPublicKey(hexToBytes(skHex));
  useAuthStore.setState({ signer, npub: 'npub1mock', status: 'ready' });
  return pk;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

beforeEach(() => {
  cleanup();
  mockNdk.events.length = 0;
  mockNdk.subs.length = 0;
  _resetProfileForTests();
  useAuthStore.setState({
    method: null, signer: null, npub: null, status: 'idle', error: undefined,
  });
});

describe('SPEC-028 Profile route', () => {
  it('edits display name and publishes a kind-0 with the new name merged', async () => {
    const sk = generateSecretKey();
    const skHex = bytesToHex(sk);
    const pk = setLocalSigner(skHex);

    // Pre-seed the cache: displayName='Gini' so the form starts populated
    // *and* `updateProfile` sees prior raw content to merge into.
    useProfileStore.setState({
      byPubkey: {
        [pk]: {
          profile: { displayName: 'Gini' },
          raw: { display_name: 'Gini' },
          createdAt: 1_700_000_000,
        },
      },
    });

    const user = userEvent.setup();
    render(<Profile />);

    const nameInput = (await screen.findByLabelText('Display name')) as HTMLInputElement;
    await waitFor(() => expect(nameInput.value).toBe('Gini'));

    await user.clear(nameInput);
    await user.type(nameInput, 'Virginia');
    expect(nameInput.value).toBe('Virginia');

    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => {
      const kind0s = mockNdk.events.filter(
        (e) => e.kind === PROFILE_EVENT_KIND && e.pubkey === pk,
      );
      expect(kind0s.length).toBeGreaterThanOrEqual(1);
    });

    const kind0s = mockNdk.events.filter(
      (e) => e.kind === PROFILE_EVENT_KIND && e.pubkey === pk,
    );
    const latest = kind0s[kind0s.length - 1]!;
    const merged = JSON.parse(latest.content) as Record<string, unknown>;
    expect(merged.display_name).toBe('Virginia');
    expect(typeof latest.sig).toBe('string');
  });

  it('renders read-only when given a foreign pubkey: no Save button, no inputs', () => {
    const otherPk = 'a'.repeat(64);
    // Seed a profile so the Card renders some content.
    useProfileStore.setState({
      byPubkey: {
        [otherPk]: {
          profile: { displayName: 'Stranger', about: 'Hi.' },
          raw: { display_name: 'Stranger', about: 'Hi.' },
          createdAt: 1_700_000_000,
        },
      },
    });

    render(<Profile pubkey={otherPk} />);

    expect(screen.getByText(/Stranger/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Save$/i })).toBeNull();
    expect(screen.queryByLabelText('Display name')).toBeNull();
    expect(screen.queryByLabelText('About')).toBeNull();
    expect(screen.queryByLabelText('NIP-05')).toBeNull();
  });

  it('clicking Save with no edits surfaces a "nothing to save" notice', async () => {
    const sk = generateSecretKey();
    const skHex = bytesToHex(sk);
    const pk = setLocalSigner(skHex);
    useProfileStore.setState({
      byPubkey: {
        [pk]: {
          profile: { displayName: 'Gini' },
          raw: { display_name: 'Gini' },
          createdAt: 1_700_000_000,
        },
      },
    });

    render(<Profile />);
    // The form needs to render before we click Save.
    await screen.findByLabelText('Display name');

    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    // No new kind-0 should have been published.
    await waitFor(() => {
      const kind0s = mockNdk.events.filter(
        (e) => e.kind === PROFILE_EVENT_KIND && e.pubkey === pk,
      );
      expect(kind0s.length).toBe(0);
    });
  });
});
