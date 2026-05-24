/**
 * Phase 2 tests — React error boundary captures render-phase errors and
 * persists them via the same on-device queue used by the window-level
 * handlers in `@/lib/crashReports`.
 *
 * We install an in-memory `localStorage` shim before module load (same
 * pattern as `pyramid.test.ts` / `App.test.tsx`).
 *
 * React error boundaries log the captured error to `console.error` even
 * when caught — silenced per-test to keep the suite output readable.
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

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CrashBoundary } from './CrashBoundary';
import {
  CRASH_REPORT_STORAGE_KEY,
  getQueuedReports,
} from '@/lib/crashReports';

function Boom({ message = 'render-time boom' }: { message?: string }): never {
  throw new Error(message);
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  memStore.clear();
  // React logs caught errors to console.error; silence to keep test output
  // readable. Other unrelated errors will still surface via assertions.
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  consoleErrorSpy.mockRestore();
});

describe('CrashBoundary', () => {
  it('renders children when no error is thrown', () => {
    render(
      <CrashBoundary>
        <p>hello world</p>
      </CrashBoundary>,
    );
    expect(screen.getByText('hello world')).toBeTruthy();
  });

  it('renders the fallback UI with a Reload button when a child throws', () => {
    render(
      <CrashBoundary>
        <Boom />
      </CrashBoundary>,
    );
    expect(screen.getByText(/Something went wrong/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reload/i })).toBeTruthy();
  });

  it('persists a CrashReport to localStorage when a child throws', () => {
    render(
      <CrashBoundary>
        <Boom message="boundary-persist" />
      </CrashBoundary>,
    );
    const queue = getQueuedReports();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.error_message).toBe('boundary-persist');
    // Sanity: the slot key is the one production code uses.
    expect(localStorage.getItem(CRASH_REPORT_STORAGE_KEY)).not.toBeNull();
  });

  it('reload button calls window.location.reload', () => {
    const reloadSpy = vi
      .spyOn(window.location, 'reload')
      .mockImplementation(() => {});
    render(
      <CrashBoundary>
        <Boom />
      </CrashBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Reload/i }));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    reloadSpy.mockRestore();
  });
});
