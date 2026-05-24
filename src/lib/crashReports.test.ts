/**
 * Phase 2 tests — error-handler install, persistence, queue API.
 *
 * Strategy mirrors `src/lib/pyramid.test.ts:24-51`: install an in-memory
 * `MemoryStorage` shim before any module load and reset it between tests
 * so leakage from one case doesn't pollute the next.
 *
 * happy-dom note: `ErrorEvent` is a real constructor, but
 * `PromiseRejectionEvent` is undefined. The unhandledrejection tests
 * dispatch a plain `Event` and attach `reason` via `Object.defineProperty`
 * — production code reads `(ev as Event & { reason?: unknown }).reason`,
 * so the shapes line up.
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

import {
  CRASH_REPORT_STORAGE_KEY,
  clearAllReports,
  clearReport,
  enqueueReport,
  getQueuedReports,
  installCrashHandlers,
} from './crashReports';
import {
  CRASH_REPORT_QUEUE_CAP,
  CRASH_REPORT_VERSION,
  type CrashReport,
} from '@/domain/crashReports';

function makeReport(ts: number, message = 'boom'): CrashReport {
  return {
    version: CRASH_REPORT_VERSION,
    ts,
    app_version: 'test',
    commit_sha: 'test',
    platform: 'test',
    error_name: 'Error',
    error_message: message,
    stack: '',
  };
}

let activeUninstall: (() => void) | null = null;

beforeEach(() => {
  memStore.clear();
});

afterEach(() => {
  // Make sure module-level install state is reset; otherwise a test that
  // forgets to uninstall would leak listeners into the next case.
  if (activeUninstall) {
    activeUninstall();
    activeUninstall = null;
  }
});

describe('crashReports — installCrashHandlers', () => {
  it('queues a report on a synthetic window error event', () => {
    activeUninstall = installCrashHandlers();
    const ev = new ErrorEvent('error', {
      error: new Error('install-test boom'),
      message: 'install-test boom',
    });
    window.dispatchEvent(ev);
    const queue = getQueuedReports();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.error_message).toBe('install-test boom');
  });

  it('queues a report on a synthetic unhandledrejection event', () => {
    activeUninstall = installCrashHandlers();
    // happy-dom lacks PromiseRejectionEvent; dispatch a plain Event with a
    // `reason` property. Production code reads `ev.reason` either way.
    const ev = new Event('unhandledrejection');
    Object.defineProperty(ev, 'reason', {
      value: new Error('rejection-test'),
      configurable: true,
    });
    window.dispatchEvent(ev);
    const queue = getQueuedReports();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.error_message).toBe('rejection-test');
  });

  it('returns an uninstall function that removes both listeners', () => {
    const uninstall = installCrashHandlers();
    uninstall();
    activeUninstall = null;

    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new Error('post-uninstall'),
        message: 'post-uninstall',
      }),
    );
    const ev = new Event('unhandledrejection');
    Object.defineProperty(ev, 'reason', {
      value: new Error('post-uninstall-rej'),
      configurable: true,
    });
    window.dispatchEvent(ev);

    expect(getQueuedReports()).toHaveLength(0);
  });

  it('is idempotent: calling twice without uninstalling installs only once', () => {
    const u1 = installCrashHandlers();
    const u2 = installCrashHandlers();
    activeUninstall = u1;
    expect(u1).toBe(u2);

    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new Error('idempotent'),
        message: 'idempotent',
      }),
    );
    // If listeners were registered twice we'd see two queued reports.
    expect(getQueuedReports()).toHaveLength(1);

    // A single uninstall removes both registrations cleanly.
    u1();
    activeUninstall = null;
    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new Error('after-uninstall'),
        message: 'after-uninstall',
      }),
    );
    expect(getQueuedReports()).toHaveLength(1);
  });
});

describe('crashReports — queue cap + clears', () => {
  it('evicts the oldest entry when appending past the cap', () => {
    const seeded = Array.from({ length: CRASH_REPORT_QUEUE_CAP }, (_, i) =>
      makeReport(1000 + i, `seed-${i}`),
    );
    localStorage.setItem(CRASH_REPORT_STORAGE_KEY, JSON.stringify(seeded));

    enqueueReport(new Error('overflow'));

    const queue = getQueuedReports();
    expect(queue).toHaveLength(CRASH_REPORT_QUEUE_CAP);
    // Oldest seed (ts=1000) must be gone; newest seed survives.
    expect(queue.find((r) => r.ts === 1000)).toBeUndefined();
    expect(
      queue.find((r) => r.ts === 1000 + CRASH_REPORT_QUEUE_CAP - 1),
    ).toBeDefined();
    // The new overflow report is at the tail.
    expect(queue[queue.length - 1]?.error_message).toBe('overflow');
  });

  it('clearReport(ts) removes one matching entry', () => {
    const seeded = [makeReport(100, 'a'), makeReport(200, 'b'), makeReport(300, 'c')];
    localStorage.setItem(CRASH_REPORT_STORAGE_KEY, JSON.stringify(seeded));

    clearReport(200);

    const queue = getQueuedReports();
    expect(queue).toHaveLength(2);
    expect(queue.map((r) => r.ts)).toEqual([100, 300]);
  });

  it('clearAllReports() empties the queue', () => {
    const seeded = [makeReport(1, 'a'), makeReport(2, 'b')];
    localStorage.setItem(CRASH_REPORT_STORAGE_KEY, JSON.stringify(seeded));

    clearAllReports();

    expect(getQueuedReports()).toHaveLength(0);
    expect(localStorage.getItem(CRASH_REPORT_STORAGE_KEY)).toBeNull();
  });
});

describe('crashReports — getQueuedReports defensive reads', () => {
  it('returns [] when localStorage is empty', () => {
    expect(getQueuedReports()).toEqual([]);
  });

  it('returns [] and does not throw when stored JSON is corrupt', () => {
    localStorage.setItem(CRASH_REPORT_STORAGE_KEY, '{not json');
    expect(() => getQueuedReports()).not.toThrow();
    expect(getQueuedReports()).toEqual([]);
  });

  it('filters out entries that fail the shape check', () => {
    const mixed = [
      makeReport(1, 'good'),
      { ts: 2, junk: true },
      'string-not-object',
      makeReport(3, 'also-good'),
    ];
    localStorage.setItem(CRASH_REPORT_STORAGE_KEY, JSON.stringify(mixed));
    const queue = getQueuedReports();
    expect(queue).toHaveLength(2);
    expect(queue.map((r) => r.error_message)).toEqual(['good', 'also-good']);
  });
});

describe('crashReports — write failure is non-fatal', () => {
  it('drops the report silently when localStorage.setItem throws', () => {
    const original = localStorage.setItem.bind(localStorage);
    const spy = vi
      .spyOn(localStorage, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    expect(() => enqueueReport(new Error('quota-test'))).not.toThrow();

    spy.mockRestore();
    // Restoring the spy doesn't restore the original binding under happy-dom
    // in all cases; explicitly re-bind so subsequent tests aren't poisoned.
    localStorage.setItem = original;

    // The slot was never written, so the queue is still empty.
    expect(getQueuedReports()).toEqual([]);
  });
});
