/**
 * SPEC-010 — Auth orchestrator.
 *
 * A single `useAuth()` hook that wraps the three auth methods (NIP-07,
 * NIP-46, local nsec) defined in SPEC-007/008/009. The selected method and
 * the resolved npub are persisted to localStorage; the live `NDKSigner` is
 * intentionally NOT persisted (it cannot be safely serialized).
 *
 * On boot we attempt to silently re-establish the signer:
 *   - nip07: probe `window.nostr`. If present, auto-login. If absent (e.g.
 *     a different browser), report `error.kind === 'no-extension'`.
 *   - nip46: read the stored bunker URI; if missing, report `reauth-required`.
 *   - nsec-local: stays in `idle` until the user provides a passphrase via
 *     `loginNsec(pw, 'unlock')`.
 *
 * `logout()` clears the in-memory signer + persisted method/npub. It does
 * NOT delete the encrypted nsec from IndexedDB (the user can re-unlock); it
 * does delete the cached bunker URI so a fresh handshake is forced next time.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { NDKSigner } from '@nostr-dev-kit/ndk';
import {
  detectNip07,
  loginWithNip07,
  Nip07Error,
} from './nip07';
import { connectBunker, Nip46Error } from './nip46';
import {
  generateAndStore,
  unlock as unlockNsec,
  revealNsecOnce,
  NsecLocalError,
} from './nsecLocal';

export type AuthMethod = 'nip07' | 'nip46' | 'nsec-local';
export type AuthStatus = 'idle' | 'connecting' | 'ready' | 'error';

export interface AuthErrorShape {
  kind: string;
  message: string;
}

export interface AuthState {
  method: AuthMethod | null;
  signer: NDKSigner | null;
  npub: string | null;
  status: AuthStatus;
  error?: AuthErrorShape;
}

interface AuthActions {
  logout: () => Promise<void>;
  loginNip07: () => Promise<void>;
  loginNip46: (uri: string) => Promise<void>;
  loginNsec: (passphrase: string, mode: 'generate' | 'unlock') => Promise<void>;
  revealNsec: (passphrase: string) => Promise<string>;
}

interface InternalState extends AuthState, AuthActions {
  _hydrated: boolean;
  _setHydrated: (h: boolean) => void;
  _setError: (kind: string, message: string) => void;
  _setReady: (
    method: AuthMethod,
    signer: NDKSigner,
    npub: string,
  ) => void;
}

const NIP46_URI_KEY = 'nip46-uri';

/**
 * Best-effort npub extraction from any NDKSigner. NDKUser exposes an `npub`
 * getter that lazily encodes the pubkey via nip19, so we just read that.
 */
async function npubFromSigner(signer: NDKSigner): Promise<string> {
  const user = await signer.user();
  return user.npub;
}

/** Coerce any thrown value into an `AuthErrorShape`. */
function toErrorShape(err: unknown): AuthErrorShape {
  if (err instanceof Nip07Error) {
    return { kind: err.kind, message: err.message };
  }
  if (err instanceof Nip46Error) {
    return { kind: err.kind, message: err.message };
  }
  if (err instanceof NsecLocalError) {
    return { kind: err.kind, message: err.message };
  }
  if (err instanceof Error) {
    return { kind: 'unknown', message: err.message };
  }
  return { kind: 'unknown', message: String(err) };
}

export const useAuthStore = create<InternalState>()(
  persist(
    (set, get) => ({
      method: null,
      signer: null,
      npub: null,
      status: 'idle',
      _hydrated: false,

      _setHydrated: (h) => set({ _hydrated: h }),
      _setError: (kind, message) =>
        set({ status: 'error', error: { kind, message } }),
      _setReady: (method, signer, npub) =>
        set({
          method,
          signer,
          npub,
          status: 'ready',
          error: undefined,
        }),

      async loginNip07() {
        set({ status: 'connecting', error: undefined });
        try {
          const signer = await loginWithNip07();
          const npub = await npubFromSigner(signer);
          get()._setReady('nip07', signer, npub);
        } catch (err) {
          const e = toErrorShape(err);
          set({
            status: 'error',
            error: e,
            // Keep `method` if it was already nip07 so the user can retry,
            // but clear signer.
            signer: null,
          });
          throw err;
        }
      },

      async loginNip46(uri: string) {
        set({ status: 'connecting', error: undefined });
        try {
          const signer = await connectBunker(uri);
          const npub = await npubFromSigner(signer);
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(NIP46_URI_KEY, uri);
            }
          } catch {
            /* ignore */
          }
          get()._setReady('nip46', signer, npub);
        } catch (err) {
          set({
            status: 'error',
            error: toErrorShape(err),
            signer: null,
          });
          throw err;
        }
      },

      async loginNsec(passphrase: string, mode: 'generate' | 'unlock') {
        set({ status: 'connecting', error: undefined });
        try {
          if (mode === 'generate') {
            await generateAndStore(passphrase);
          }
          const signer = await unlockNsec(passphrase);
          const npub = await npubFromSigner(signer);
          get()._setReady('nsec-local', signer, npub);
        } catch (err) {
          set({
            status: 'error',
            error: toErrorShape(err),
            signer: null,
          });
          throw err;
        }
      },

      async revealNsec(passphrase: string) {
        return revealNsecOnce(passphrase);
      },

      async logout() {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(NIP46_URI_KEY);
          }
        } catch {
          /* ignore */
        }
        set({
          method: null,
          signer: null,
          npub: null,
          status: 'idle',
          error: undefined,
        });
      },
    }),
    {
      name: 'compost.auth',
      // Persist ONLY method + npub. Signer is unserializable; status/errors
      // are runtime-only.
      partialize: (s) => ({ method: s.method, npub: s.npub }) as Partial<InternalState>,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state, error) => {
        // Mark hydration complete so the boot effect can pick it up.
        if (!error && state) {
          state._hydrated = true;
        }
      },
    },
  ),
);

/** Idempotently re-derive the signer for a persisted method on app boot. */
async function bootstrapSession(): Promise<void> {
  const s = useAuthStore.getState();
  // Only run if a method is persisted and we don't already have a signer.
  if (!s.method || s.signer) return;
  if (s.status === 'connecting') return;

  if (s.method === 'nip07') {
    if (!detectNip07()) {
      useAuthStore.setState({
        status: 'error',
        error: {
          kind: 'no-extension',
          message:
            'No NIP-07 extension detected. Reconnect to continue with this account.',
        },
      });
      return;
    }
    try {
      await s.loginNip07();
    } catch {
      /* error is already set on the store */
    }
    return;
  }

  if (s.method === 'nip46') {
    let uri: string | null = null;
    try {
      uri =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(NIP46_URI_KEY)
          : null;
    } catch {
      uri = null;
    }
    if (!uri) {
      useAuthStore.setState({
        status: 'error',
        error: {
          kind: 'reauth-required',
          message:
            'Bunker session expired. Paste your bunker URI to reconnect.',
        },
      });
      return;
    }
    try {
      await s.loginNip46(uri);
    } catch {
      /* error already set */
    }
    return;
  }

  if (s.method === 'nsec-local') {
    // Need passphrase from user. Stay idle so the unlock UI prompts.
    if (s.status !== 'idle') {
      useAuthStore.setState({ status: 'idle', error: undefined });
    }
  }
}

let bootstrapPromise: Promise<void> | null = null;

/**
 * `useAuth()` — public hook. Subscribes to the store and kicks off a
 * one-shot bootstrap on first call so persisted sessions auto-resume.
 */
export function useAuth(): AuthState & AuthActions {
  const state = useAuthStore();

  useEffect(() => {
    if (!bootstrapPromise) {
      bootstrapPromise = bootstrapSession();
    }
  }, []);

  const out: AuthState & AuthActions = {
    method: state.method,
    signer: state.signer,
    npub: state.npub,
    status: state.status,
    logout: state.logout,
    loginNip07: state.loginNip07,
    loginNip46: state.loginNip46,
    loginNsec: state.loginNsec,
    revealNsec: state.revealNsec,
  };
  if (state.error !== undefined) {
    out.error = state.error;
  }
  return out;
}

/** Test-only: drop in-memory state and clear the bootstrap latch. */
export function _resetAuthForTests(): void {
  bootstrapPromise = null;
  useAuthStore.setState({
    method: null,
    signer: null,
    npub: null,
    status: 'idle',
    error: undefined,
  });
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('compost.auth');
      localStorage.removeItem(NIP46_URI_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Test-only: kick the boot path explicitly (waits for completion). */
export async function _bootstrapForTests(): Promise<void> {
  bootstrapPromise = bootstrapSession();
  await bootstrapPromise;
}
