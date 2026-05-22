/**
 * SPEC-026 — Members admin route tests.
 *
 * Strategy:
 *   • localStorage shim (the auth zustand store uses `persist`).
 *   • Mock `@/lib/pyramid` so `listMembers` / `inviteByNpub` / `dropMember`
 *     return canned values; assert they were called with the right args.
 *   • Mock `PubkeyChip` to a dumb `<span>` to avoid spinning up an NDK
 *     subscription per row.
 *   • Mock `useAuthStore` indirectly via `setState` so the route's
 *     `signer.user()` resolves with a stable hex pubkey.
 *
 * No production patches were needed; the route accepts roster from
 * `listMembers()` and drives the invite Sheet from the "+ Invite" button.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
// Pyramid module mock — driven imperatively per test.
// ---------------------------------------------------------------------------
type Member = { pubkey: string; npub?: string; level?: number };
const pyramidState = vi.hoisted(() => ({
  members: [] as Member[],
  inviteCalls: [] as string[],
  dropCalls: [] as string[],
  inviteResult: { ok: true as boolean, error: 'forbidden' as string },
  dropResult: { ok: true as boolean, error: 'forbidden' as string },
}));

vi.mock('@/lib/pyramid', () => ({
  listMembers: vi.fn(async () => pyramidState.members),
  inviteByNpub: vi.fn(async (npub: string) => {
    pyramidState.inviteCalls.push(npub);
    return pyramidState.inviteResult.ok
      ? { ok: true, value: undefined }
      : { ok: false, error: pyramidState.inviteResult.error };
  }),
  dropMember: vi.fn(async (pubkey: string) => {
    pyramidState.dropCalls.push(pubkey);
    return pyramidState.dropResult.ok
      ? { ok: true, value: undefined }
      : { ok: false, error: pyramidState.dropResult.error };
  }),
  // Members.tsx calls useIsRoot() to decide whether the row's Drop button
  // is unconditionally visible. The existing tests don't drive root-only
  // gating (they assert the optimistic Drop on every row), so a stable
  // `false` is the right default.
  useIsRoot: () => false,
}));

// PubkeyChip → dumb span (avoids NDK profile subscription).
vi.mock('@/components/feed/PubkeyChip', () => ({
  PubkeyChip: ({ pubkey }: { pubkey: string }) => (
    <span data-testid="pubkey-chip">{pubkey}</span>
  ),
}));

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '@/lib/auth';
import { Members } from './Members';

const PK_A = 'a'.repeat(64);
const PK_B = 'b'.repeat(64);
const PK_C = 'c'.repeat(64);
const NPUB_A = 'npub1aaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NPUB_B = 'npub1bbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NPUB_C = 'npub1ccccccccccccccccccccccccccc';
const TARGET_NPUB =
  'npub1example0000000000000000000000000000000000000000000000000000';

const MY_PUBKEY = 'd'.repeat(64);

function setSigner(): void {
  const signer = { user: async () => ({ pubkey: MY_PUBKEY }) };
  useAuthStore.setState({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signer: signer as any,
    method: 'nsec-local',
    npub: 'npub1mock',
    status: 'ready',
  });
}

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  cleanup();
  pyramidState.members = [
    { pubkey: PK_A, npub: NPUB_A },
    { pubkey: PK_B, npub: NPUB_B },
    { pubkey: PK_C, npub: NPUB_C },
  ];
  pyramidState.inviteCalls = [];
  pyramidState.dropCalls = [];
  pyramidState.inviteResult = { ok: true, error: 'forbidden' };
  pyramidState.dropResult = { ok: true, error: 'forbidden' };
  useAuthStore.setState({
    method: null, signer: null, npub: null, status: 'idle', error: undefined,
  });
});

afterEach(() => { cleanup(); });

describe('SPEC-026 Members admin route', () => {
  it('renders one row per member with truncated npubs', async () => {
    setSigner();
    render(<Members />);
    await flushAsync();

    await waitFor(() => {
      expect(screen.getByLabelText('Members')).toBeTruthy();
    });

    const list = screen.getByLabelText('Members');
    const items = list.getElementsByTagName('li');
    expect(items.length).toBe(3);

    // Truncation is `<first 12>…<last 4>` for the npub.
    expect(screen.getByText(/npub1aaaaaaa…aaaa/)).toBeTruthy();
    expect(screen.getByText(/npub1bbbbbbb…bbbb/)).toBeTruthy();
    expect(screen.getByText(/npub1ccccccc…cccc/)).toBeTruthy();
  });

  it('narrows the list when the search Input matches a npub substring', async () => {
    setSigner();
    const user = userEvent.setup();
    render(<Members />);
    await flushAsync();
    await waitFor(() => {
      const list = screen.getByLabelText('Members');
      expect(list.getElementsByTagName('li').length).toBe(3);
    });

    const search = screen.getByLabelText('Search members');
    await user.type(search, 'aaaa');

    await waitFor(() => {
      const list = screen.getByLabelText('Members');
      expect(list.getElementsByTagName('li').length).toBe(1);
    });
    expect(screen.getByText(/npub1aaaaaaa…aaaa/)).toBeTruthy();
  });

  it('opens the invite Sheet, posts a paste npub, and calls inviteByNpub', async () => {
    setSigner();
    const user = userEvent.setup();
    render(<Members />);
    await flushAsync();

    // Click the floating "+ Invite" button to open the sheet.
    await user.click(screen.getByLabelText('Invite by npub'));

    const npubField = await screen.findByLabelText('Invitee npub');
    // userEvent.type loses keystrokes against the controlled Input here
    // (likely a Sheet focus-management interaction). fireEvent.change is
    // the standard escape hatch for controlled inputs in this codebase.
    fireEvent.change(npubField, { target: { value: TARGET_NPUB } });

    // Send button labelled "Send invite".
    await user.click(screen.getByRole('button', { name: 'Send invite' }));
    await flushAsync();

    expect(pyramidState.inviteCalls.length).toBeGreaterThanOrEqual(1);
    expect(pyramidState.inviteCalls[0]).toBe(TARGET_NPUB);
  });
});
