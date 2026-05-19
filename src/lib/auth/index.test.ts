/**
 * SPEC-010 — auth orchestrator tests.
 *
 * We exercise the persistence + login/logout state machine without going
 * near a real relay. NIP-07 is mocked via a `window.nostr` shim;
 * `loginNsec(generate)` and `loginNsec(unlock)` use the real SPEC-009
 * implementation backed by the in-memory MemoryStore (since happy-dom has
 * no IndexedDB).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Replace happy-dom's no-op localStorage stub before any modules import it.
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
  _bootstrapForTests,
  _resetAuthForTests,
  useAuthStore,
} from './index';
import { _clearForTests as clearNsec } from './nsecLocal';

const PASS = 'correct horse battery staple';

beforeEach(async () => {
  memStore.clear();
  _resetAuthForTests();
  await clearNsec();
});

afterEach(async () => {
  await clearNsec();
});

describe('SPEC-010 useAuth orchestrator', () => {
  it('starts idle with no method when storage is empty', () => {
    const s = useAuthStore.getState();
    expect(s.method).toBeNull();
    expect(s.signer).toBeNull();
    expect(s.npub).toBeNull();
    expect(s.status).toBe('idle');
  });

  it('loginNsec(generate) → ready with method=nsec-local and npub set', async () => {
    await useAuthStore.getState().loginNsec(PASS, 'generate');
    const s = useAuthStore.getState();
    expect(s.status).toBe('ready');
    expect(s.method).toBe('nsec-local');
    expect(s.signer).not.toBeNull();
    expect(s.npub?.startsWith('npub1')).toBe(true);
  });

  it('loginNsec persists method+npub but NOT the signer', async () => {
    await useAuthStore.getState().loginNsec(PASS, 'generate');
    const raw = localStorage.getItem('compost.auth');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { state: Record<string, unknown> };
    expect(parsed.state.method).toBe('nsec-local');
    expect(typeof parsed.state.npub).toBe('string');
    expect((parsed.state.npub as string).startsWith('npub1')).toBe(true);
    // Signer must NOT be persisted (unserializable + sensitive).
    expect(parsed.state).not.toHaveProperty('signer');
  });

  it('logout clears method, signer, npub but leaves nsec record intact', async () => {
    await useAuthStore.getState().loginNsec(PASS, 'generate');
    await useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.method).toBeNull();
    expect(s.signer).toBeNull();
    expect(s.npub).toBeNull();
    expect(s.status).toBe('idle');

    // The encrypted nsec is still there — re-unlock should succeed.
    await useAuthStore.getState().loginNsec(PASS, 'unlock');
    expect(useAuthStore.getState().status).toBe('ready');
    expect(useAuthStore.getState().method).toBe('nsec-local');
  });

  it('boot with persisted method=nsec-local stays idle until passphrase provided', async () => {
    // Simulate a previous session by hand-writing the persisted shape.
    localStorage.setItem(
      'compost.auth',
      JSON.stringify({
        state: { method: 'nsec-local', npub: 'npub1stub' },
        version: 0,
      }),
    );
    // Force a fresh hydration by re-importing is heavy; instead, set the
    // store state to mirror what zustand would produce on rehydrate.
    useAuthStore.setState({
      method: 'nsec-local',
      npub: 'npub1stub',
      signer: null,
      status: 'idle',
    });
    await _bootstrapForTests();
    const s = useAuthStore.getState();
    expect(s.method).toBe('nsec-local');
    expect(s.status).toBe('idle');
    expect(s.signer).toBeNull();

    // Now provide passphrase: must seed the encrypted record first since
    // the persisted blob alone doesn't include the encrypted key.
    await useAuthStore.getState().loginNsec(PASS, 'generate');
    expect(useAuthStore.getState().status).toBe('ready');
    expect(useAuthStore.getState().npub?.startsWith('npub1')).toBe(true);
  });

  it('boot with persisted method=nip07 and no extension reports no-extension error', async () => {
    delete (globalThis as { nostr?: unknown }).nostr;
    useAuthStore.setState({
      method: 'nip07',
      npub: 'npub1stub',
      signer: null,
      status: 'idle',
    });
    await _bootstrapForTests();
    const s = useAuthStore.getState();
    expect(s.status).toBe('error');
    expect(s.error?.kind).toBe('no-extension');
  });

  it('boot with persisted method=nip46 and no stored URI reports reauth-required', async () => {
    localStorage.removeItem('nip46-uri');
    useAuthStore.setState({
      method: 'nip46',
      npub: 'npub1stub',
      signer: null,
      status: 'idle',
    });
    await _bootstrapForTests();
    const s = useAuthStore.getState();
    expect(s.status).toBe('error');
    expect(s.error?.kind).toBe('reauth-required');
  });

  it('loginNsec(unlock) with wrong passphrase surfaces the error and stays unauthenticated', async () => {
    await useAuthStore.getState().loginNsec(PASS, 'generate');
    await useAuthStore.getState().logout();
    let caught: unknown;
    try {
      await useAuthStore.getState().loginNsec('not the passphrase', 'unlock');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    const s = useAuthStore.getState();
    expect(s.status).toBe('error');
    expect(s.error?.kind).toBe('wrong-passphrase');
    expect(s.signer).toBeNull();
  });
});
