/**
 * SPEC-030 — App router + onboarding gate tests.
 *
 * Uses `<AppForTest>` (a wrapper that swaps `<HashRouter>` for
 * `<MemoryRouter>` so each test can pick its own initial path).
 *
 * NDK is mocked to return a no-op subscriber so route components that open
 * subscriptions (`Feed`, `Map`, etc.) don't blow up under happy-dom.
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

// Stub NDK with a tiny no-op subscriber so route mounts don't fail.
vi.mock('@/lib/ndk', () => {
  const subscribe = (): { stop: () => void; on: () => void } => ({
    stop: () => {},
    on: () => {},
  });
  return {
    getNdk: () => ({ subscribe }),
    currentRelay: () => 'wss://mock.example',
    setRelayToast: () => {},
    addRelay: () => {},
  };
});

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AppForTest } from './App';
import { useOnboardingStore } from '@/lib/onboarding';
import { useAuthStore } from '@/lib/auth';
import { CRASH_REPORT_STORAGE_KEY } from '@/lib/crashReports';
import {
  CRASH_REPORT_VERSION,
  type CrashReport,
} from '@/domain/crashReports';
import type { NDKSigner } from '@nostr-dev-kit/ndk';

function makeQueuedReport(): CrashReport {
  return {
    version: CRASH_REPORT_VERSION,
    ts: 4242,
    app_version: 'test',
    commit_sha: 'test',
    platform: 'test',
    error_name: 'Error',
    error_message: 'queued-boom',
    stack: '',
  };
}

/**
 * Bare-minimum stub matching `NDKSigner`'s required surface for the
 * AuthStore — `signer != null` is all the App.tsx prompt gate checks.
 */
function makeStubSigner(): NDKSigner {
  return {
    user: async () => ({ pubkey: 'a'.repeat(64), npub: 'npub1stub' }),
    encrypt: async () => '',
    decrypt: async () => '',
    blockUntilReady: async () => ({}),
  } as unknown as NDKSigner;
}

beforeEach(() => {
  memStore.clear();
  useAuthStore.setState({ signer: null, status: 'idle' });
});

afterEach(() => {
  cleanup();
});

describe('App router', () => {
  it('renders the onboarding screen when completedAt is null', () => {
    useOnboardingStore.setState({ completedAt: null });
    render(<AppForTest />);
    // Onboarding step 1 has the "Pick how you sign in" copy.
    expect(screen.getByText(/Pick how you sign in/i)).toBeTruthy();
  });

  it('renders the Feed at "/" once onboarding is complete', async () => {
    useOnboardingStore.setState({ completedAt: 1234567890 });
    render(<AppForTest initialEntries={['/']} />);
    // Feed renders the kind chip radiogroup.
    await waitFor(() => {
      expect(screen.getByRole('radiogroup', { name: /Kind/i })).toBeTruthy();
    });
    // Bottom nav should be visible (Feed is not full-viewport).
    expect(screen.getByRole('navigation', { name: /Primary/i })).toBeTruthy();
  });

  it('routes /settings to the Settings screen with the bottom nav visible', async () => {
    useOnboardingStore.setState({ completedAt: 1234567890 });
    render(<AppForTest initialEntries={['/settings']} />);
    await waitFor(() => {
      // Settings header copy.
      expect(screen.getByRole('heading', { name: /Settings/i })).toBeTruthy();
    });
    expect(screen.getByRole('navigation', { name: /Primary/i })).toBeTruthy();
  });

  it('hides the bottom nav on full-viewport routes (/listings/new)', async () => {
    useOnboardingStore.setState({ completedAt: 1234567890 });
    render(<AppForTest initialEntries={['/listings/new']} />);
    // NewListing renders the "New listing" header.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /New listing/i })).toBeTruthy();
    });
    expect(screen.queryByRole('navigation', { name: /Primary/i })).toBeNull();
  });

  it('redirects malformed listing detail URLs back to "/"', async () => {
    useOnboardingStore.setState({ completedAt: 1234567890 });
    render(<AppForTest initialEntries={['/listings/not-hex/some-d']} />);
    // After the redirect we should land on Feed.
    await waitFor(() => {
      expect(screen.getByRole('radiogroup', { name: /Kind/i })).toBeTruthy();
    });
  });

  it('renders the crash-report prompt when a report is queued AND a signer is set', async () => {
    useOnboardingStore.setState({ completedAt: 1234567890 });
    localStorage.setItem(
      CRASH_REPORT_STORAGE_KEY,
      JSON.stringify([makeQueuedReport()]),
    );
    useAuthStore.setState({
      signer: makeStubSigner(),
      status: 'ready',
    });

    render(<AppForTest initialEntries={['/']} />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Crash report ready to send/i }),
      ).toBeTruthy();
    });
    // Payload preview is in the dialog.
    expect(screen.getByLabelText('Crash report payload').textContent).toContain(
      'queued-boom',
    );
  });

  it('does not render the crash-report prompt when no signer is set', async () => {
    useOnboardingStore.setState({ completedAt: 1234567890 });
    localStorage.setItem(
      CRASH_REPORT_STORAGE_KEY,
      JSON.stringify([makeQueuedReport()]),
    );
    useAuthStore.setState({ signer: null, status: 'idle' });

    render(<AppForTest initialEntries={['/']} />);
    // Feed should mount as usual.
    await waitFor(() => {
      expect(screen.getByRole('radiogroup', { name: /Kind/i })).toBeTruthy();
    });
    expect(
      screen.queryByRole('heading', { name: /Crash report ready to send/i }),
    ).toBeNull();
  });
});
