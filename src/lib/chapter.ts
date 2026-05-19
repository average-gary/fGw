import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Default chapter relay (Powder Keg WV). */
export const DEFAULT_RELAY = 'wss://chat.virginiafreedom.tech' as const;

interface ChapterState {
  currentRelay: string;
  _set: (url: string) => void;
}

/** Internal zustand store; persisted to localStorage. */
export const useChapterStore = create<ChapterState>()(
  persist(
    (set) => ({
      currentRelay: DEFAULT_RELAY,
      _set: (url: string) => set({ currentRelay: url }),
    }),
    { name: 'compost.chapter' },
  ),
);

/** Returns true iff `url` parses as a `ws://` or `wss://` URL. */
function isValidRelayUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'wss:' || u.protocol === 'ws:';
  } catch {
    return false;
  }
}

/** Hook: subscribe to the current chapter relay. */
export function useCurrentRelay(): string {
  return useChapterStore((s) => s.currentRelay);
}

/** Set the current chapter relay. Throws on non-`ws(s)://` URLs. */
export function setCurrentRelay(url: string): void {
  if (!isValidRelayUrl(url)) {
    throw new Error(`Invalid relay URL: ${url}`);
  }
  useChapterStore.getState()._set(url);
}

/** Reset the current chapter to DEFAULT_RELAY. */
export function resetToDefault(): void {
  useChapterStore.getState()._set(DEFAULT_RELAY);
}
