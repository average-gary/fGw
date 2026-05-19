import type NDK from '@nostr-dev-kit/ndk';
import { useChapterStore } from './chapter';
import { getNdk } from './ndk';

/**
 * React hook that returns the current NDK singleton. Re-renders when the
 * chapter relay changes by subscribing to `useChapterStore`. The hook
 * does NOT trigger any connect on its own; `getNdk()` already kicks off
 * connection on first construction.
 */
export function useNdk(): NDK {
  // Subscribing to currentRelay triggers re-render on relay change.
  useChapterStore((s) => s.currentRelay);
  return getNdk();
}
