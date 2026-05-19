/**
 * SPEC-010 — onboarding flow tests.
 *
 * Drives the default "no extension, generate new key" path end-to-end and
 * asserts the 4-tap acceptance criterion lands on the "Open feed" final
 * step. Tap count from a fresh state to npub display:
 *   1. Continue with new key
 *   2. (focus passphrase input — no tap; typing is not a tap)
 *   3. Generate
 *   4. Got it (lands on location step)
 * Counting only Buttons pressed: "Continue with new key", "Generate" = 2
 * taps to reach the npub. Reaching the final "Open feed" Card happens after
 * 4 taps including "Got it" + "Skip for now".
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

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Onboarding } from './Onboarding';
import { _resetAuthForTests, useAuthStore } from '@/lib/auth';
import { useOnboardingStore } from '@/lib/onboarding';
import { useLocationStore } from '@/lib/location';
import { _clearForTests as clearNsec } from '@/lib/auth/nsecLocal';

beforeEach(async () => {
  memStore.clear();
  _resetAuthForTests();
  useOnboardingStore.setState({ completedAt: null });
  useLocationStore.setState({
    enabled: false,
    precision: 5,
    lat: undefined,
    lon: undefined,
    geohash: undefined,
  });
  await clearNsec();
  // Ensure window.nostr is absent so the extension button is disabled.
  delete (globalThis as { nostr?: unknown }).nostr;
});

afterEach(async () => {
  cleanup();
  await clearNsec();
});

describe('Onboarding', () => {
  it('renders step 1 with the chapter badge and the three method buttons', () => {
    render(<Onboarding />);
    expect(screen.getByText(/Powder Keg WV/i)).toBeTruthy();
    expect(screen.getByText(/Pick how you sign in/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Continue with new key/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Continue with extension/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Use a remote signer/i })).toBeTruthy();
  });

  it('disables the extension button when window.nostr is absent', () => {
    render(<Onboarding />);
    const btn = screen.getByRole('button', {
      name: /Continue with extension/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('default path: new key → passphrase → npub → skip location → open feed', { timeout: 60000 }, async () => {
    const user = userEvent.setup();
    render(<Onboarding />);

    // Tap 1: Continue with new key
    await user.click(screen.getByRole('button', { name: /Continue with new key/i }));

    // Step 2 visible
    await waitFor(() => {
      expect(screen.getByText(/Set a passphrase/i)).toBeTruthy();
    });

    // Use exact label matches to avoid /passphrase/i grabbing both fields.
    const pwInput = screen.getByLabelText('Passphrase') as HTMLInputElement;
    const confirmInput = screen.getByLabelText('Confirm passphrase') as HTMLInputElement;
    await user.type(pwInput, 'a-strong-pass');
    await user.type(confirmInput, 'a-strong-pass');

    // Sanity: did React register the values?
    if (pwInput.value !== 'a-strong-pass' || confirmInput.value !== 'a-strong-pass') {
      throw new Error(
        `Inputs not populated: pw='${pwInput.value}', confirm='${confirmInput.value}'`,
      );
    }

    // Wait for the Generate button to become enabled (state propagates async).
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /^Generate$/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    // Tap 2: Generate
    await user.click(screen.getByRole('button', { name: /^Generate$/i }));

    // Confirm the orchestrator transitioned out of idle.
    await waitFor(
      () => {
        const state = useAuthStore.getState();
        expect(state.status === 'connecting' || state.status === 'ready').toBe(true);
      },
      { timeout: 5000 },
    );

    // Wait for npub card (PBKDF2 100k iters in happy-dom can be slow).
    await waitFor(
      () => {
        const state = useAuthStore.getState();
        if (state.status === 'error') {
          throw new Error(`auth status=error: ${state.error?.kind} ${state.error?.message}`);
        }
        expect(screen.getByText(/Your new key is ready/i)).toBeTruthy();
      },
      { timeout: 30000 },
    );
    // npub text is rendered as a code-style block; look for npub1 prefix.
    expect(screen.getByText(/npub1/)).toBeTruthy();

    // Tap 3: Got it
    await user.click(screen.getByRole('button', { name: /Got it/i }));

    await waitFor(() => {
      expect(screen.getByText(/Find nearby compost\?/i)).toBeTruthy();
    });

    // Tap 4: Skip for now
    await user.click(screen.getByRole('button', { name: /Skip for now/i }));

    // Final step visible with Open feed
    await waitFor(() => {
      expect(screen.getByText(/Welcome to Powder Keg/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /Open feed/i })).toBeTruthy();
    });

    // Onboarding not yet complete until user taps Open feed.
    expect(useOnboardingStore.getState().completedAt).toBeNull();

    await user.click(screen.getByRole('button', { name: /Open feed/i }));

    await waitFor(() => {
      expect(useOnboardingStore.getState().completedAt).not.toBeNull();
    });
    expect(typeof useOnboardingStore.getState().completedAt).toBe('number');
  });

  it('refuses to advance from step 2 when passphrases mismatch', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await user.click(screen.getByRole('button', { name: /Continue with new key/i }));

    await waitFor(() => {
      expect(screen.getByText(/Set a passphrase/i)).toBeTruthy();
    });
    const pwInput = screen.getByLabelText('Passphrase') as HTMLInputElement;
    const confirmInput = screen.getByLabelText('Confirm passphrase') as HTMLInputElement;
    await user.type(pwInput, 'a-strong-pass');
    await user.type(confirmInput, 'mismatched-pass');

    const btn = screen.getByRole('button', {
      name: /^Generate$/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
