/**
 * SPEC-024 — Settings route tests.
 *
 * Three acceptance checks:
 *   1. Default render shows "Powder Keg WV" + DEFAULT_RELAY.
 *   2. After `setCurrentRelay('wss://other.example')` the chapter name
 *      flips to "Custom relay" and the URL re-renders.
 *   3. Clicking "Reset to default chapter" restores DEFAULT_RELAY.
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

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DEFAULT_RELAY,
  setCurrentRelay,
  resetToDefault,
  useChapterStore,
} from '@/lib/chapter';
import { ToastProvider } from '@/components/ui/Toast';
import { Settings } from './Settings';

beforeEach(() => {
  // Make sure every test starts on the default chapter.
  useChapterStore.setState({ currentRelay: DEFAULT_RELAY });
});

afterEach(() => {
  cleanup();
  resetToDefault();
});

function renderSettings() {
  return render(
    <ToastProvider>
      <Settings />
    </ToastProvider>,
  );
}

describe('SPEC-024 Settings route', () => {
  it('renders Powder Keg WV with the default relay URL', () => {
    renderSettings();
    expect(screen.getByText('Powder Keg WV')).toBeTruthy();
    const url = screen.getByLabelText('Current relay URL');
    expect(url.textContent).toBe(DEFAULT_RELAY);
  });

  it('renders "Custom relay" + new URL after setCurrentRelay', () => {
    setCurrentRelay('wss://other.example');
    renderSettings();
    expect(screen.getByText('Custom relay')).toBeTruthy();
    expect(screen.getByLabelText('Current relay URL').textContent).toBe(
      'wss://other.example',
    );
    // Reset button should now be enabled.
    const reset = screen.getByRole('button', { name: /Reset to default chapter/i });
    expect((reset as HTMLButtonElement).disabled).toBe(false);
  });

  it('Reset button restores DEFAULT_RELAY', async () => {
    setCurrentRelay('wss://other.example');
    renderSettings();
    expect(useChapterStore.getState().currentRelay).toBe('wss://other.example');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Reset to default chapter/i }));

    expect(useChapterStore.getState().currentRelay).toBe(DEFAULT_RELAY);
    // Confirm UI updates.
    expect(screen.getByText('Powder Keg WV')).toBeTruthy();
    expect(screen.getByLabelText('Current relay URL').textContent).toBe(DEFAULT_RELAY);
  });

  it('disables Reset button on the default chapter', () => {
    renderSettings();
    const reset = screen.getByRole('button', { name: /Reset to default chapter/i });
    expect((reset as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the Blossom server URL derived from the relay', () => {
    renderSettings();
    const blossom = screen.getByLabelText('Blossom server URL');
    // DEFAULT_RELAY is wss://chat.virginiafreedom.tech, so https://...
    expect(blossom.textContent).toMatch(/^https:\/\//);
    expect(blossom.textContent).toContain('chat.virginiafreedom.tech');
  });
});
