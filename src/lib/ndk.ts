import NDK, { type NDKConstructorParams, type NDKRelay } from '@nostr-dev-kit/ndk';
import { useChapterStore } from './chapter';

/**
 * NDK singleton bound to exactly one relay (the current chapter relay).
 *
 * Architectural rules:
 * - Exactly one relay in the pool at any time. No outbox, no fallback,
 *   no additional read-relays.
 * - When the chapter relay changes, the singleton is invalidated and the
 *   next call to `getNdk()` builds a new NDK pointing at the new relay.
 * - Unhandled relay errors surface via toast (no silent retries on a
 *   different relay).
 */

let _ndk: NDK | null = null;
let _relayUrl: string | null = null;

/**
 * The current chapter relay URL. Thin wrapper around the chapter store
 * so callers never have to import zustand directly.
 */
export function currentRelay(): string {
  return useChapterStore.getState().currentRelay;
}

/**
 * Pluggable toast hook. The Toast UI is React-only; this allows the
 * `Toast.tsx` provider (or tests) to register a non-React listener that
 * forwards relay errors as toasts. Module-level wiring keeps `ndk.ts`
 * free of React imports.
 */
export type RelayToast = (msg: { title: string; description?: string }) => void;
let _toast: RelayToast | null = null;

/**
 * Register a function that will be invoked for unhandled relay errors
 * (disconnects, error notices). Pass `null` to clear.
 *
 * Wired once at app boot from a tiny adapter near the React tree
 * (e.g. inside `ToastProvider`'s mounting code) so we get user-visible
 * notifications without `ndk.ts` depending on React.
 */
export function setRelayToast(toast: RelayToast | null): void {
  _toast = toast;
}

function emitToast(title: string, description?: string): void {
  if (_toast) _toast({ title, description });
}

/**
 * Tear down the existing NDK (if any). NDK 2.18 exposes per-relay
 * `disconnect()`; the pool itself has no top-level disconnect, so we
 * iterate `pool.relays` and call disconnect on each.
 */
async function tearDown(ndk: NDK | null): Promise<void> {
  if (!ndk) return;
  try {
    const relays = ndk.pool?.relays;
    if (relays && typeof relays.forEach === 'function') {
      relays.forEach((relay: NDKRelay) => {
        try {
          relay.disconnect();
        } catch {
          /* swallow individual relay disconnect errors */
        }
      });
    }
  } catch {
    /* if pool is unusable for any reason, drop the reference */
  }
}

function buildNdk(url: string): NDK {
  const opts: NDKConstructorParams = {
    explicitRelayUrls: [url],
    // Outbox model is opt-out; we explicitly disable it. Single relay only.
    enableOutboxModel: false,
    autoConnectUserRelays: false,
  };
  const ndk = new NDK(opts);

  // Wire pool error events -> toast. NDK pool emits `notice` for relay
  // notices and `relay:disconnect` when a relay drops.
  ndk.pool.on('notice', (relay: NDKRelay, notice: string) => {
    // Many relays send benign notices (rate-limit info, debug). Surface
    // anything that looks like an error to the user.
    if (typeof notice === 'string' && /error|invalid|fail/i.test(notice)) {
      emitToast('Relay error', `${relay?.url ?? url}: ${notice}`);
    }
  });
  ndk.pool.on('relay:disconnect', (relay: NDKRelay) => {
    emitToast('Relay disconnected', relay?.url ?? url);
  });

  // Fire-and-forget connect; consumers handle async loading themselves.
  void ndk.connect().catch((err: unknown) => {
    emitToast(
      'Relay connection failed',
      err instanceof Error ? err.message : String(err),
    );
  });

  return ndk;
}

/**
 * Lazy NDK singleton. Rebuilds when the chapter relay URL has changed.
 * Always returns an NDK whose pool contains exactly the current relay.
 */
export function getNdk(): NDK {
  const url = currentRelay();
  if (_ndk && _relayUrl === url) return _ndk;

  // Relay changed (or first call): tear down old, build new.
  const old = _ndk;
  _ndk = buildNdk(url);
  _relayUrl = url;
  // Disconnect old pool *after* swapping the reference so any concurrent
  // `getNdk()` callers see the new instance immediately.
  void tearDown(old);
  return _ndk;
}

/**
 * Defensive helper: if a future caller tries to widen the relay set,
 * ignore it loudly. SPEC-005 forbids additional relays.
 */
export function addRelay(_url: string): void {
  // eslint-disable-next-line no-console
  console.warn(
    '[ndk] addRelay() ignored: SPEC-005 forbids additional relays. ' +
      'Use the chapter store to switch the single bound relay.',
  );
}

// On chapter-store change: invalidate the singleton. The next `getNdk()`
// call will rebuild and tear down the prior instance.
useChapterStore.subscribe((state, prev) => {
  if (state.currentRelay === prev.currentRelay) return;
  const old = _ndk;
  _ndk = null;
  _relayUrl = null;
  void tearDown(old);
});
