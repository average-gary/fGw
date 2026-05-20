/**
 * SPEC-026 — RequestInvite admin route tests.
 *
 * Strategy:
 *   • localStorage shim (the auth zustand store uses `persist`).
 *   • Mock `@/lib/pyramid` (`listMembers`) and `@/lib/dm` (`sendDm`).
 *   • PubkeyChip → dumb span.
 *   • Set the auth store npub directly so the route's "Your npub" field
 *     and the message body have something to render.
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

type Member = { pubkey: string; npub?: string; level?: number };
const state = vi.hoisted(() => ({
  members: [] as Member[],
  dmCalls: [] as { to: string; content: string }[],
  dmThrows: false,
}));

vi.mock('@/lib/pyramid', () => ({
  listMembers: vi.fn(async () => state.members),
}));

vi.mock('@/lib/dm', () => ({
  sendDm: vi.fn(async (to: string, content: string) => {
    if (state.dmThrows) throw new Error('boom');
    state.dmCalls.push({ to, content });
  }),
}));

vi.mock('@/components/feed/PubkeyChip', () => ({
  PubkeyChip: ({ pubkey }: { pubkey: string }) => (
    <span data-testid="pubkey-chip">{pubkey}</span>
  ),
}));

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '@/lib/auth';
import { RequestInvite } from './RequestInvite';

const PK_A = 'a'.repeat(64);
const PK_B = 'b'.repeat(64);
const NPUB_A = 'npub1aaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NPUB_B = 'npub1bbbbbbbbbbbbbbbbbbbbbbbbbbb';
const MY_NPUB =
  'npub1myrequester0000000000000000000000000000000000000000000000';

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  cleanup();
  state.members = [
    { pubkey: PK_A, npub: NPUB_A },
    { pubkey: PK_B, npub: NPUB_B },
  ];
  state.dmCalls = [];
  state.dmThrows = false;
  useAuthStore.setState({
    method: 'nsec-local',
    // signer not needed: route reads `npub` from store directly.
    signer: null,
    npub: MY_NPUB,
    status: 'ready',
    error: undefined,
  });
});

afterEach(() => { cleanup(); });

describe('SPEC-026 RequestInvite admin route', () => {
  it('sends a DM to the picked member with the user npub + note', async () => {
    const user = userEvent.setup();
    render(<RequestInvite />);
    await flushAsync();

    // Wait for roster to render.
    await waitFor(() => {
      expect(screen.getByLabelText('Members')).toBeTruthy();
    });

    // The "Your npub" Input is read-only and pre-populated.
    const myNpubField = screen.getByLabelText('Your npub') as HTMLInputElement;
    expect(myNpubField.value).toBe(MY_NPUB);

    // Pick the first member (PK_A → button labelled `Pick aaaaaaaa`).
    await user.click(screen.getByLabelText(`Pick ${PK_A.slice(0, 8)}`));

    // Type a note.
    const note = screen.getByLabelText('Note');
    await user.type(note, "I'm a Powder Keg CSA member");

    // Submit. The button label includes `to 1`.
    const submit = screen.getByRole('button', { name: /Send request to 1/ });
    await user.click(submit);
    await flushAsync();

    expect(state.dmCalls.length).toBe(1);
    expect(state.dmCalls[0]?.to).toBe(PK_A);
    const content = state.dmCalls[0]?.content ?? '';
    expect(content).toContain(MY_NPUB);
    expect(content).toContain("I'm a Powder Keg CSA member");
    expect(content).toContain(`compostmkt://invite-request?npub=${MY_NPUB}`);
  });
});
