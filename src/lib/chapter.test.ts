import { beforeEach, describe, expect, it, vi } from 'vitest';

// Install a real Storage shim BEFORE any imports run. Node 25 ships a stub
// `localStorage` (no methods) that shadows happy-dom's, so we replace it with
// a Map-backed implementation. `vi.hoisted` runs before module imports.
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
  DEFAULT_RELAY,
  resetToDefault,
  setCurrentRelay,
  useChapterStore,
} from './chapter';

const STORAGE_KEY = 'compost.chapter';

beforeEach(() => {
  memStore.clear();
  resetToDefault();
});

describe('chapter store', () => {
  it('defaults to DEFAULT_RELAY', () => {
    expect(useChapterStore.getState().currentRelay).toBe(DEFAULT_RELAY);
    expect(DEFAULT_RELAY).toBe('wss://chat.virginiafreedom.tech');
  });

  it('setCurrentRelay updates the store', () => {
    setCurrentRelay('wss://other.example');
    expect(useChapterStore.getState().currentRelay).toBe('wss://other.example');
  });

  it('accepts ws:// URLs', () => {
    setCurrentRelay('ws://localhost:7777');
    expect(useChapterStore.getState().currentRelay).toBe('ws://localhost:7777');
  });

  it('persists to localStorage on set', () => {
    setCurrentRelay('wss://persisted.example');
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(raw!).toContain('wss://persisted.example');
  });

  it('rejects non-ws(s) URLs', () => {
    expect(() => setCurrentRelay('http://nope.example')).toThrow();
    expect(() => setCurrentRelay('https://nope.example')).toThrow();
  });

  it('rejects malformed URLs', () => {
    expect(() => setCurrentRelay('not a url')).toThrow();
    expect(() => setCurrentRelay('')).toThrow();
  });

  it('resetToDefault returns to DEFAULT_RELAY', () => {
    setCurrentRelay('wss://other.example');
    resetToDefault();
    expect(useChapterStore.getState().currentRelay).toBe(DEFAULT_RELAY);
  });
});
