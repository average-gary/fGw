/**
 * SPEC-024 — ChapterSwitch route tests.
 *
 * Switch is gated by:
 *   • chapter-name confirmation input must equal the current chapter name
 *     ("Powder Keg WV" by default), AND
 *   • URL input must parse as a `wss://` / `ws://` URL.
 *
 * Tests cover all four states: empty, wrong-name, valid-name + invalid URL,
 * and the happy path.
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
  resetToDefault,
  useChapterStore,
} from '@/lib/chapter';
import { ToastProvider } from '@/components/ui/Toast';
import { ChapterSwitch } from './ChapterSwitch';

beforeEach(() => {
  useChapterStore.setState({ currentRelay: DEFAULT_RELAY });
});

afterEach(() => {
  cleanup();
  resetToDefault();
});

function renderChapterSwitch(props: Parameters<typeof ChapterSwitch>[0] = {}) {
  return render(
    <ToastProvider>
      <ChapterSwitch {...props} />
    </ToastProvider>,
  );
}

function getSwitch(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Switch' }) as HTMLButtonElement;
}

describe('SPEC-024 ChapterSwitch route', () => {
  it('Switch button is disabled on initial render', () => {
    renderChapterSwitch();
    expect(getSwitch().disabled).toBe(true);
  });

  it('typing the wrong chapter name keeps Switch disabled', async () => {
    const user = userEvent.setup();
    renderChapterSwitch();
    const nameInput = screen.getByLabelText('Type "Powder Keg WV"');
    await user.type(nameInput, 'Some Other Chapter');
    expect(getSwitch().disabled).toBe(true);
  });

  it('correct name + invalid URL keeps Switch disabled and shows an error', async () => {
    const user = userEvent.setup();
    renderChapterSwitch();
    const nameInput = screen.getByLabelText('Type "Powder Keg WV"');
    await user.type(nameInput, 'Powder Keg WV');
    const urlInput = screen.getByLabelText('Relay URL');
    await user.type(urlInput, 'http://x');
    expect(getSwitch().disabled).toBe(true);
    expect(screen.getByText(/Must be a wss:\/\/ or ws:\/\//)).toBeTruthy();
  });

  it('correct name + valid URL → Switch fires, store updates, callback runs', async () => {
    const user = userEvent.setup();
    const onSwitched = vi.fn();
    renderChapterSwitch({ onSwitched });
    const nameInput = screen.getByLabelText('Type "Powder Keg WV"');
    await user.type(nameInput, 'Powder Keg WV');
    const urlInput = screen.getByLabelText('Relay URL');
    await user.type(urlInput, 'wss://relay.example.org');
    const btn = getSwitch();
    expect(btn.disabled).toBe(false);
    await user.click(btn);

    expect(useChapterStore.getState().currentRelay).toBe(
      'wss://relay.example.org',
    );
    expect(onSwitched).toHaveBeenCalledWith('wss://relay.example.org');
  });

  it('disables URL input until name confirmation matches', async () => {
    const user = userEvent.setup();
    renderChapterSwitch();
    const urlInput = screen.getByLabelText('Relay URL') as HTMLInputElement;
    expect(urlInput.disabled).toBe(true);
    await user.type(screen.getByLabelText('Type "Powder Keg WV"'), 'Powder Keg WV');
    expect((screen.getByLabelText('Relay URL') as HTMLInputElement).disabled).toBe(false);
  });

  it('warns when user pastes the current relay URL', async () => {
    const user = userEvent.setup();
    renderChapterSwitch();
    await user.type(screen.getByLabelText('Type "Powder Keg WV"'), 'Powder Keg WV');
    await user.type(screen.getByLabelText('Relay URL'), DEFAULT_RELAY);
    expect(getSwitch().disabled).toBe(true);
    expect(screen.getByText(/your current relay/i)).toBeTruthy();
  });
});
